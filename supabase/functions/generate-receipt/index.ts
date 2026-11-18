
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
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

    const adminClient = createClient(url, serviceKey, {
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

    const saleId = body.sale_id;
    const receiptType = body.receipt_type;

    if (
      typeof saleId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        saleId
      )
    ) {
      return respond(
        { success: false, message: "Invalid sale ID." },
        400
      );
    }

    if (!["receipt", "invoice"].includes(receiptType)) {
      return respond(
        { success: false, message: "Invalid document type." },
        400
      );
    }

    // Confirm that the sale exists.
    const { data: sale, error: saleError } =
      await userClient
        .from("ticket_sales")
        .select("id, customer_id, sale_date, selling_total, status")
        .eq("id", saleId)
        .maybeSingle();

    if (saleError || !sale) {
      return respond(
        { success: false, message: "Ticket sale not found or inaccessible." },
        404
      );
    }

    // Create the receipt/invoice record through a protected RPC.
    const { data, error } = await userClient.rpc(
      "generate_sale_document",
      {
        p_sale_id: saleId,
        p_document_type: receiptType,
        p_user_id: user.id,
      }
    );

    if (error) {
      console.error("Document RPC error:", error);

      return respond(
        {
          success: false,
          message: "Unable to generate document.",
        },
        400
      );
    }

    return respond({
      success: true,
      message: "Document generated successfully.",
      document: data,
    });
  } catch (error) {
    console.error("Generate receipt error:", error);

    return respond(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
