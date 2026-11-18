
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
        error: "You do not have permission to create customers.",
      }, 403);
    }

    const body = await req.json();

    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : "";

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : null;

    const address =
      typeof body.address === "string"
        ? body.address.trim()
        : null;

    const passportNumber =
      typeof body.passport_number === "string"
        ? body.passport_number.trim().toUpperCase()
        : null;

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim()
        : null;

    const gender =
      typeof body.gender === "string" && body.gender.trim()
        ? body.gender.trim().slice(0, 20)
        : null;

    const nationality =
      typeof body.nationality === "string" && body.nationality.trim()
        ? body.nationality.trim().slice(0, 60)
        : "Bangladeshi";

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const dateOrNull = (value: unknown) =>
      typeof value === "string" && datePattern.test(value)
        ? value
        : null;

    const dateOfBirth = dateOrNull(body.date_of_birth);
    const passportExpiry = dateOrNull(body.passport_expiry);

    const isActive = body.is_active !== false;

    if (!fullName) {
      return json({ error: "Customer name is required." }, 400);
    }

    if (fullName.length > 150) {
      return json({ error: "Customer name is too long." }, 400);
    }

    if (!phone) {
      return json({ error: "Phone number is required." }, 400);
    }

    if (!/^[+0-9\s()-]{7,20}$/.test(phone)) {
      return json({ error: "Invalid phone number." }, 400);
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return json({ error: "Invalid email address." }, 400);
    }

    if (passportNumber && passportNumber.length > 30) {
      return json({ error: "Passport number is too long." }, 400);
    }

    // Create customer.
    const { data: customer, error: insertError } = await adminClient
      .from("customers")
      .insert({
        full_name: fullName,
        phone,
        email,
        address,
        passport_number: passportNumber,
        passport_expiry: passportExpiry,
        gender,
        nationality,
        date_of_birth: dateOfBirth,
        is_active: isActive,
        notes,
        created_by: user.id,
      })
      .select(
        "id, full_name, phone, email, address, passport_number, created_at"
      )
      .single();

    if (insertError) {
      console.error("Customer creation:", insertError);
      return json({ error: "Could not create customer." }, 500);
    }

    return json({
      success: true,
      message: "Customer created successfully.",
      customer,
    }, 201);

  } catch (error) {
    console.error("Create customer error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
