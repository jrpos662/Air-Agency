
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUUID = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ success: false, message: "Authentication required." }, 401);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();

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

    const body = await req.json();
    const { booking_id } = body;

    if (!isUUID(booking_id)) {
      return jsonResponse({ success: false, message: "Valid booking ID is required." }, 400);
    }

    const updates: Record<string, unknown> = {};

    // Travel date
    if (Object.hasOwn(body, "travel_date")) {
      const value = body.travel_date;

      if (
        value !== null &&
        (typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(`${value}T00:00:00`)))
      ) {
        return jsonResponse({ success: false, message: "Invalid travel date." }, 400);
      }

      updates.travel_date = value;
    }

    // Origin
    if (Object.hasOwn(body, "origin")) {
      if (
        typeof body.origin !== "string" ||
        !body.origin.trim() ||
        body.origin.trim().length > 150
      ) {
        return jsonResponse({ success: false, message: "Invalid origin." }, 400);
      }

      updates.origin = body.origin.trim();
    }

    // Destination
    if (Object.hasOwn(body, "destination")) {
      if (
        typeof body.destination !== "string" ||
        !body.destination.trim() ||
        body.destination.trim().length > 150
      ) {
        return jsonResponse({ success: false, message: "Invalid destination." }, 400);
      }

      updates.destination = body.destination.trim();
    }

    // Agency
    if (Object.hasOwn(body, "agency_id")) {
      if (body.agency_id !== null && !isUUID(body.agency_id)) {
        return jsonResponse({ success: false, message: "Invalid agency ID." }, 400);
      }

      updates.agency_id = body.agency_id;
    }

    // Notes
    if (Object.hasOwn(body, "notes")) {
      if (
        body.notes !== null &&
        (typeof body.notes !== "string" || body.notes.length > 2000)
      ) {
        return jsonResponse({ success: false, message: "Invalid notes." }, 400);
      }

      updates.notes = body.notes?.trim() ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ success: false, message: "No valid changes provided." }, 400);
    }

    // Financial fields and booking status are intentionally not accepted.
    const { data, error } = await supabase.rpc("update_booking", {
      p_booking_id: booking_id,
      p_updates: updates,
    });

    if (error) {
      console.error("update_booking RPC failed:", error.message);
      return jsonResponse({ success: false, message: "Booking update could not be completed." }, 400);
    }

    return jsonResponse({
      success: true,
      message: "Booking updated successfully.",
      data,
    });
  } catch (error) {
    console.error("Update booking error:", error);
    return jsonResponse({ success: false, message: "An unexpected error occurred." }, 500);
  }
});
