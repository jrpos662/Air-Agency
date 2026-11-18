
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = [
  "manager",
  "ticket_staff",
  "accounts_staff",
];

Deno.serve(async (req: Request) => {
  const respond = (
    body: Record<string, unknown>,
    status = 200
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(
      { success: false, message: "Method not allowed." },
      405
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return respond(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const userClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: { persistSession: false },
    });

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return respond(
        { success: false, message: "Invalid or expired session." },
        401
      );
    }

    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      profile.role !== "owner"
    ) {
      return respond(
        { success: false, message: "Only the Owner can create staff." },
        403
      );
    }

    const body = await req.json();

    const {
      full_name,
      email,
      password,
      phone,
      role,
    } = body;

    if (
      typeof full_name !== "string" ||
      full_name.trim().length < 2 ||
      full_name.length > 100
    ) {
      return respond(
        { success: false, message: "Invalid staff name." },
        400
      );
    }

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return respond(
        { success: false, message: "Invalid email address." },
        400
      );
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    ) {
      return respond(
        { success: false, message: "Password must be at least 10 characters." },
        400
      );
    }

    if (!allowedRoles.includes(role)) {
      return respond(
        { success: false, message: "Invalid staff role." },
        400
      );
    }

    if (
      phone != null &&
      (typeof phone !== "string" || phone.length > 30)
    ) {
      return respond(
        { success: false, message: "Invalid phone number." },
        400
      );
    }

    // Create the authentication account.
    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
        },
      });

    if (createError || !createdUser.user) {
      console.error("Staff auth creation error:", createError);

      return respond(
        {
          success: false,
          message: "Unable to create staff account.",
        },
        400
      );
    }

    // Create the staff profile.
    const { error: insertError } =
      await adminClient
        .from("profiles")
        .insert({
          id: createdUser.user.id,
          full_name: full_name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone || null,
          role,
          is_active: true,
        });

    if (insertError) {
      // Roll back the Auth account if profile creation fails.
      await adminClient.auth.admin.deleteUser(
        createdUser.user.id
      );

      console.error("Staff profile error:", insertError);

      return respond(
        {
          success: false,
          message: "Unable to create staff profile.",
        },
        400
      );
    }

    return respond({
      success: true,
      message: "Staff account created successfully.",
      staff: {
        id: createdUser.user.id,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        role,
        is_active: true,
      },
    });
  } catch (error) {
    console.error("Create staff error:", error);

    return respond(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
