
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin":
        Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function response(
    body: Record<string, unknown>,
    status = 200
) {
    return new Response(JSON.stringify(body), {
        status,
        headers: corsHeaders
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }

    if (req.method !== "POST") {
        return response({
            success: false,
            message: "Method not allowed."
        }, 405);
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error("Supabase environment configuration is missing.");
        }

        const authorization = req.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
            return response({
                success: false,
                message: "Authentication required."
            }, 401);
        }

        // User-scoped client preserves auth.uid() inside the SQL RPC.
        const supabase = createClient(
            supabaseUrl,
            supabaseAnonKey,
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

        // Verify authenticated user.
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return response({
                success: false,
                message: "Invalid or expired session."
            }, 401);
        }

        const body = await req.json();

        const transactionId = body?.transaction_id;

        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (
            typeof transactionId !== "string" ||
            !uuidPattern.test(transactionId)
        ) {
            return response({
                success: false,
                message: "A valid transaction ID is required."
            }, 400);
        }

        // SQL RPC checks the user's role and active profile.
        // Do not use a service-role client for this RPC.
        const { data, error } = await supabase.rpc(
            "get_cash_transaction_details",
            {
                p_transaction_id: transactionId
            }
        );

        if (error) {
            console.error(
                "get_cash_transaction_details RPC error:",
                error.message
            );

            return response({
                success: false,
                message: "Unable to retrieve transaction details."
            }, 400);
        }

        if (!data || data.success !== true || !data.transaction) {
            return response({
                success: false,
                message: data?.message || "Transaction not found."
            }, 404);
        }

        return response({
            success: true,
            transaction: data.transaction
        });

    } catch (error) {
        console.error(
            "Cash transaction details error:",
            error instanceof Error ? error.message : error
        );

        return response({
            success: false,
            message: "An unexpected server error occurred."
        }, 500);
    }
});
