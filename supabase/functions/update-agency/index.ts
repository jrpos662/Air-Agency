
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

    if (
      profileError ||
      !profile ||
      profile.is_active === false ||
      !["owner", "manager"].includes(profile.role)
    ) {
      return json({
        error: "Only active Owner or Manager can update agencies.",
      }, 403);
    }

    const body = await req.json();

    const agencyId = body.agency_id;

    if (
      typeof agencyId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agencyId)
    ) {
      return json({ error: "A valid agency ID is required." }, 400);
    }

    const allowedFields = [
      "name",
      "contact_person",
      "phone",
      "email",
      "address",
      "notes",
      "is_active",
    ];

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: "No update information provided." }, 400);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "name")
    ) {
      if (
        typeof updates.name !== "string" ||
        !updates.name.trim()
      ) {
        return json({ error: "Agency name is required." }, 400);
      }

      updates.name = updates.name.trim();

      if ((updates.name as string).length > 150) {
        return json({ error: "Agency name is too long." }, 400);
      }

      const { data: duplicate, error: duplicateError } =
        await adminClient
          .from("agencies")
          .select("id")
          .ilike("name", updates.name as string)
          .neq("id", agencyId)
          .limit(1);

      if (duplicateError) {
        return json({ error: "Could not validate agency name." }, 500);
      }

      if (duplicate && duplicate.length > 0) {
        return json({
          error: "Another agency already uses this name.",
        }, 409);
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "email")
    ) {
      if (updates.email === null || updates.email === "") {
        updates.email = null;
      } else if (
        typeof updates.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email.trim())
      ) {
        return json({ error: "Invalid email address." }, 400);
      } else {
        updates.email = updates.email.trim().toLowerCase();
      }
    }

    for (const field of ["phone", "contact_person", "address", "notes"]) {
      if (
        Object.prototype.hasOwnProperty.call(updates, field) &&
        updates[field] !== null &&
        typeof updates[field] !== "string"
      ) {
        return json({ error: `Invalid ${field} value.` }, 400);
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "is_active") &&
      typeof updates.is_active !== "boolean"
    ) {
      return json({ error: "is_active must be true or false." }, 400);
    }

    const { data: agency, error: updateError } = await adminClient
      .from("agencies")
      .update(updates)
      .eq("id", agencyId)
      .select("*")
      .single();

    if (updateError) {
      console.error("Agency update:", updateError);

      if (updateError.code === "PGRST116") {
        return json({ error: "Agency not found." }, 404);
      }

      return json({ error: "Could not update agency." }, 500);
    }

    return json({
      success: true,
      message: "Agency updated successfully.",
      agency,
    });

  } catch (error) {
    console.error("Update agency error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
