
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    if (!["GET", "POST"].includes(req.method)) {
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
      !["owner", "manager", "ticket_staff", "accounts_staff"].includes(
        profile.role
      )
    ) {
      return json({ error: "You do not have permission to view agencies." }, 403);
    }

    const params = new URL(req.url).searchParams;

    const search =
      (params.get("search") || "").trim();

    const includeInactive =
      params.get("include_inactive") === "true";

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
      .from("agencies")
      .select(
        "id, name, contact_person, phone, email, address, notes, is_active, created_at",
        { count: "exact" }
      )
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ");
      query = query.or(
        `name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {
      data: agencies,
      error: listError,
      count,
    } = await query.range(from, to);

    if (listError) {
      console.error("Agency list:", listError);
      return json({ error: "Could not load agencies." }, 500);
    }

    return json({
      success: true,
      agencies: agencies || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });

  } catch (error) {
    console.error("List agencies error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
