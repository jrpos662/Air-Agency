
import { createClient } from "npm:@supabase/supabase-js@2";

/* =========================================================
   CUSTOMER PAYMENT EDGE FUNCTION

   - JWT authenticated RPC
   - No service_role required
   - ALLOWED_ORIGINS environment variable supported
========================================================= */

const allowedOrigins = (
    Deno.env.get("ALLOWED_ORIGINS") || "*"
)
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

function getCorsHeaders(origin: string | null) {
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

function jsonResponse(
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

Deno.serve(async (req: Request) => {
    const origin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);

    // -----------------------------------------------------
    // CORS
    // -----------------------------------------------------

    if (
        origin &&
        !allowedOrigins.includes("*") &&
        !allowedOrigins.includes(origin)
    ) {
        return jsonResponse(
            {
                success: false,
                message: "Origin is not allowed.",
            },
            403,
            corsHeaders
        );
    }

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            status: 200,
            headers: corsHeaders,
        });
    }

    if (req.method !== "POST") {
        return jsonResponse(
            {
                success: false,
                message: "Method not allowed.",
            },
            405,
            corsHeaders
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
                "Supabase server configuration is incomplete."
            );
        }

        if (!authorization) {
            return jsonResponse(
                {
                    success: false,
                    message: "Authentication required.",
                },
                401,
                corsHeaders
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
            return jsonResponse(
                {
                    success: false,
                    message: "Authentication required.",
                },
                401,
                corsHeaders
            );
        }

        // -------------------------------------------------
        // 3. REQUEST BODY
        // -------------------------------------------------

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid request body.",
                },
                400,
                corsHeaders
            );
        }

        const customerId = body.customer_id;
        const accountId = body.account_id;

        const amount = Number(body.amount);

        const paymentMethod =
            String(body.payment_method || "")
                .trim()
                .toLowerCase();

        const paymentDate =
            String(body.payment_date || "").trim();

        const paymentReference =
            body.payment_reference
                ? String(body.payment_reference).trim()
                : null;

        const notes =
            body.notes
                ? String(body.notes)
                : null;

        const allocations = body.allocations ?? [];

        // -------------------------------------------------
        // 4. VALIDATION
        // -------------------------------------------------

        if (!isUUID(customerId)) {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid customer ID.",
                },
                400,
                corsHeaders
            );
        }

        if (!isUUID(accountId)) {
            return jsonResponse(
                {
                    success: false,
                    message: "A valid receiving account is required.",
                },
                400,
                corsHeaders
            );
        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Payment amount must be greater than zero.",
                },
                400,
                corsHeaders
            );
        }

        if (
            ![
                "cash",
                "bank",
                "mobile_banking",
                "card",
                "other",
            ].includes(paymentMethod)
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid payment method.",
                },
                400,
                corsHeaders
            );
        }

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "A valid payment date is required.",
                },
                400,
                corsHeaders
            );
        }

        if (
            !Array.isArray(allocations) ||
            allocations.length > 20
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "Invalid payment allocations.",
                },
                400,
                corsHeaders
            );
        }

        const seenSales = new Set<string>();

        let allocatedTotal = 0;

        for (const item of allocations) {
            if (
                !item ||
                !isUUID(item.sale_id)
            ) {
                return jsonResponse(
                    {
                        success: false,
                        message: "Invalid sale allocation.",
                    },
                    400,
                    corsHeaders
                );
            }

            const allocationAmount =
                Number(item.amount);

            if (
                !Number.isFinite(allocationAmount) ||
                allocationAmount <= 0
            ) {
                return jsonResponse(
                    {
                        success: false,
                        message: "Invalid allocation amount.",
                    },
                    400,
                    corsHeaders
                );
            }

            if (seenSales.has(item.sale_id)) {
                return jsonResponse(
                    {
                        success: false,
                        message: "Duplicate sale allocation.",
                    },
                    400,
                    corsHeaders
                );
            }

            seenSales.add(item.sale_id);

            allocatedTotal += allocationAmount;
        }

        if (allocatedTotal > amount + 0.005) {
            return jsonResponse(
                {
                    success: false,
                    message: "Allocated amount cannot exceed payment amount.",
                },
                400,
                corsHeaders
            );
        }

        // -------------------------------------------------
        // 5. DATABASE RPC
        // -------------------------------------------------

        const { data, error } = await supabase.rpc(
            "record_customer_payment",
            {
                p_customer_id: customerId,
                p_amount: amount,
                p_payment_method: paymentMethod,
                p_account_id: accountId,
                p_payment_date: paymentDate,
                p_payment_reference: paymentReference,
                p_notes: notes,
                p_allocations: allocations,
            }
        );

        if (error) {
            console.error(
                "Customer payment RPC error:",
                error.message
            );

            return jsonResponse(
                {
                    success: false,
                    message: error.message ||
                        "Payment could not be recorded.",
                },
                400,
                corsHeaders
            );
        }

        if (!data || data.success !== true) {
            return jsonResponse(
                {
                    success: false,
                    message: "Payment could not be confirmed.",
                },
                400,
                corsHeaders
            );
        }

        // -------------------------------------------------
        // 6. SUCCESS
        // -------------------------------------------------

        return jsonResponse(
            {
                success: true,
                message:
                    "Customer payment recorded successfully.",
                payment_id: data.payment_id,
                receipt_number: data.payment_reference,
                amount: data.amount,
                allocated_amount: data.allocated_amount,
                unallocated_amount: data.unallocated_amount,
            },
            200,
            corsHeaders
        );

    } catch (error) {
        console.error(
            "Customer payment function error:",
            error
        );

        return jsonResponse(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "An unexpected server error occurred.",
            },
            500,
            corsHeaders
        );
    }
});
