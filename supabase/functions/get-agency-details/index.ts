import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UI pages read "error"; other pages read "message". Send both.
const respond = (
  body: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status: number) =>
  respond({ success: false, error: message, message }, status);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed.", 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!url || !anonKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return fail("Authentication required.", 401);
    }

    // User-scoped client: the SQL function checks the user's role.
    // Never use a service-role client for this RPC.
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("Invalid or expired session.", 401);
    }

    const body = await req.json().catch(() => ({}));

    const agencyId = body?.agency_id;

    if (typeof agencyId !== "string" || !uuidPattern.test(agencyId)) {
      return fail("A valid agency ID is required.", 400);
    }

    const page = Number.isInteger(body?.page) ? body.page : 1;
    const pageSize = Number.isInteger(body?.page_size)
      ? body.page_size
      : 10;

    const dateFrom = null;
    const dateTo = null;
    const transactionType = "all";
    const search = "";

    const { data, error } = await supabase.rpc(
      "get_agency_account_statement",
      {
        p_agency_id: agencyId,
        p_page: page,
        p_page_size: pageSize,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_transaction_type: transactionType,
        p_search: search,
      },
    );

    if (error) {
      console.error("get_agency_account_statement error:", error.message);

      const denied = /permission|active staff|authentication/i
        .test(error.message);

      return fail(
        denied
          ? "You do not have permission to view agency accounts."
          : "Unable to retrieve agency account information.",
        denied ? 403 : 400,
      );
    }

    if (!data || data.success !== true) {
      return fail(data?.message || "Agency not found.", 404);
    }

    return respond(data);
  } catch (error) {
    console.error(
      "get-agency-details error:",
      error instanceof Error ? error.message : error,
    );

    return fail("An unexpected server error occurred.", 500);
  }
});
