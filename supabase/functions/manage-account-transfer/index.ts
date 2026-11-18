
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const isValidUUID = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isValidDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      message: "Method not allowed",
    }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({
        success: false,
        message: "Authentication required",
      }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({
        success: false,
        message: "Invalid session",
      }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || profile.is_active !== true) {
      return jsonResponse({
        success: false,
        message: "Active staff account required",
      }, 403);
    }

    if (!["owner", "manager", "accounts_staff"].includes(profile.role)) {
      return jsonResponse({
        success: false,
        message: "Permission denied",
      }, 403);
    }

    const body = await req.json();

    const fromAccountId = body.from_account_id;
    const toAccountId = body.to_account_id;
    const amountText = String(body.amount ?? "");
    const amount = Number(amountText);

    const transferDate = body.transfer_date ??
      new Date().toISOString().slice(0, 10);

    const referenceNumber = String(body.reference_number ?? "").trim();
    const notes = String(body.notes ?? "").trim();

    if (!isValidUUID(fromAccountId) || !isValidUUID(toAccountId)) {
      return jsonResponse({
        success: false,
        message: "Invalid account selection",
      }, 400);
    }

    if (fromAccountId === toAccountId) {
      return jsonResponse({
        success: false,
        message: "Choose two different accounts",
      }, 400);
    }

    if (
      !/^\d{1,12}(\.\d{1,2})?$/.test(amountText) ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return jsonResponse({
        success: false,
        message: "Enter a valid transfer amount",
      }, 400);
    }

    if (!isValidDate(transferDate)) {
      return jsonResponse({
        success: false,
        message: "Invalid transfer date",
      }, 400);
    }

    if (transferDate > new Date().toISOString().slice(0, 10)) {
      return jsonResponse({
        success: false,
        message: "Transfer date cannot be in the future",
      }, 400);
    }

    if (referenceNumber.length > 100 || notes.length > 1000) {
      return jsonResponse({
        success: false,
        message: "Input is too long",
      }, 400);
    }

    const { data, error } = await adminClient.rpc(
      "create_account_transfer",
      {
        p_from_account_id: fromAccountId,
        p_to_account_id: toAccountId,
        p_amount: amount,
        p_transfer_date: transferDate,
        p_reference_number: referenceNumber || null,
        p_notes: notes || null,
      },
    );

    if (error) {
      console.error("Account transfer RPC error:", error.message);

      return jsonResponse({
        success: false,
        message: "Transfer could not be completed. Check the account balance and try again.",
      }, 400);
    }

    return jsonResponse(data);
  } catch (error) {
    console.error("manage-account-transfer error:", error);

    return jsonResponse({
      success: false,
      message: "An unexpected server error occurred",
    }, 500);
  }
});
