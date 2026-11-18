
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  if (req.method !== "GET") {
    return jsonResponse({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ success: false, message: "Authentication required." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      }
    );

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: "Invalid or expired session." }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", authData.user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.is_active !== true ||
      !["owner", "manager", "ticket_staff"].includes(profile.role)
    ) {
      return jsonResponse({ success: false, message: "You are not authorized." }, 403);
    }

    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );

    const search = (url.searchParams.get("search") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();

    if (search.length > 100) {
      return jsonResponse({ success: false, message: "Search text is too long." }, 400);
    }

    if (status.length > 50) {
      return jsonResponse({ success: false, message: "Invalid status filter." }, 400);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("bookings")
      .select(
        `
          id,
          booking_date,
          travel_date,
          origin,
          destination,
          status,
          customer_id,
          agency_id,
          notes,
          created_at
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();

      if (safeSearch) {
        query = query.or(
          `origin.ilike.%${safeSearch}%,destination.ilike.%${safeSearch}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Booking list query failed:", error.message);
      return jsonResponse({ success: false, message: "Could not load bookings." }, 400);
    }

    return jsonResponse({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("List bookings error:", error);
    return jsonResponse({ success: false, message: "An unexpected error occurred." }, 500);
  }
});
