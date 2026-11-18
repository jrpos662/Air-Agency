
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const allowedOrigins = (
  Deno.env.get("ALLOWED_ORIGINS") || ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function response(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (origin && !allowedOrigins.includes(origin)) {
    return response(
      { success: false, message: "Origin not allowed." },
      403,
      headers,
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return response(
      { success: false, message: "Method not allowed." },
      405,
      headers,
    );
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase configuration is missing.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return response(
        { success: false, message: "Authentication required." },
        401,
        headers,
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authorization },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return response(
        { success: false, message: "Invalid login session." },
        401,
        headers,
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return response(
        { success: false, message: "Invalid request body." },
        400,
        headers,
      );
    }

    const bookingId = body.booking_id;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof bookingId !== "string" ||
      !uuidPattern.test(bookingId)
    ) {
      return response(
        { success: false, message: "A valid booking ID is required." },
        400,
        headers,
      );
    }

    const { data: saleId, error: conversionError } =
      await supabase.rpc("convert_booking_to_sale", {
        p_booking_id: bookingId,
        p_user_id: user.id,
      });

    if (conversionError) {
      console.error(
        "Booking conversion error:",
        conversionError.message,
      );

      return response(
        {
          success: false,
          message: conversionError.message,
        },
        400,
        headers,
      );
    }

    return response(
      {
        success: true,
        message: "Booking converted successfully.",
        sale_id: saleId,
      },
      200,
      headers,
    );
  } catch (error) {
    console.error("Conversion function error:", error);

    return response(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500,
      headers,
    );
  }
});
