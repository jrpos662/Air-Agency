
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
        { success: false, message: "Only the Owner can update staff." },
        403
      );
    }

    const body = await req.json();

    const {
      staff_user_id,
      full_name,
      phone,
      role,
      is_active,
    } = body;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof staff_user_id !== "string" ||
      !uuidPattern.test(staff_user_id) ||
      staff_user_id === user.id
    ) {
      return respond(
        { success: false, message: "Invalid staff account." },
        400
      );
    }

    if (
      full_name != null &&
      (
        typeof full_name !== "string" ||
        full_name.trim().length < 2 ||
        full_name.length > 100
      )
    ) {
      return respond(
        { success: false, message: "Invalid staff name." },
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

    if (
      role != null &&
      !allowedRoles.includes(role)
    ) {
      return respond(
        { success: false, message: "Invalid staff role." },
        400
      );
    }

    if (
      is_active != null &&
      typeof is_active !== "boolean"
    ) {
      return respond(
        { success: false, message: "Invalid account status." },
        400
      );
    }

    const { data: target, error: targetError } =
      await adminClient
        .from("profiles")
        .select("id, role")
        .eq("id", staff_user_id)
        .maybeSingle();

    if (targetError || !target) {
      return respond(
        { success: false, message: "Staff account not found." },
        404
      );
    }

    if (target.role === "owner") {
      return respond(
        { success: false, message: "Owner account cannot be modified here." },
        403
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) {
      updates.full_name = full_name.trim();
    }

    if (phone !== undefined) {
      updates.phone = phone;
    }

    if (role !== undefined) {
      updates.role = role;
    }

    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    const { error: updateError } =
      await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", staff_user_id);

    if (updateError) {
      console.error("Staff update error:", updateError);

      return respond(
        { success: false, message: "Unable to update staff profile." },
        400
      );
    }

    // Disable or enable the authentication account as well.
    if (is_active !== undefined) {
      const { error: authUpdateError } =
        await adminClient.auth.admin.updateUserById(
          staff_user_id,
          { ban_duration: is_active ? "none" : "876000h" }
        );

      if (authUpdateError) {
        console.error("Auth status update error:", authUpdateError);

        return respond(
          {
            success: false,
            message: "Profile updated, but authentication status could not be changed.",
          },
          500
        );
      }
    }

    return respond({
      success: true,
      message: "Staff updated successfully.",
      staff_user_id,
    });
  } catch (error) {
    console.error("Update staff error:", error);

    return respond(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
