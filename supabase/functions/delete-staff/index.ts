
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

    // Verify the logged-in user.
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Invalid or expired session." }, 401);
    }

    // Only Owner can deactivate staff.
    const { data: currentProfile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .single();

    if (profileError || currentProfile?.role !== "owner") {
      return json({ error: "Only the Owner can deactivate staff." }, 403);
    }

    const body = await req.json();
    const staffId = body.staff_id;

    if (
      typeof staffId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)
    ) {
      return json({ error: "A valid staff ID is required." }, 400);
    }

    if (staffId === user.id) {
      return json({ error: "You cannot deactivate your own account here." }, 400);
    }

    const { data: targetProfile, error: targetError } =
      await adminClient
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", staffId)
        .single();

    if (targetError || !targetProfile) {
      return json({ error: "Staff account not found." }, 404);
    }

    if (targetProfile.role === "owner") {
      return json({ error: "The Owner account cannot be deactivated." }, 403);
    }

    if (targetProfile.is_active === false) {
      return json({ message: "This staff account is already inactive." });
    }

    // Ban login first. If the profile update fails, restore login.
    const { error: banError } =
      await adminClient.auth.admin.updateUserById(staffId, {
        ban_duration: "876000h",
      });

    if (banError) {
      return json({ error: "Could not disable staff login." }, 500);
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", staffId);

    if (updateError) {
      await adminClient.auth.admin.updateUserById(staffId, {
        ban_duration: "none",
      });

      return json({
        error: "Could not deactivate staff profile. Login restriction was rolled back.",
      }, 500);
    }

    return json({
      success: true,
      message: "Staff account deactivated. Historical records have been preserved.",
    });
  } catch (error) {
    console.error("Delete staff error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});

