
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server configuration is incomplete." }, 500);
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json({ error: "Authentication required." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
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
      return json({ error: "Invalid or expired session." }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.is_active === false ||
      !["owner", "manager"].includes(profile.role)
    ) {
      return json({
        error: "Only active Owner or Manager can manage agencies.",
      }, 403);
    }

    const body = await req.json();

    const agencyId = body.agency_id;
    const isActive = body.is_active;

    if (
      typeof agencyId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agencyId)
    ) {
      return json({ error: "A valid agency ID is required." }, 400);
    }

    if (typeof isActive !== "boolean") {
      return json({
        error: "is_active must be true or false.",
      }, 400);
    }

    const { data: existingAgency, error: findError } = await adminClient
      .from("agencies")
      .select("id, name, is_active")
      .eq("id", agencyId)
      .single();

    if (findError || !existingAgency) {
      return json({ error: "Agency not found." }, 404);
    }

    if (existingAgency.is_active === isActive) {
      return json({
        success: true,
        message: isActive
          ? "Agency is already active."
          : "Agency is already inactive.",
        agency: existingAgency,
      });
    }

    const { data: agency, error: updateError } = await adminClient
      .from("agencies")
      .update({ is_active: isActive })
      .eq("id", agencyId)
      .select("id, name, is_active")
      .single();

    if (updateError) {
      console.error("Agency status update:", updateError);
      return json({ error: "Could not update agency status." }, 500);
    }

    return json({
      success: true,
      message: isActive
        ? "Agency activated successfully."
        : "Agency deactivated successfully.",
      agency,
    });

  } catch (error) {
    console.error("Deactivate agency error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
