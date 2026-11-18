
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

function getCorsHeaders(origin: string | null) {
    const allowed = !origin || allowedOrigins.includes(origin);

    return {
        "Access-Control-Allow-Origin": origin
            ? (allowed ? origin : "null")
            : "*",
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

function respond(
    body: Record<string, unknown>,
    status: number,
    headers: Record<string, string>
) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...headers,
            "Content-Type": "application/json",
        },
    });
}

function isUuid(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

function isValidDate(value: unknown): value is string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function isMoney(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 999999999999
    );
}

function cleanText(
    value: unknown,
    maxLength: number,
    required = false
): string | null {
    if (typeof value !== "string") {
        return required ? null : null;
    }

    const text = value.trim();

    if (!text) return required ? null : null;
    if (text.length > maxLength) return null;

    return text;
}

Deno.serve(async (req: Request) => {
    const origin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (origin && corsHeaders["Access-Control-Allow-Origin"] === "null") {
        return respond(
            { success: false, message: "Origin is not allowed." },
            403,
            corsHeaders
        );
    }

    if (req.method !== "POST") {
        return respond(
            { success: false, message: "Method not allowed." },
            405,
            corsHeaders
        );
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const authorization = req.headers.get("Authorization");

        if (
            !supabaseUrl ||
            !anonKey ||
            !serviceRoleKey ||
            !authorization
        ) {
            return respond(
                {
                    success: false,
                    message: "Server configuration or authorization is missing.",
                },
                500,
                corsHeaders
            );
        }

        // User client verifies the JWT and calls the RPC with the user's JWT.
        const userClient = createClient(
            supabaseUrl,
            anonKey,
            {
                global: {
                    headers: {
                        Authorization: authorization,
                    },
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            }
        );

        // Admin client is used only for the server-side staff profile check.
        const adminClient = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            }
        );

        const {
            data: { user },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !user) {
            return respond(
                {
                    success: false,
                    message: "Invalid or expired session. Please sign in again.",
                },
                401,
                corsHeaders
            );
        }

        const { data: profile, error: profileError } =
            await adminClient
                .from("profiles")
                .select("role, is_active")
                .eq("id", user.id)
                .maybeSingle();

        const role = String(profile?.role || "").toLowerCase();

        const allowedRoles = [
            "owner",
            "manager",
            "ticket_staff",
        ];

        if (
            profileError ||
            !profile ||
            profile.is_active !== true ||
            !allowedRoles.includes(role)
        ) {
            return respond(
                {
                    success: false,
                    message: "You do not have permission to create ticket sales.",
                },
                403,
                corsHeaders
            );
        }

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return respond(
                {
                    success: false,
                    message: "Invalid JSON request body.",
                },
                400,
                corsHeaders
            );
        }

        // Validate customer and agency IDs.
        if (!isUuid(body.customer_id)) {
            return respond(
                {
                    success: false,
                    message: "A valid customer is required.",
                },
                400,
                corsHeaders
            );
        }

        if (!isUuid(body.agency_id)) {
            return respond(
                {
                    success: false,
                    message: "A valid source agency is required.",
                },
                400,
                corsHeaders
            );
        }

        // Validate dates.
        if (!isValidDate(body.sale_date)) {
            return respond(
                {
                    success: false,
                    message: "A valid sale date is required.",
                },
                400,
                corsHeaders
            );
        }

        if (!isValidDate(body.travel_date)) {
            return respond(
                {
                    success: false,
                    message: "A valid travel date is required.",
                },
                400,
                corsHeaders
            );
        }

        // Validate route.
        const originCity = cleanText(body.origin, 100, true);
        const destination = cleanText(body.destination, 100, true);

        if (!originCity || !destination) {
            return respond(
                {
                    success: false,
                    message: "Origin and destination are required.",
                },
                400,
                corsHeaders
            );
        }

        if (
            originCity.toLowerCase() === destination.toLowerCase()
        ) {
            return respond(
                {
                    success: false,
                    message: "Origin and destination cannot be the same.",
                },
                400,
                corsHeaders
            );
        }

        // Validate sale amounts.
        if (!isMoney(body.selling_total) || body.selling_total <= 0) {
            return respond(
                {
                    success: false,
                    message: "Enter a valid selling amount.",
                },
                400,
                corsHeaders
            );
        }

        const discount = body.discount_amount ?? 0;
        const initialPayment = body.initial_payment ?? 0;

        if (!isMoney(discount) || discount > body.selling_total) {
            return respond(
                {
                    success: false,
                    message: "Invalid discount amount.",
                },
                400,
                corsHeaders
            );
        }

        if (
            !isMoney(initialPayment) ||
            initialPayment > body.selling_total - discount
        ) {
            return respond(
                {
                    success: false,
                    message: "Invalid initial payment amount.",
                },
                400,
                corsHeaders
            );
        }

        // Validate initial payment method.
        const paymentMethod = body.payment_method || null;

        if (initialPayment > 0) {
            if (
                !["cash", "mobile_banking"].includes(
                    String(paymentMethod)
                )
            ) {
                return respond(
                    {
                        success: false,
                        message: "Select a supported payment method.",
                    },
                    400,
                    corsHeaders
                );
            }
        }

        // Validate passenger data.
        if (
            !Array.isArray(body.passengers) ||
            body.passengers.length < 1 ||
            body.passengers.length > 20
        ) {
            return respond(
                {
                    success: false,
                    message: "Add between 1 and 20 passengers.",
                },
                400,
                corsHeaders
            );
        }

        const canManagePurchasePrice = [
            "owner",
            "manager",
        ].includes(role);

        const passengers: Record<string, unknown>[] = [];

        for (const item of body.passengers) {
            if (!item || typeof item !== "object") {
                return respond(
                    {
                        success: false,
                        message: "Invalid passenger information.",
                    },
                    400,
                    corsHeaders
                );
            }

            const passenger = item as Record<string, unknown>;

            const fullName = cleanText(
                passenger.full_name,
                150,
                true
            );

            if (!fullName) {
                return respond(
                    {
                        success: false,
                        message: "Every passenger must have a valid full name.",
                    },
                    400,
                    corsHeaders
                );
            }

            const passengerType = passenger.passenger_type;

            if (
                !["adult", "child", "infant"].includes(
                    String(passengerType)
                )
            ) {
                return respond(
                    {
                        success: false,
                        message: "Invalid passenger type.",
                    },
                    400,
                    corsHeaders
                );
            }

            let purchasePrice: number | null = null;

            if (canManagePurchasePrice) {
                if (
                    !isMoney(passenger.purchase_price)
                ) {
                    return respond(
                        {
                            success: false,
                            message: "A valid purchase price is required for every passenger.",
                        },
                        400,
                        corsHeaders
                    );
                }

                purchasePrice = passenger.purchase_price;
            }

            let dateOfBirth: string | null = null;

            if (passenger.date_of_birth) {
                if (!isValidDate(passenger.date_of_birth)) {
                    return respond(
                        {
                            success: false,
                            message: "Invalid passenger date of birth.",
                        },
                        400,
                        corsHeaders
                    );
                }

                dateOfBirth = passenger.date_of_birth;
            }

            passengers.push({
                full_name: fullName,
                passport_number: cleanText(
                    passenger.passport_number,
                    30
                ),
                date_of_birth: dateOfBirth,
                passenger_type: passengerType,
                ticket_number: cleanText(
                    passenger.ticket_number,
                    50
                ),
                purchase_price: purchasePrice,
            });
        }

        // Whitelist all fields; never forward the raw request body.
        const salePayload = {
            customer_id: body.customer_id,
            agency_id: body.agency_id,

            sale_date: body.sale_date,
            travel_date: body.travel_date,

            origin: originCity,
            destination,

            pnr: cleanText(body.pnr, 30),
            airline: cleanText(body.airline, 100),

            selling_total: body.selling_total,
            discount_amount: discount,

            initial_payment: initialPayment,
            payment_method: initialPayment > 0
                ? paymentMethod
                : null,

            payment_reference: initialPayment > 0
                ? cleanText(body.payment_reference, 100)
                : null,

            notes: cleanText(body.notes, 2000),

            passengers,
        };

        // The RPC uses the authenticated user's JWT.
        // This preserves auth.uid() and lets the database enforce permissions.
        const { data, error } = await userClient.rpc(
            "create_ticket_sale",
            {
                p_sale: salePayload,
            }
        );

        if (error) {
            console.error(
                "create_ticket_sale RPC failed:",
                error.message
            );

            return respond(
                {
                    success: false,
                    message: "Ticket sale could not be created.",
                },
                400,
                corsHeaders
            );
        }

        const saleId =
            typeof data === "string"
                ? data
                : (data as Record<string, unknown> | null)?.sale_id;

        if (!saleId) {
            return respond(
                {
                    success: false,
                    message: "The sale was not confirmed by the database.",
                },
                500,
                corsHeaders
            );
        }

        return respond(
            {
                success: true,
                message: "Ticket sale created successfully.",
                sale_id: saleId,
            },
            200,
            corsHeaders
        );

    } catch (error) {
        console.error("Create ticket sale error:", error);

        return respond(
            {
                success: false,
                message: "An unexpected server error occurred.",
            },
            500,
            corsHeaders
        );
    }
});
