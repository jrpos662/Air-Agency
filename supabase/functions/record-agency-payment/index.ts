
import { createClient } from "npm:@supabase/supabase-js@2";

/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   RECORD AGENCY PAYMENT

   Authenticated JWT RPC
   No service_role required
========================================================= */

const allowedOrigins = (
    Deno.env.get("ALLOWED_ORIGINS") || "*"
)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

function corsHeaders(origin: string | null) {
    const allowOrigin =
        allowedOrigins.includes("*")
            ? "*"
            : origin && allowedOrigins.includes(origin)
                ? origin
                : "";

    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

function response(
    body: Record<string, unknown>,
    status: number,
    headers: Record<string, string>
) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...headers,
                "Content-Type": "application/json",
            },
        }
    );
}

function isUUID(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

function isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function getDhakaToday(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const result: Record<string, string> = {};

    for (const part of parts) {
        result[part.type] = part.value;
    }

    return `${result.year}-${result.month}-${result.day}`;
}

Deno.serve(async (req: Request) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    // -----------------------------------------------------
    // CORS
    // -----------------------------------------------------

    if (
        origin &&
        !allowedOrigins.includes("*") &&
        !allowedOrigins.includes(origin)
    ) {
        return response(
            {
                success: false,
                message: "Origin is not allowed.",
            },
            403,
            headers
        );
    }

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            status: 200,
            headers,
        });
    }

    if (req.method !== "POST") {
        return response(
            {
                success: false,
                message: "Method not allowed.",
            },
            405,
            headers
        );
    }

    try {
        // -------------------------------------------------
        // 1. ENVIRONMENT
        // -------------------------------------------------

        const supabaseUrl =
            Deno.env.get("SUPABASE_URL");

        const anonKey =
            Deno.env.get("SUPABASE_ANON_KEY");

        const authorization =
            req.headers.get("Authorization");

        if (!supabaseUrl || !anonKey) {
            throw new Error(
                "Supabase configuration is incomplete."
            );
        }

        if (!authorization) {
            return response(
                {
                    success: false,
                    message: "Authentication required.",
                },
                401,
                headers
            );
        }

        // -------------------------------------------------
        // 2. USER JWT CLIENT
        // -------------------------------------------------

        const supabase = createClient(
            supabaseUrl,
            anonKey,
            {
                global: {
                    headers: {
                        Authorization: authorization,
                    },
                },
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return response(
                {
                    success: false,
                    message: "Invalid or expired session.",
                },
                401,
                headers
            );
        }

        // -------------------------------------------------
        // 3. REQUEST BODY
        // -------------------------------------------------

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return response(
                {
                    success: false,
                    message: "Invalid request body.",
                },
                400,
                headers
            );
        }

        const agencyId = body.agency_id;
        const accountId = body.account_id;

        const amount = Number(body.amount);

        const paymentMethod =
            String(body.payment_method || "")
                .trim()
                .toLowerCase();

        const paymentDate =
            String(body.payment_date || "").trim();

        const paymentReference =
            body.payment_reference ?? body.reference ?? null;

        const transactionReference =
            body.transaction_reference ?? null;

        const notes =
            body.notes ?? null;

        // -------------------------------------------------
        // 4. VALIDATION
        // -------------------------------------------------

        if (!isUUID(agencyId)) {
            return response(
                {
                    success: false,
                    message: "A valid agency ID is required.",
                },
                400,
                headers
            );
        }

        if (!isUUID(accountId)) {
            return response(
                {
                    success: false,
                    message: "A valid payment account is required.",
                },
                400,
                headers
            );
        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            amount > 999999999999.99 ||
            Math.round(amount * 100) !== amount * 100
        ) {
            return response(
                {
                    success: false,
                    message: "Enter a valid payment amount with up to two decimal places.",
                },
                400,
                headers
            );
        }

        if (
            ![
                "cash",
                "bank",
                "mobile_banking",
                "card",
            ].includes(paymentMethod)
        ) {
            return response(
                {
                    success: false,
                    message: "Invalid payment method.",
                },
                400,
                headers
            );
        }

        if (!isValidDate(paymentDate)) {
            return response(
                {
                    success: false,
                    message: "A valid payment date is required.",
                },
                400,
                headers
            );
        }

        if (paymentDate > getDhakaToday()) {
            return response(
                {
                    success: false,
                    message: "Payment date cannot be in the future.",
                },
                400,
                headers
            );
        }

        if (
            paymentReference !== null &&
            (
                typeof paymentReference !== "string" ||
                paymentReference.length > 100
            )
        ) {
            return response(
                {
                    success: false,
                    message: "Invalid payment reference.",
                },
                400,
                headers
            );
        }

        if (
            transactionReference !== null &&
            (
                typeof transactionReference !== "string" ||
                transactionReference.length > 150
            )
        ) {
            return response(
                {
                    success: false,
                    message: "Invalid transaction reference.",
                },
                400,
                headers
            );
        }

        if (
            notes !== null &&
            (
                typeof notes !== "string" ||
                notes.length > 2000
            )
        ) {
            return response(
                {
                    success: false,
                    message: "Invalid payment notes.",
                },
                400,
                headers
            );
        }

        // -------------------------------------------------
        // 5. CALL ATOMIC RPC
        // -------------------------------------------------

        const { data, error } = await supabase.rpc(
            "record_agency_payment",
            {
                p_agency_id: agencyId,
                p_amount: amount,
                p_payment_method: paymentMethod,
                p_account_id: accountId,
                p_payment_date: paymentDate,
                p_payment_reference:
                    typeof paymentReference === "string"
                        ? paymentReference.trim() || null
                        : null,
                p_transaction_reference:
                    typeof transactionReference === "string"
                        ? transactionReference.trim() || null
                        : null,
                p_notes:
                    typeof notes === "string"
                        ? notes.trim() || null
                        : null,
            }
        );

        if (error) {
            console.error(
                "Agency payment RPC error:",
                error.message
            );

            return response(
                {
                    success: false,
                    message:
                        error.message ||
                        "Agency payment could not be recorded.",
                },
                400,
                headers
            );
        }

        if (!data || data.success !== true) {
            return response(
                {
                    success: false,
                    message:
                        "Agency payment could not be confirmed.",
                },
                400,
                headers
            );
        }

        // -------------------------------------------------
        // 6. SUCCESS
        // -------------------------------------------------

        return response(
            {
                success: true,
                message:
                    "Agency payment recorded successfully.",
                payment_id: data.payment_id,
                payment_reference: data.payment_reference,
                agency_id: data.agency_id,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_date: data.payment_date,
            },
            200,
            headers
        );

    } catch (error) {
        console.error(
            "Agency payment function error:",
            error
        );

        return response(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "An unexpected server error occurred.",
            },
            500,
            headers
        );
    }
});
