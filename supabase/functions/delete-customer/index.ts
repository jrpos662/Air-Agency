
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

    const allowedRoles = [
      "owner",
      "manager",
      "ticket_staff",
      "accounts_staff",
    ];

    if (
      profileError ||
      !profile ||
      profile.is_active === false ||
      !allowedRoles.includes(profile.role)
    ) {
      return json({
        error: "You do not have permission to archive customers.",
      }, 403);
    }

    const body = await req.json();
    const customerId = body.customer_id;

    if (
      typeof customerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)
    ) {
      return json({ error: "A valid customer ID is required." }, 400);
    }

    const { data: customer, error: findError } = await adminClient
      .from("customers")
      .select("id, full_name, is_active")
      .eq("id", customerId)
      .single();

    if (findError || !customer) {
      return json({ error: "Customer not found." }, 404);
    }

    if (customer.is_active === false) {
      return json({
        success: true,
        message: "Customer is already archived.",
      });
    }

    const { error: updateError } = await adminClient
      .from("customers")
      .update({ is_active: false })
      .eq("id", customerId);

    if (updateError) {
      console.error("Customer archive:", updateError);
      return json({ error: "Could not archive customer." }, 500);
    }

    return json({
      success: true,
      message: "Customer archived successfully. Historical records were preserved.",
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        is_active: false,
      },
    });

  } catch (error) {
    console.error("Delete customer error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});

