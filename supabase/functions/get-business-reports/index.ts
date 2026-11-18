
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   GET BUSINESS REPORTS
   Secure Supabase Edge Function
========================================================= */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =========================================================
   ENVIRONMENT
========================================================= */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

/*
  Comma-separated allowed origins.

  Example:
  ALLOWED_ORIGINS=https://your-domain.com,http://localhost:3000,capacitor://localhost
*/

const ALLOWED_ORIGINS = (
    Deno.env.get("ALLOWED_ORIGINS") || ""
)
    .split(",")
    .map(origin => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

const ALLOWED_ROLES = [
    "owner",
    "manager",
    "ticket_staff",
    "accounts_staff"
];

const ALLOWED_REPORT_TYPES = [
    "all",
    "sales",
    "bookings",
    "customer_due",
    "agency_payable",
    "expenses",
    "cash_bank",
    "profit_loss"
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;


/* =========================================================
   CORS
========================================================= */

function getCorsHeaders(origin: string | null): HeadersInit {
    const headers: Record<string, string> = {
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",

        "Access-Control-Allow-Methods":
            "POST, OPTIONS",

        "Access-Control-Max-Age": "86400",

        "Vary": "Origin"
    };

    if (origin) {
        const normalizedOrigin = origin.replace(/\/$/, "");

        if (ALLOWED_ORIGINS.includes(normalizedOrigin)) {
            headers["Access-Control-Allow-Origin"] = normalizedOrigin;
        }
    }

    return headers;
}

function isAllowedOrigin(origin: string | null): boolean {
    if (!origin) {
        return true;
    }

    return ALLOWED_ORIGINS.includes(
        origin.replace(/\/$/, "")
    );
}


/* =========================================================
   RESPONSE
========================================================= */

function sendResponse(
    body: Record<string, unknown>,
    status = 200,
    origin: string | null = null
): Response {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...getCorsHeaders(origin),
                "Content-Type": "application/json",
                "Cache-Control": "no-store"
            }
        }
    );
}

function sendError(
    message: string,
    status: number,
    origin: string | null
): Response {
    return sendResponse(
        {
            success: false,
            message
        },
        status,
        origin
    );
}


/* =========================================================
   DATE VALIDATION
========================================================= */

function isValidDate(value: unknown): boolean {
    if (typeof value !== "string") {
        return false;
    }

    if (!DATE_PATTERN.test(value)) {
        return false;
    }

    const [year, month, day] = value
        .split("-")
        .map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}


/* =========================================================
   MAIN HANDLER
========================================================= */

