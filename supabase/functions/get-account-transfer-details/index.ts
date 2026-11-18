
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({
      success: false,
      message: "Method not allowed",
    }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({
        success: false,
        message: "Authentication required.",
      }, 401);
    }

    // Preserve the user's JWT for auth.uid() in PostgreSQL.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const token = authorization.substring(7);

    const { data: authData, error: authError } =
      await userClient.auth.getUser(token);

    if (authError || !authData.user) {
      return response({
        success: false,
        message: "Invalid or expired session.",
      }, 401);
    }

    // Service-role client is only used to verify staff profile.
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role, is_active")
        .eq("id", authData.user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.is_active !== true
    ) {
      return response({
        success: false,
        message: "Active staff account required.",
      }, 403);
    }

    const allowedRoles = [
      "owner",
      "manager",
      "accounts_staff",
    ];

    if (!allowedRoles.includes(profile.role)) {
      return response({
        success: false,
        message: "You do not have permission.",
      }, 403);
    }

    const body = await req.json();

    const transferId = body.transfer_id;

    // Validate UUID
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      typeof transferId !== "string" ||
      !uuidPattern.test(transferId)
    ) {
      return response({
        success: false,
        message: "A valid transfer ID is required.",
      }, 400);
    }

    // IMPORTANT:
    // Use userClient because SQL checks auth.uid().
    const { data, error } = await userClient.rpc(
      "get_account_transfer_details",
      {
        p_transfer_id: transferId,
      },
    );

    if (error) {
      console.error("Transfer details RPC error:", error.message);

      return response({
        success: false,
        message: "Unable to load transfer details.",
      }, 400);
    }

    if (!data || data.success !== true || !data.transfer) {
      return response({
        success: false,
        message: "Transfer record not found.",
      }, 404);
    }

    return response(data);

  } catch (error) {
    console.error("Transfer details error:", error);

    return response({
      success: false,
      message: "An unexpected server error occurred.",
    }, 500);
  }
});
