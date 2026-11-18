
import { createClient } from "npm:@supabase/supabase-js@2";

/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   RECORD CUSTOMER REFUND
   Supabase Edge Function
========================================================= */

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

function getCorsHeaders(origin: string | null) {

    const headers: Record<string, string> = {
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };

    if (origin && allowedOrigins.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }

    return headers;
}

function jsonResponse(
    body: Record<string, unknown>,
    status: number,
    headers: Record<string, string>
) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...headers,
            "Content-Type": "application/json"
        }
    });
}

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {

    const origin = req.headers.get("Origin");
    const headers = getCorsHeaders(origin);

    /* =====================================================
       CORS
    ===================================================== */

    if (origin && !allowedOrigins.includes(origin)) {
        return jsonResponse(
            {
                success: false,
                message: "Origin is not allowed."
            },
            403,
            headers
        );
    }

    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers
        });
    }

    if (req.method !== "POST") {
        return jsonResponse(
            {
                success: false,
                message: "Method not allowed."
            },
            405,
            headers
        );
    }

    try {

        /* =================================================
           ENVIRONMENT
        ================================================= */

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

        const authorization =
            req.headers.get("Authorization");

        if (!supabaseUrl || !anonKey) {
            console.error("Supabase environment is incomplete.");

            return jsonResponse(
                {
                    success: false,
                    message: "Server configuration is incomplete."
                },
                500,
                headers
            );
        }

        if (!authorization ||
            !authorization.startsWith("Bearer ")) {

            return jsonResponse(
                {
                    success: false,
                    message: "Authentication required."
                },
                401,
                headers
            );
        }

        /* =================================================
           USER CLIENT
           Preserve the user's JWT for auth.uid() in RPC.
        ================================================= */

        const userClient = createClient(
            supabaseUrl,
            anonKey,
            {
                global: {
                    headers: {
                        Authorization: authorization
                    }
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        /* =================================================
           VERIFY USER
        ================================================= */

        const {
            data: { user },
            error: authError
        } = await userClient.auth.getUser();

        if (authError || !user) {
            return jsonResponse(
                {
                    success: false,
                    message: "Your session is invalid or expired."
                },
                401,
                headers
            );
        }

        /* =================================================
           READ REQUEST BODY
        ================================================= */

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid request body."
                },
                400,
                headers
            );
        }

        const salePassengerId = body.sale_passenger_id;
        const refundAmount = Number(body.refund_amount);
        const refundType = body.refund_type;
        const reason = body.reason;
        const reference = body.reference ?? null;
        const notes = body.notes ?? null;
        const accountId = body.account_id;

        /* =================================================
           VALIDATE TICKET ID
        ================================================= */

        if (
            typeof salePassengerId !== "string" ||
            !uuidPattern.test(salePassengerId)
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid ticket reference."
                },
                400,
                headers
            );
        }

        /* =================================================
           VALIDATE REFUND AMOUNT
        ================================================= */

        if (
            !Number.isFinite(refundAmount) ||
            refundAmount <= 0 ||
            !Number.isInteger(
                Math.round(refundAmount * 100)
            )
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Enter a valid refund amount."
                },
                400,
                headers
            );
        }

        /* =================================================
           REFUND TYPE
           Only customer refunds are currently supported.
        ================================================= */

        if (refundType !== "customer") {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "Only customer refunds are currently supported."
                },
                400,
                headers
            );
        }

        /* =================================================
           VALIDATE REASON
        ================================================= */

        if (
            typeof reason !== "string" ||
            reason.trim().length < 3 ||
            reason.trim().length > 500
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Please provide a valid refund reason."
                },
                400,
                headers
            );
        }

        /* =================================================
           VALIDATE ACCOUNT
        ================================================= */

        if (
            typeof accountId !== "string" ||
            !uuidPattern.test(accountId)
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Please select a valid payment account."
                },
                400,
                headers
            );
        }

        /* =================================================
           VALIDATE REFERENCE
        ================================================= */

        if (
            reference !== null &&
            (
                typeof reference !== "string" ||
                reference.trim().length > 100
            )
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid refund reference."
                },
                400,
                headers
            );
        }

        /* =================================================
           VALIDATE NOTES
        ================================================= */

        if (
            notes !== null &&
            (
                typeof notes !== "string" ||
                notes.length > 2000
            )
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Refund notes are too long."
                },
                400,
                headers
            );
        }

        /* =================================================
           CALL DATABASE RPC
           SQL function independently verifies:
           - Authenticated user
           - Active profile
           - Role permissions
           - Ticket and sale
           - Account status
           - Remaining refundable amount
           - Atomic transaction
        ================================================= */

        const { data, error } = await userClient.rpc(
            "record_ticket_refund",
            {
                p_sale_passenger_id: salePassengerId,
                p_refund_amount: refundAmount,
                p_refund_type: "customer",
                p_reason: reason.trim(),
                p_reference:
                    typeof reference === "string"
                        ? reference.trim() || null
                        : null,
                p_notes:
                    typeof notes === "string"
                        ? notes.trim() || null
                        : null,
                p_account_id: accountId
            }
        );

        if (error) {

            console.error(
                "record_ticket_refund RPC error:",
                error.message
            );

            return jsonResponse(
                {
                    success: false,
                    message: error.message ||
                        "Refund could not be processed."
                },
                400,
                headers
            );
        }

        /* =================================================
           SUCCESS
        ================================================= */

        return jsonResponse(
            {
                success: true,
                message: "Customer refund recorded successfully.",
                refund_id: data
            },
            200,
            headers
        );

    } catch (error) {

        console.error("Record refund error:", error);

        return jsonResponse(
            {
                success: false,
                message: "An unexpected server error occurred."
            },
            500,
            headers
        );
    }
});
