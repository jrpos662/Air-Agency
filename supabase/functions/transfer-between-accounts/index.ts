
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
  "accounts_staff",
];

Deno.serve(async (req: Request) => {
  const respond = (
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

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(
      { success: false, message: "Method not allowed." },
      405
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return respond(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const userClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: { persistSession: false },
    });

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return respond(
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
      return respond(
        { success: false, message: "Permission denied." },
        403
      );
    }

    const body = await req.json();

    const {
      from_account_id,
      to_account_id,
      amount,
      transfer_date,
      reference,
      notes,
    } = body;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof from_account_id !== "string" ||
      !uuidPattern.test(from_account_id) ||
      typeof to_account_id !== "string" ||
      !uuidPattern.test(to_account_id)
    ) {
      return respond(
        { success: false, message: "Invalid account ID." },
        400
      );
    }

    if (from_account_id === to_account_id) {
      return respond(
        {
          success: false,
          message: "Source and destination accounts must be different.",
        },
        400
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000000
    ) {
      return respond(
        { success: false, message: "Invalid transfer amount." },
        400
      );
    }

    if (
      typeof transfer_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(transfer_date) ||
      !Number.isFinite(Date.parse(transfer_date))
    ) {
      return respond(
        { success: false, message: "Invalid transfer date." },
        400
      );
    }

    if (
      reference != null &&
      (typeof reference !== "string" || reference.length > 100)
    ) {
      return respond(
        { success: false, message: "Invalid reference." },
        400
      );
    }

    if (
      notes != null &&
      (typeof notes !== "string" || notes.length > 1000)
    ) {
      return respond(
        { success: false, message: "Invalid notes." },
        400
      );
    }

    const { data, error } = await userClient.rpc(
      "transfer_between_accounts",
      {
        p_from_account_id: from_account_id,
        p_to_account_id: to_account_id,
        p_amount: amount,
        p_transfer_date: transfer_date,
        p_reference: reference || null,
        p_notes: notes || null,
        p_user_id: user.id,
      }
    );

    if (error) {
      console.error("Account transfer RPC error:", error);

      return respond(
        {
          success: false,
          message: "Unable to complete account transfer.",
        },
        400
      );
    }

    return respond({
      success: true,
      message: "Account transfer completed successfully.",
      data,
    });
  } catch (error) {
    console.error("Account transfer error:", error);

    return respond(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
