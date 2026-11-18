
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    if (req.method !== "GET") {
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
        error: "You do not have permission to view customers.",
      }, 403);
    }

    const params = new URL(req.url).searchParams;

    const search = (params.get("search") || "").trim();

    const page = Math.max(
      1,
      Number.parseInt(params.get("page") || "1", 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(params.get("limit") || "50", 10) || 50
      )
    );

    let query = adminClient
      .from("customers")
      .select(
        "id, full_name, phone, email, address, passport_number, notes, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (search) {
      // Escape PostgREST filter syntax characters.
      const safeSearch = search.replace(/[,%()_*]/g, " ").trim();

      if (safeSearch) {
        query = query.or(
          `full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`
        );
      }
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {
      data: customers,
      error: listError,
      count,
    } = await query.range(from, to);

    if (listError) {
      console.error("Customer list:", listError);
      return json({ error: "Could not load customers." }, 500);
    }

    return json({
      success: true,
      customers: customers || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });

  } catch (error) {
    console.error("List customers error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
