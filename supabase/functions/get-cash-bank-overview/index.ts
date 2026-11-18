
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

    const allowedAccountTypes = [
      "all",
      "cash",
      "bank",
      "mobile_banking",
    ];

    const allowedTransactionTypes = [
      "all",
      "credit",
      "debit",
      "transfer",
    ];

    const accountType = String(body.account_type ?? "all");
    const transactionType = String(body.transaction_type ?? "all");

    if (!allowedAccountTypes.includes(accountType)) {
      return jsonResponse({
        success: false,
        message: "Invalid account type",
      }, 400);
    }

    if (!allowedTransactionTypes.includes(transactionType)) {
      return jsonResponse({
        success: false,
        message: "Invalid transaction type",
      }, 400);
    }

    const page = Number(body.page ?? 1);
    const pageSize = Number(body.page_size ?? 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return jsonResponse({
        success: false,
        message: "Invalid pagination values",
      }, 400);
    }

    const search = String(body.search ?? "").trim();

    if (search.length > 100) {
      return jsonResponse({
        success: false,
        message: "Search text is too long",
      }, 400);
    }

    const accountId =
      body.account_id && body.account_id !== "all"
        ? String(body.account_id)
        : null;

    if (
      accountId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)
    ) {
      return jsonResponse({
        success: false,
        message: "Invalid account ID",
      }, 400);
    }

    const dateFrom = body.date_from || null;
    const dateTo = body.date_to || null;

    const validDate = (value: unknown) =>
      value === null ||
      (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
      );

    if (!validDate(dateFrom) || !validDate(dateTo)) {
      return jsonResponse({
        success: false,
        message: "Invalid date filter",
      }, 400);
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      return jsonResponse({
        success: false,
        message: "Invalid date range",
      }, 400);
    }

    const { data, error } = await adminClient.rpc(
      "get_cash_bank_overview",
      {
        p_account_type: accountType,
        p_search: search,
        p_account_id: accountId,
        p_transaction_type: transactionType,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_page: page,
        p_page_size: pageSize,
      },
    );

    if (error) {
      console.error("Cash bank overview RPC error:", error.message);

      return jsonResponse({
        success: false,
        message: "Unable to load cash and bank information",
      }, 400);
    }

    return jsonResponse(data);
  } catch (error) {
    console.error("get-cash-bank-overview error:", error);

    return jsonResponse({
      success: false,
      message: "An unexpected server error occurred",
    }, 500);
  }
});
