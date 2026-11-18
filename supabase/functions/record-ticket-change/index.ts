
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = [
  "owner",
  "manager",
  "ticket_staff",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonResponse = (
    body: Record<string, unknown>,
    status = 200
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, message: "Method not allowed." },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(
        { success: false, message: "Invalid or expired session." },
        401
      );
    }

    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      !allowedRoles.includes(profile.role)
    ) {
      return jsonResponse(
        { success: false, message: "Permission denied." },
        403
      );
    }

    const body = await req.json();

    const {
      sale_passenger_id,
      change_type,
      reason,
      old_details,
      new_details,
      reference,
    } = body;

    const validChangeTypes = [
      "date_change",
      "route_change",
      "name_correction",
      "reissue",
    ];

    if (
      typeof sale_passenger_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sale_passenger_id
      )
    ) {
      return jsonResponse(
        { success: false, message: "Invalid ticket passenger ID." },
        400
      );
    }

    if (!validChangeTypes.includes(change_type)) {
      return jsonResponse(
        { success: false, message: "Invalid change type." },
        400
      );
    }

    if (
      typeof reason !== "string" ||
      reason.trim().length < 3 ||
      reason.length > 1000
    ) {
      return jsonResponse(
        { success: false, message: "A valid reason is required." },
        400
      );
    }

    if (
      !old_details ||
      typeof old_details !== "object" ||
      Array.isArray(old_details) ||
      !new_details ||
      typeof new_details !== "object" ||
      Array.isArray(new_details)
    ) {
      return jsonResponse(
        { success: false, message: "Invalid ticket change details." },
        400
      );
    }

    const { data: passenger, error: passengerError } =
      await adminClient
        .from("sale_passengers")
        .select("id, sale_id")
        .eq("id", sale_passenger_id)
        .maybeSingle();

    if (passengerError || !passenger) {
      return jsonResponse(
        { success: false, message: "Ticket passenger not found." },
        404
      );
    }

    const { data, error } = await userClient.rpc(
      "record_ticket_change",
      {
        p_sale_passenger_id: sale_passenger_id,
        p_change_type: change_type,
        p_reason: reason.trim(),
        p_old_details: old_details,
        p_new_details: new_details,
        p_reference: reference || null,
        p_user_id: user.id,
      }
    );

    if (error) {
      console.error("Ticket change RPC error:", error);

      return jsonResponse(
        {
          success: false,
          message: "Unable to record ticket change.",
        },
        400
      );
    }

    return jsonResponse({
      success: true,
      message: "Ticket change history recorded successfully.",
      data,
    });
  } catch (error) {
    console.error("Ticket change error:", error);

    return jsonResponse(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
