
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { success: false, message: "Method not allowed." },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");

    if (!url || !anonKey || !serviceKey || !authorization) {
      throw new Error("Server configuration is incomplete.");
    }

    // Authenticate user.
    const userClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Authentication required." },
        { status: 401, headers: corsHeaders }
      );
    }

    // Server-side client.
    const adminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      !["owner", "manager", "accounts_staff"].includes(profile.role)
    ) {
      return Response.json(
        { success: false, message: "You cannot record expenses." },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json();

    const categoryId = body.category_id;
    const accountId = body.account_id;
    const amount = Number(body.amount);
    const expenseDate = body.expense_date;
    const description = body.description;
    const reference = body.reference || null;
    const notes = body.notes || null;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(categoryId || "")) {
      return Response.json(
        { success: false, message: "Invalid expense category." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!uuidPattern.test(accountId || "")) {
      return Response.json(
        { success: false, message: "Invalid cash/bank account." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { success: false, message: "Expense amount must be greater than zero." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (
      typeof description !== "string" ||
      description.trim().length < 2 ||
      description.trim().length > 500
    ) {
      return Response.json(
        { success: false, message: "Please enter a valid description." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (
      typeof expenseDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ||
      Number.isNaN(Date.parse(`${expenseDate}T00:00:00Z`))
    ) {
      return Response.json(
        { success: false, message: "Invalid expense date." },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data, error } = await adminClient.rpc(
      "record_expense",
      {
        p_category_id: categoryId,
        p_account_id: accountId,
        p_amount: amount,
        p_expense_date: expenseDate,
        p_description: description.trim(),
        p_reference: reference,
        p_notes: notes,
        p_user_id: user.id,
      }
    );

    if (error) {
      console.error("Expense recording failed:", error.message);

      return Response.json(
        {
          success: false,
          message: "Expense could not be recorded.",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        message: "Expense recorded successfully.",
        expense_id: data,
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Expense function error:", error);

    return Response.json(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