Deno.serve(async (req: Request): Promise<Response> => {

    const origin = req.headers.get("Origin");

    /* -----------------------------------------------------
       ORIGIN CHECK
    ----------------------------------------------------- */

    if (!isAllowedOrigin(origin)) {
        return sendError(
            "Origin is not allowed.",
            403,
            null
        );
    }

    /* -----------------------------------------------------
       OPTIONS / PREFLIGHT
    ----------------------------------------------------- */

    if (req.method === "OPTIONS") {
        return new Response(
            null,
            {
                status: 204,
                headers: getCorsHeaders(origin)
            }
        );
    }

    /* -----------------------------------------------------
       METHOD CHECK
    ----------------------------------------------------- */

    if (req.method !== "POST") {
        return sendError(
            "Method not allowed.",
            405,
            origin
        );
    }

    try {

        /* -------------------------------------------------
           ENVIRONMENT CHECK
        ------------------------------------------------- */

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.error("Supabase environment configuration missing.");

            return sendError(
                "Server configuration is incomplete.",
                500,
                origin
            );
        }

        if (!ALLOWED_ORIGINS.length) {
            console.error("ALLOWED_ORIGINS is not configured.");

            return sendError(
                "Server origin configuration is incomplete.",
                500,
                origin
            );
        }

        /* -------------------------------------------------
           AUTHENTICATION TOKEN
        ------------------------------------------------- */

        const authorization = req.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
            return sendError(
                "Authentication required.",
                401,
                origin
            );
        }

        const token = authorization
            .slice("Bearer ".length)
            .trim();

        if (!token) {
            return sendError(
                "Invalid authentication token.",
                401,
                origin
            );
        }

        /* -------------------------------------------------
           AUTHENTICATED SUPABASE CLIENT

           Uses the user's JWT.
           Never use service_role here.
        ------------------------------------------------- */

        const supabase = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },

                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        /* -------------------------------------------------
           VERIFY USER
        ------------------------------------------------- */

        const {
            data: userData,
            error: userError
        } = await supabase.auth.getUser(token);

        if (userError || !userData.user) {
            return sendError(
                "Your session is invalid or expired.",
                401,
                origin
            );
        }

        const userId = userData.user.id;

        /* -------------------------------------------------
           ACTIVE PROFILE CHECK
        ------------------------------------------------- */

        const {
            data: profile,
            error: profileError
        } = await supabase
            .from("profiles")
            .select("id, role, is_active")
            .eq("id", userId)
            .maybeSingle();

        if (profileError) {
            console.error(
                "Profile verification failed:",
                profileError.message
            );

            return sendError(
                "Unable to verify your account.",
                500,
                origin
            );
        }

        if (!profile || profile.is_active !== true) {
            return sendError(
                "Your account is inactive or unavailable.",
                403,
                origin
            );
        }

        const role = String(profile.role || "")
            .toLowerCase();

        if (!ALLOWED_ROLES.includes(role)) {
            return sendError(
                "You do not have permission to view reports.",
                403,
                origin
            );
        }

        /* -------------------------------------------------
           REQUEST BODY
        ------------------------------------------------- */

        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return sendError(
                "Invalid request body.",
                400,
                origin
            );
        }

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return sendError(
                "Invalid report request.",
                400,
                origin
            );
        }

        /* -------------------------------------------------
           REPORT TYPE
        ------------------------------------------------- */

        const reportType = String(
            body.report_type || "all"
        );

        if (!ALLOWED_REPORT_TYPES.includes(reportType)) {
            return sendError(
                "Invalid report type.",
                400,
                origin
            );
        }

        /* -------------------------------------------------
           DATE VALIDATION
        ------------------------------------------------- */

        const dateFrom = body.date_from || null;
        const dateTo = body.date_to || null;

        if (
            dateFrom !== null &&
            !isValidDate(dateFrom)
        ) {
            return sendError(
                "Invalid start date.",
                400,
                origin
            );
        }

        if (
            dateTo !== null &&
            !isValidDate(dateTo)
        ) {
            return sendError(
                "Invalid end date.",
                400,
                origin
            );
        }

        if (
            dateFrom &&
            dateTo &&
            String(dateFrom) > String(dateTo)
        ) {
            return sendError(
                "Invalid date range.",
                400,
                origin
            );
        }

        /* -------------------------------------------------
           PAGINATION
        ------------------------------------------------- */

        const page = Number(body.page ?? 1);
        const pageSize = Number(body.page_size ?? 10);

        if (
            !Number.isSafeInteger(page) ||
            page < 1 ||
            page > 1000000
        ) {
            return sendError(
                "Invalid page number.",
                400,
                origin
            );
        }

        if (
            !Number.isSafeInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 100
        ) {
            return sendError(
                "Invalid page size.",
                400,
                origin
            );
        }

        /* -------------------------------------------------
           PROFIT & LOSS ACCESS
        ------------------------------------------------- */

        if (
            reportType === "profit_loss" &&
            !["owner", "manager"].includes(role)
        ) {
            return sendError(
                "You are not allowed to view Profit & Loss reports.",
                403,
                origin
            );
        }

        /* -------------------------------------------------
           DATABASE RPC

           RPC independently checks:
           - Authentication
           - Active profile
           - User role
           - Profit access

           User JWT is forwarded automatically.
        ------------------------------------------------- */

        const {
            data: reportData,
            error: reportError
        } = await supabase.rpc(
            "get_business_reports",
            {
                p_date_from: dateFrom,
                p_date_to: dateTo,
                p_report_type: reportType,
                p_page: page,
                p_page_size: pageSize
            }
        );

        if (reportError) {
            console.error(
                "Business reports RPC error:",
                reportError.message
            );

            return sendError(
                "Unable to generate the requested report.",
                500,
                origin
            );
        }

        if (
            !reportData ||
            reportData.success !== true
        ) {
            return sendError(
                "No valid report data was returned.",
                500,
                origin
            );
        }

        /* -------------------------------------------------
           FINAL RESPONSE
        ------------------------------------------------- */

        return sendResponse(
            {
                ...reportData,
                role
            },
            200,
            origin
        );

    } catch (error) {

        console.error(
            "Unexpected Reports Function Error:",
            error
        );

        return sendError(
            "An unexpected server error occurred.",
            500,
            origin
        );
    }
});
