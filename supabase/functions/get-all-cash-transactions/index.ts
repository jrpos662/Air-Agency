
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders
    });
}

function isValidDate(value: unknown): value is string {
    if (typeof value !== "string") return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function isValidUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request: Request) => {

    if (request.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }

    if (request.method !== "POST") {
        return jsonResponse({
            success: false,
            message: "Method not allowed."
        }, 405);
    }

    try {
        // ---------------------------------------------
        // 1. Environment configuration
        // ---------------------------------------------

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

        if (!supabaseUrl || !anonKey) {
            throw new Error("Server configuration is incomplete.");
        }

        // ---------------------------------------------
        // 2. Verify authorization header
        // ---------------------------------------------

        const authorization = request.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
            return jsonResponse({
                success: false,
                message: "Authentication required."
            }, 401);
        }

        // ---------------------------------------------
        // 3. Create user-scoped Supabase client
        // ---------------------------------------------

        const supabase = createClient(
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
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        // ---------------------------------------------
        // 4. Verify logged-in user
        // ---------------------------------------------

        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return jsonResponse({
                success: false,
                message: "Your session is invalid or expired."
            }, 401);
        }

        // ---------------------------------------------
        // 5. Read request body
        // ---------------------------------------------

        const body = await request.json();

        const search =
            typeof body.search === "string"
                ? body.search.trim()
                : "";

        const accountType = body.account_type ?? "all";
        const transactionType = body.transaction_type ?? "all";

        const accountId = body.account_id;

        const dateFrom = body.date_from || null;
        const dateTo = body.date_to || null;

        const page = Number(body.page ?? 1);
        const pageSize = Number(body.page_size ?? 10);

        // ---------------------------------------------
        // 6. Validate filters
        // ---------------------------------------------

        if (search.length > 200) {
            return jsonResponse({
                success: false,
                message: "Search text is too long."
            }, 400);
        }

        const allowedAccountTypes = [
            "all",
            "cash",
            "bank",
            "mobile_banking"
        ];

        if (!allowedAccountTypes.includes(accountType)) {
            return jsonResponse({
                success: false,
                message: "Invalid account type."
            }, 400);
        }

        const allowedTransactionTypes = [
            "all",
            "in",
            "out",
            "transfer"
        ];

        if (!allowedTransactionTypes.includes(transactionType)) {
            return jsonResponse({
                success: false,
                message: "Invalid transaction type."
            }, 400);
        }

        if (
            accountId !== undefined &&
            accountId !== null &&
            accountId !== "" &&
            accountId !== "all" &&
            (
                typeof accountId !== "string" ||
                !isValidUUID(accountId)
            )
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid account ID."
            }, 400);
        }

        if (
            dateFrom !== null &&
            !isValidDate(dateFrom)
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid start date."
            }, 400);
        }

        if (
            dateTo !== null &&
            !isValidDate(dateTo)
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid end date."
            }, 400);
        }

        if (dateFrom && dateTo && dateFrom > dateTo) {
            return jsonResponse({
                success: false,
                message: "Start date cannot be later than end date."
            }, 400);
        }

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            page > 1000000
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid page number."
            }, 400);
        }

        if (
            !Number.isInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 100
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid page size."
            }, 400);
        }

        // ---------------------------------------------
        // 7. Call RPC using user's JWT
        // Important: Do not use service_role here.
        // SQL function depends on auth.uid().
        // ---------------------------------------------

        const { data, error } = await supabase.rpc(
            "get_all_cash_transactions",
            {
                p_search: search,
                p_account_id:
                    accountId && accountId !== "all"
                        ? accountId
                        : null,
                p_account_type: accountType,
                p_transaction_type: transactionType,
                p_date_from: dateFrom,
                p_date_to: dateTo,
                p_page: page,
                p_page_size: pageSize
            }
        );

        if (error) {
            console.error("All transactions RPC error:", error);

            return jsonResponse({
                success: false,
                message: "Unable to retrieve transactions."
            }, 400);
        }

        if (!data || data.success !== true) {
            return jsonResponse({
                success: false,
                message: "Invalid transaction response."
            }, 500);
        }

        // ---------------------------------------------
        // 8. Successful response
        // ---------------------------------------------

        return jsonResponse(data, 200);

    } catch (error) {
        console.error("All transactions function error:", error);

        return jsonResponse({
            success: false,
            message: error instanceof Error
                ? error.message
                : "An unexpected server error occurred."
        }, 500);
    }
});
