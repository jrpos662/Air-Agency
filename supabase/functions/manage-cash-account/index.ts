
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(data: unknown, status = 200) {
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
    return response({ success: false, message: "Method not allowed" }, 405);
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
      return response({ success: false, message: "Unauthorized" }, 401);
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
      return response({ success: false, message: "Invalid session" }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || profile.is_active !== true) {
      return response({ success: false, message: "Active staff account required" }, 403);
    }

    if (!["owner", "manager", "accounts_staff"].includes(profile.role)) {
      return response({ success: false, message: "Permission denied" }, 403);
    }

    const body = await req.json();

    if (body.action !== "create") {
      return response({ success: false, message: "Invalid action" }, 400);
    }

    const accountName = String(body.account_name ?? "").trim();
    const accountType = String(body.account_type ?? "");
    const bankName = String(body.bank_name ?? "").trim();
    const accountNumber = String(body.account_number ?? "").trim();
    const notes = String(body.notes ?? "").trim();

    const openingBalance = Number(body.opening_balance ?? 0);
    const openingDate = String(
      body.opening_date ?? new Date().toISOString().slice(0, 10),
    );

    if (!accountName || accountName.length > 120) {
      return response({ success: false, message: "Invalid account name" }, 400);
    }

    if (!["cash", "bank", "mobile_banking"].includes(accountType)) {
      return response({ success: false, message: "Invalid account type" }, 400);
    }

    if (
      !Number.isFinite(openingBalance) ||
      openingBalance < 0 ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(String(body.opening_balance ?? 0))
    ) {
      return response({ success: false, message: "Invalid opening balance" }, 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) {
      return response({ success: false, message: "Invalid opening date" }, 400);
    }

    const parsedDate = new Date(`${openingDate}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== openingDate ||
      openingDate > new Date().toISOString().slice(0, 10)
    ) {
      return response({ success: false, message: "Opening date cannot be in the future" }, 400);
    }

    if (bankName.length > 120 || accountNumber.length > 80 || notes.length > 1000) {
      return response({ success: false, message: "Input is too long" }, 400);
    }

    const { data, error } = await adminClient.rpc(
      "create_cash_account_with_opening_balance",
      {
        p_account_name: accountName,
        p_account_type: accountType,
        p_bank_name: bankName || null,
        p_account_number: accountNumber || null,
        p_opening_balance: openingBalance,
        p_opening_date: openingDate,
        p_notes: notes || null,
      },
    );

    if (error) {
      console.error("Account creation RPC failed:", error.message);
      return response({
        success: false,
        message: "Could not create the account. Please check the details and try again.",
      }, 400);
    }

    return response(data);
  } catch (error) {
    console.error("manage-cash-account error:", error);

    return response({
      success: false,
      message: "An unexpected server error occurred",
    }, 500);
  }
});
