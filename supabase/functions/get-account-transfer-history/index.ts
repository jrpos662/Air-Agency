
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405);
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
      return jsonResponse({ success: false, message: "Unauthorized" }, 401);
    }

    // User-scoped client: preserves auth.uid() for the SQL RPC.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const token = authorization.replace("Bearer ", "");
    const { data: authData, error: authError } =
      await userClient.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: "Invalid session" }, 401);
    }

    // Admin client is used only for staff-role verification.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.is_active !== true) {
      return jsonResponse(
        { success: false, message: "Active staff account required" },
        403,
      );
    }

    const allowedRoles = ["owner", "manager", "accounts_staff"];

    if (!allowedRoles.includes(profile.role)) {
      return jsonResponse(
        { success: false, message: "You do not have permission" },
        403,
      );
    }

    const body = await req.json();

    const search =
      typeof body.search === "string" ? body.search.trim() : "";

    const page = Number(body.page ?? 1);
    const pageSize = Number(body.page_size ?? 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return jsonResponse(
        { success: false, message: "Invalid pagination values" },
        400,
      );
    }

    if (search.length > 100) {
      return jsonResponse(
        { success: false, message: "Search text is too long" },
        400,
      );
    }

    const dateFrom = body.date_from || null;
    const dateTo = body.date_to || null;

    const validDate = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

    if (!validDate(dateFrom) || !validDate(dateTo)) {
      return jsonResponse(
        { success: false, message: "Invalid date format" },
        400,
      );
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      return jsonResponse(
        { success: false, message: "Invalid date range" },
        400,
      );
    }

    // IMPORTANT: Use userClient, not adminClient.
    // The SQL function depends on auth.uid().
    const { data, error } = await userClient.rpc(
      "get_account_transfer_history",
      {
        p_search: search,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_page: page,
        p_page_size: pageSize,
      },
    );

    if (error) {
      console.error("Transfer history RPC error:", error.message);
      return jsonResponse(
        { success: false, message: "Unable to load transfer history" },
        400,
      );
    }

    return jsonResponse(data);
  } catch (error) {
    console.error("Transfer history error:", error);

    return jsonResponse(
      {
        success: false,
        message: "An unexpected server error occurred",
      },
      500,
    );
  }
});
