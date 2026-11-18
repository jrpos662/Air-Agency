
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
        error: "You do not have permission to update customers.",
      }, 403);
    }

    const body = await req.json();
    const customerId = body.customer_id;

    if (
      typeof customerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)
    ) {
      return json({ error: "A valid customer ID is required." }, 400);
    }

    const allowedFields = [
      "full_name",
      "phone",
      "email",
      "address",
      "passport_number",
      "notes",
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

    if (Object.prototype.hasOwnProperty.call(updates, "full_name")) {
      if (
        typeof updates.full_name !== "string" ||
        !updates.full_name.trim()
      ) {
        return json({ error: "Customer name is required." }, 400);
      }

      updates.full_name = updates.full_name.trim();

      if ((updates.full_name as string).length > 150) {
        return json({ error: "Customer name is too long." }, 400);
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "phone")) {
      if (
        typeof updates.phone !== "string" ||
        !/^[+0-9\s()-]{7,20}$/.test(updates.phone.trim())
      ) {
        return json({ error: "Invalid phone number." }, 400);
      }

      updates.phone = updates.phone.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, "email")) {
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

    if (Object.prototype.hasOwnProperty.call(updates, "passport_number")) {
      if (updates.passport_number === null || updates.passport_number === "") {
        updates.passport_number = null;
      } else if (typeof updates.passport_number !== "string") {
        return json({ error: "Invalid passport number." }, 400);
      } else {
        updates.passport_number =
          updates.passport_number.trim().toUpperCase();

        if ((updates.passport_number as string).length > 30) {
          return json({ error: "Passport number is too long." }, 400);
        }
      }
    }

    for (const field of ["address", "notes"]) {
      if (
        Object.prototype.hasOwnProperty.call(updates, field) &&
        updates[field] !== null &&
        typeof updates[field] !== "string"
      ) {
        return json({ error: `Invalid ${field} value.` }, 400);
      }

      if (typeof updates[field] === "string") {
        updates[field] = (updates[field] as string).trim() || null;
      }
    }

    const { data: customer, error: updateError } = await adminClient
      .from("customers")
      .update(updates)
      .eq("id", customerId)
      .select(
        "id, full_name, phone, email, address, passport_number, notes, created_at"
      )
      .single();

    if (updateError) {
      console.error("Customer update:", updateError);

      if (updateError.code === "PGRST116") {
        return json({ error: "Customer not found." }, 404);
      }

      return json({ error: "Could not update customer." }, 500);
    }

    return json({
      success: true,
      message: "Customer updated successfully.",
      customer,
    });

  } catch (error) {
    console.error("Update customer error:", error);

    return json({
      error: "An unexpected server error occurred.",
    }, 500);
  }
});
