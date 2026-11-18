
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

    // Verify current user.
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Invalid or expired session." }, 401);
    }

    // Check user role.
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.is_active === false) {
      return json({ error: "Active staff profile not found." }, 403);
    }

    if (!["owner", "manager"].includes(profile.role)) {
      return json({
        error: "Only Owner or Manager can create agencies.",
      }, 403);
    }

    const body = await req.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const contactPerson =
      typeof body.contact_person === "string"
        ? body.contact_person.trim()
        : null;

    const phone =
      typeof body.phone === "string" ? body.phone.trim() : null;

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : null;

    const address =
      typeof body.address === "string" ? body.address.trim() : null;

    const notes =
      typeof body.notes === "string" ? body.notes.trim() : null;

    if (!name) {
      return json({ error: "Agency name is required." }, 400);
    }

    if (name.length > 150) {
      return json({ error: "Agency name is too long." }, 400);
    }

    if (phone && phone.length > 30) {
      return json({ error: "Phone number is too long." }, 400);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email address." }, 400);
    }

    if (email && email.length > 254) {
      return json({ error: "Email address is too long." }, 400);
    }

    // Prevent duplicate agency names.
    const { data: existingAgency, error: duplicateError } =
      await adminClient
        .from("agencies")
        .select("id")
        .ilike("name", name)
        .limit(1);

    if (duplicateError) {
      console.error("Agency duplicate check:", duplicateError);
      return json({ error: "Could not validate agency name." }, 500);
    }

    if (existingAgency && existingAgency.length > 0) {
      return json({
        error: "An agency with this name already exists.",
      }, 409);
    }

    // Create agency.
    const { data: agency, error: insertError } = await adminClient
      .from("agencies")
      .insert({
        name,
        contact_person: contactPerson,
        phone,
        email,
        address,
        notes,
        is_active: true,
        created_by: user.id,
      })
      .select("id, name, phone, email, is_active, created_at")
      .single();

    if (insertError) {
      console.error("Agency creation:", insertError);
      return json({ error: "Could not create agency." }, 500);
    }

    return json({
      success: true,
      message: "Agency created successfully.",
      agency,
    }, 201);

  } catch (error) {
    console.error("Create agency error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
