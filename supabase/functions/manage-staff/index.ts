import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * manage-staff
 *
 * Single endpoint used by pages/staff.html (js/staff.js).
 *
 * Actions:
 *   list    -> Owner and Manager
 *   create  -> Owner only
 *   update  -> Owner only (name, phone, role, active status)
 *
 * Every request verifies the JWT and an active profile. The service-role
 * key stays on the server and is never exposed to the browser.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const assignableRoles = ["manager", "ticket_staff", "accounts_staff"];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status: number) =>
  respond({ success: false, error: message, message }, status);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed.", 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return fail("Authentication required.", 401);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
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
      return fail("Invalid or expired session.", 401);
    }

    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (callerError || !caller || caller.is_active !== true) {
      return fail("Active staff account required.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    /* ---------------- LIST ---------------- */

    if (action === "list") {
      if (!["owner", "manager"].includes(caller.role)) {
        return fail("You do not have permission to view staff.", 403);
      }

      const { data: staff, error: listError } = await adminClient
        .from("profiles")
        .select("id, full_name, email, phone, role, is_active, created_at")
        .order("created_at", { ascending: true });

      if (listError) {
        console.error("Staff list error:", listError.message);
        return fail("Unable to load staff members.", 400);
      }

      return respond({
        success: true,
        current_role: caller.role,
        staff: staff ?? [],
      });
    }

    // Everything below is Owner-only.
    if (caller.role !== "owner") {
      return fail("Only the Owner can manage staff.", 403);
    }

    /* ---------------- CREATE ---------------- */

    if (action === "create") {
      const { full_name, email, password, phone, role } = body;

      if (
        typeof full_name !== "string" ||
        full_name.trim().length < 2 ||
        full_name.length > 100
      ) {
        return fail("Invalid staff name.", 400);
      }

      if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return fail("Invalid email address.", 400);
      }

      if (
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 128
      ) {
        return fail("Password must be at least 10 characters.", 400);
      }

      if (!assignableRoles.includes(role)) {
        return fail("Invalid staff role.", 400);
      }

      if (
        phone != null &&
        (typeof phone !== "string" || phone.length > 30)
      ) {
        return fail("Invalid phone number.", 400);
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = full_name.trim();

      const { data: created, error: createError } =
        await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: cleanName },
        });

      if (createError || !created?.user) {
        console.error("Staff auth creation error:", createError?.message);
        return fail("Unable to create staff account.", 400);
      }

      const { error: insertError } = await adminClient
        .from("profiles")
        .insert({
          id: created.user.id,
          full_name: cleanName,
          email: cleanEmail,
          phone: phone || null,
          role,
          is_active: true,
        });

      if (insertError) {
        // Roll back the Auth account so no orphan login remains.
        await adminClient.auth.admin.deleteUser(created.user.id);
        console.error("Staff profile error:", insertError.message);
        return fail("Unable to create staff profile.", 400);
      }

      return respond({
        success: true,
        message: "Staff account created successfully.",
        staff: {
          id: created.user.id,
          full_name: cleanName,
          email: cleanEmail,
          role,
          is_active: true,
        },
      });
    }

    /* ---------------- UPDATE ---------------- */

    if (action === "update") {
      const { staff_user_id, full_name, phone, role, is_active } = body;

      if (
        typeof staff_user_id !== "string" ||
        !uuidPattern.test(staff_user_id) ||
        staff_user_id === user.id
      ) {
        return fail("Invalid staff account.", 400);
      }

      if (
        full_name != null &&
        (typeof full_name !== "string" ||
          full_name.trim().length < 2 ||
          full_name.length > 100)
      ) {
        return fail("Invalid staff name.", 400);
      }

      if (
        phone != null &&
        (typeof phone !== "string" || phone.length > 30)
      ) {
        return fail("Invalid phone number.", 400);
      }

      if (role != null && !assignableRoles.includes(role)) {
        return fail("Invalid staff role.", 400);
      }

      if (is_active != null && typeof is_active !== "boolean") {
        return fail("Invalid account status.", 400);
      }

      const { data: target, error: targetError } = await adminClient
        .from("profiles")
        .select("id, role")
        .eq("id", staff_user_id)
        .maybeSingle();

      if (targetError || !target) {
        return fail("Staff account not found.", 404);
      }

      if (target.role === "owner") {
        return fail("The Owner account cannot be modified here.", 403);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (full_name != null) updates.full_name = full_name.trim();
      if (phone !== undefined) updates.phone = phone;
      if (role != null) updates.role = role;
      if (is_active != null) updates.is_active = is_active;

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", staff_user_id);

      if (updateError) {
        console.error("Staff update error:", updateError.message);
        return fail("Unable to update staff profile.", 400);
      }

      if (is_active != null) {
        const { error: banError } =
          await adminClient.auth.admin.updateUserById(staff_user_id, {
            ban_duration: is_active ? "none" : "876000h",
          });

        if (banError) {
          console.error("Auth status error:", banError.message);
          return fail(
            "Profile updated, but login status could not be changed.",
            500,
          );
        }
      }

      return respond({
        success: true,
        message: "Staff updated successfully.",
        staff_user_id,
      });
    }

    return fail("Unknown action.", 400);
  } catch (error) {
    console.error(
      "manage-staff error:",
      error instanceof Error ? error.message : error,
    );

    return fail("An unexpected server error occurred.", 500);
  }
});
