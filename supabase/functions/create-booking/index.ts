
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =========================================
   CONFIGURATION
========================================= */

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

const MAX_AMOUNT = 999999999999;
const MAX_PASSENGERS = 20;
const MAX_NOTES_LENGTH = 2000;

/* =========================================
   CORS
========================================= */

function getCorsHeaders(origin: string | null) {
    const isAllowed = origin
        ? allowedOrigins.includes(origin)
        : false;

    return {
        "Access-Control-Allow-Origin": isAllowed ? origin : "null",
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

/* =========================================
   JSON RESPONSE
========================================= */

function jsonResponse(
    data: unknown,
    status = 200,
    corsHeaders: Record<string, string> = {}
) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
        },
    });
}

/* =========================================
   VALIDATION HELPERS
========================================= */

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

function isValidAmount(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= MAX_AMOUNT
    );
}

/* =========================================
   EDGE FUNCTION
========================================= */

Deno.serve(async (req: Request) => {

    const origin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);

    /* -------------------------------------
       OPTIONS
    ------------------------------------- */

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    /* -------------------------------------
       ORIGIN VALIDATION
    ------------------------------------- */

    if (
        origin &&
        corsHeaders["Access-Control-Allow-Origin"] === "null"
    ) {
        return jsonResponse(
            { error: "Origin is not allowed." },
            403,
            corsHeaders
        );
    }

    /* -------------------------------------
       METHOD VALIDATION
    ------------------------------------- */

    if (req.method !== "POST") {
        return jsonResponse(
            { error: "Method not allowed." },
            405,
            corsHeaders
        );
    }

    try {

        /* =================================
           1. ENVIRONMENT
        ================================= */

        const supabaseUrl =
            Deno.env.get("SUPABASE_URL");

        const anonKey =
            Deno.env.get("SUPABASE_ANON_KEY");

        if (!supabaseUrl || !anonKey) {
            console.error(
                "Missing Supabase URL or anon key."
            );

            return jsonResponse(
                {
                    error: "Server configuration is incomplete."
                },
                500,
                corsHeaders
            );
        }

        /* =================================
           2. AUTHORIZATION
        ================================= */

        const authorization =
            req.headers.get("Authorization");

        if (!authorization) {
            return jsonResponse(
                {
                    error: "Authentication required."
                },
                401,
                corsHeaders
            );
        }

        /* =================================
           3. USER CLIENT
           Uses the caller's JWT.
           No service-role key.
        ================================= */

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

        /* =================================
           4. VERIFY USER SESSION
        ================================= */

        const {
            data: { user },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !user) {
            return jsonResponse(
                {
                    error: "Invalid or expired session."
                },
                401,
                corsHeaders
            );
        }

        /* =================================
           5. READ REQUEST BODY
        ================================= */

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return jsonResponse(
                {
                    error: "Invalid JSON request body."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           6. READ INPUTS
        ================================= */

        const customerId = body.customer_id;

        const agencyId =
            body.agency_id === "" ||
            body.agency_id === null ||
            body.agency_id === undefined
                ? null
                : body.agency_id;

        const bookingDate = body.booking_date;

        const travelDate =
            body.travel_date === "" ||
            body.travel_date === null ||
            body.travel_date === undefined
                ? null
                : body.travel_date;

        const originValue = body.origin;
        const destinationValue = body.destination;

        const notes =
            body.notes === "" ||
            body.notes === null ||
            body.notes === undefined
                ? null
                : body.notes;

        const passengers = body.passengers;
        const quotedAmount = body.quoted_amount;

        /* =================================
           7. CUSTOMER VALIDATION
        ================================= */

        if (!isUuid(customerId)) {
            return jsonResponse(
                {
                    error: "A valid customer is required."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           8. AGENCY VALIDATION
        ================================= */

        if (
            agencyId !== null &&
            !isUuid(agencyId)
        ) {
            return jsonResponse(
                {
                    error: "Invalid source agency."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           9. BOOKING DATE VALIDATION
        ================================= */

        if (!isValidDate(bookingDate)) {
            return jsonResponse(
                {
                    error: "A valid booking date is required."
                },
                400,
                corsHeaders
            );
        }

        if (
            travelDate !== null &&
            !isValidDate(travelDate)
        ) {
            return jsonResponse(
                {
                    error: "Invalid travel date."
                },
                400,
                corsHeaders
            );
        }

        if (
            travelDate &&
            travelDate < bookingDate
        ) {
            return jsonResponse(
                {
                    error: "Travel date cannot be earlier than booking date."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           10. QUOTED AMOUNT VALIDATION
        ================================= */

        if (!isValidAmount(quotedAmount)) {
            return jsonResponse(
                {
                    error: "Please enter a valid quoted amount."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           11. ROUTE VALIDATION
        ================================= */

        if (
            typeof originValue !== "string" ||
            !originValue.trim() ||
            originValue.trim().length > 150
        ) {
            return jsonResponse(
                {
                    error: "Valid departure location is required."
                },
                400,
                corsHeaders
            );
        }

        if (
            typeof destinationValue !== "string" ||
            !destinationValue.trim() ||
            destinationValue.trim().length > 150
        ) {
            return jsonResponse(
                {
                    error: "Valid destination is required."
                },
                400,
                corsHeaders
            );
        }

        const originText = originValue.trim();
        const destinationText = destinationValue.trim();

        if (
            originText.toLowerCase() ===
            destinationText.toLowerCase()
        ) {
            return jsonResponse(
                {
                    error: "Origin and destination cannot be the same."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           12. PASSENGER VALIDATION
        ================================= */

        if (
            !Array.isArray(passengers) ||
            passengers.length < 1 ||
            passengers.length > MAX_PASSENGERS
        ) {
            return jsonResponse(
                {
                    error: `A booking must contain between 1 and ${MAX_PASSENGERS} passengers.`
                },
                400,
                corsHeaders
            );
        }

        const allowedPassengerTypes = [
            "adult",
            "child",
            "infant",
        ];

        const normalizedPassengers = [];

        for (const passenger of passengers) {

            if (
                !passenger ||
                typeof passenger !== "object" ||
                Array.isArray(passenger)
            ) {
                return jsonResponse(
                    {
                        error: "Invalid passenger information."
                    },
                    400,
                    corsHeaders
                );
            }

            if (
                typeof passenger.full_name !== "string" ||
                !passenger.full_name.trim() ||
                passenger.full_name.trim().length > 150
            ) {
                return jsonResponse(
                    {
                        error: "Every passenger must have a valid full name."
                    },
                    400,
                    corsHeaders
                );
            }

            const passengerType =
                passenger.passenger_type || "adult";

            if (
                typeof passengerType !== "string" ||
                !allowedPassengerTypes.includes(passengerType)
            ) {
                return jsonResponse(
                    {
                        error: "Invalid passenger type."
                    },
                    400,
                    corsHeaders
                );
            }

            const passportNumber =
                passenger.passport_number === null ||
                passenger.passport_number === undefined
                    ? null
                    : passenger.passport_number;

            if (
                passportNumber !== null &&
                (
                    typeof passportNumber !== "string" ||
                    passportNumber.trim().length > 30
                )
            ) {
                return jsonResponse(
                    {
                        error: "Invalid passport number."
                    },
                    400,
                    corsHeaders
                );
            }

            const dateOfBirth =
                passenger.date_of_birth === "" ||
                passenger.date_of_birth === null ||
                passenger.date_of_birth === undefined
                    ? null
                    : passenger.date_of_birth;

            if (
                dateOfBirth !== null &&
                !isValidDate(dateOfBirth)
            ) {
                return jsonResponse(
                    {
                        error: "Invalid passenger date of birth."
                    },
                    400,
                    corsHeaders
                );
            }

            normalizedPassengers.push({
                full_name: passenger.full_name.trim(),

                passport_number:
                    typeof passportNumber === "string"
                        ? passportNumber.trim() || null
                        : null,

                date_of_birth: dateOfBirth,

                passenger_type: passengerType,
            });
        }

        /* =================================
           13. NOTES VALIDATION
        ================================= */

        if (
            notes !== null &&
            (
                typeof notes !== "string" ||
                notes.length > MAX_NOTES_LENGTH
            )
        ) {
            return jsonResponse(
                {
                    error: "Invalid booking notes."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           14. CREATE BOOKING THROUGH RPC

           SQL RPC performs:
           - Active staff role verification
           - Customer verification
           - Agency verification
           - Quoted amount validation
           - Booking insertion
           - Passenger insertion
           - Audit log insertion

           All database writes occur
           within the RPC transaction.
        ================================= */

        const {
            data: booking,
            error: bookingError,
        } = await userClient.rpc(
            "create_booking",
            {
                p_customer_id: customerId,
                p_agency_id: agencyId,
                p_booking_date: bookingDate,
                p_travel_date: travelDate,
                p_origin: originText,
                p_destination: destinationText,
                p_notes: notes ? notes.trim() : null,
                p_passengers: normalizedPassengers,
                p_quoted_amount: quotedAmount,
            }
        );

        if (bookingError) {
            console.error(
                "Create booking RPC error:",
                bookingError
            );

            return jsonResponse(
                {
                    error: "Could not create booking.",
                    details: bookingError.message,
                },
                400,
                corsHeaders
            );
        }

        if (!booking || booking.success !== true) {
            return jsonResponse(
                {
                    error:
                        booking?.message ||
                        "Booking could not be created."
                },
                400,
                corsHeaders
            );
        }

        /* =================================
           15. SUCCESS RESPONSE
        ================================= */

        return jsonResponse(
            {
                success: true,
                message: "Booking created successfully.",
                booking: booking,
            },
            201,
            corsHeaders
        );

    } catch (error) {

        console.error(
            "Create booking error:",
            error
        );

        return jsonResponse(
            {
                error: "An unexpected server error occurred."
            },
            500,
            corsHeaders
        );
    }
});
