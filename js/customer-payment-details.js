
"use strict";

(() => {
    const PAGE_SIZE = 20;

    let supabaseClient = null;
    let currentPayment = null;
    let currentAllocations = [];

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatMoney(value) {
        const amount = Number(value || 0);

        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function formatDateTime(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function showMessage(message, type = "error") {
        const element = $("payment-details-message");

        if (!element) return;

        element.textContent = message;
        element.className = `payment-details-message show ${type}`;
    }

    function clearMessage() {
        const element = $("payment-details-message");

        if (!element) return;

        element.textContent = "";
        element.className = "payment-details-message";
    }

    function setText(id, value, fallback = "—") {
        const element = $(id);

        if (element) {
            element.textContent =
                value === null || value === undefined || value === ""
                    ? fallback
                    : String(value);
        }
    }

    function getPaymentId() {
        return new URLSearchParams(window.location.search).get("id");
    }

    async function initializeSupabase() {
        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            return supabaseClient;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            const result = await window.AuthManager.initialize();

            if (result) {
                supabaseClient = result;
            }
        }

        if (!supabaseClient) {
            throw new Error("Supabase client is not initialized.");
        }

        return supabaseClient;
    }

    async function checkUserSession() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            window.location.href = "login.html";
            return false;
        }

        return true;
    }

    async function loadPayment() {
        const paymentId = getPaymentId();

        if (!paymentId) {
            throw new Error("Payment ID is missing.");
        }

        const { data, error } = await supabaseClient
            .from("customer_payments")
            .select(`
                id,
                receipt_number:payment_reference,
                payment_date,
                amount,
                payment_method,
                payment_reference,
                customer_id,
                recorded_by:received_by,
                notes,
                created_at
            `)
            .eq("id", paymentId)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            throw new Error("Payment record was not found.");
        }

        currentPayment = data;

        return data;
    }

    async function loadCustomer(customerId) {
        if (!customerId) return null;

        const { data, error } = await supabaseClient
            .from("customers")
            .select("id, full_name, phone, email")
            .eq("id", customerId)
            .maybeSingle();

        if (error) throw error;

        return data;
    }

    async function loadAccount(paymentId) {
        if (!paymentId) return null;

        // The receiving account is stored on the cash transaction
        // created together with the payment, not on the payment row.
        const { data: cashTransaction, error: transactionError } =
            await supabaseClient
                .from("cash_transactions")
                .select("account_id")
                .eq("reference_type", "customer_payment")
                .eq("reference_id", paymentId)
                .maybeSingle();

        if (transactionError) throw transactionError;

        if (!cashTransaction?.account_id) return null;

        const accountId = cashTransaction.account_id;

        const { data, error } = await supabaseClient
            .from("cash_accounts")
            .select("id, account_name, account_type")
            .eq("id", accountId)
            .maybeSingle();

        if (error) throw error;

        return data;
    }

    async function loadAllocations(paymentId) {
        const { data, error } = await supabaseClient
            .from("customer_payment_allocations")
            .select(`
                id,
                payment_id,
                sale_id,
                amount:allocated_amount,
                created_at
            `)
            .eq("payment_id", paymentId)
            .order("created_at", { ascending: true })
            .limit(PAGE_SIZE);

        if (error) throw error;

        currentAllocations = data || [];

        return currentAllocations;
    }

    async function loadSaleReferences(allocations) {
        const saleIds = [
            ...new Set(
                allocations
                    .map((allocation) => allocation.sale_id)
                    .filter(Boolean)
            )
        ];

        if (!saleIds.length) return {};

        const { data, error } = await supabaseClient
            .from("ticket_sales")
            .select("id, sale_reference, sale_date")
            .in("id", saleIds);

        if (error) throw error;

        const saleMap = {};

        (data || []).forEach((sale) => {
            saleMap[sale.id] = sale;
        });

        return saleMap;
    }

    function renderPayment(payment) {
        setText("detail-receipt-number", payment.receipt_number);
        setText("detail-payment-amount", formatMoney(payment.amount));
        setText("detail-payment-date", formatDate(payment.payment_date));
        setText("detail-payment-method", payment.payment_method);
        setText("detail-payment-reference", payment.payment_reference);

        setText("detail-customer-id", payment.customer_id);
        setText("detail-account-name", "Loading...");
        setText("detail-account-type", "Loading...");

        setText("detail-payment-notes", payment.notes);
        setText("detail-recorded-by", payment.recorded_by);
        setText("detail-created-at", formatDateTime(payment.created_at));

        const statusElement = $("detail-payment-status");

        if (statusElement) {
            statusElement.textContent = "Recorded";
            statusElement.className = "badge badge-success";
        }
    }

    function renderCustomer(customer) {
        setText(
            "detail-customer-name",
            customer?.full_name,
            "Customer information unavailable"
        );

        setText("detail-customer-phone", customer?.phone);
        setText("detail-customer-email", customer?.email);
    }

    function renderAccount(account) {
        setText(
            "detail-account-name",
            account?.account_name,
            "Not specified"
        );

        setText(
            "detail-account-type",
            account?.account_type,
            "Not specified"
        );
    }

    function renderAllocations(allocations, saleMap) {
        const tbody = $("payment-allocations-body");

        if (!tbody) return;

        if (!allocations.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">
                        No sales allocations found for this payment.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = allocations.map((allocation, index) => {
            const sale = saleMap[allocation.sale_id] || {};

            const reference =
                sale.sale_reference ||
                allocation.sale_id ||
                "—";

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHTML(reference)}</td>
                    <td>${formatMoney(allocation.amount)}</td>
                    <td>${formatDate(allocation.created_at)}</td>
                </tr>
            `;
        }).join("");
    }

    function renderSummary(payment, allocations) {
        const paymentAmount = Number(payment.amount || 0);

        const allocatedAmount = allocations.reduce(
            (total, item) => total + Number(item.amount || 0),
            0
        );

        const unallocatedAmount = Math.max(
            0,
            paymentAmount - allocatedAmount
        );

        setText("detail-total-allocated", formatMoney(allocatedAmount));

        setText("summary-payment-amount", formatMoney(paymentAmount));
        setText("summary-allocated-amount", formatMoney(allocatedAmount));
        setText("summary-unallocated-amount", formatMoney(unallocatedAmount));
    }

    async function loadPaymentDetails() {
        clearMessage();

        const payment = await loadPayment();

        renderPayment(payment);

        const [customer, account, allocations] = await Promise.all([
            loadCustomer(payment.customer_id),
            loadAccount(payment.id),
            loadAllocations(payment.id)
        ]);

        renderCustomer(customer);
        renderAccount(account);

        const saleMap = await loadSaleReferences(allocations);

        renderAllocations(allocations, saleMap);
        renderSummary(payment, allocations);
    }

    function setupActions() {
        const printButton = $("print-payment-button");

        if (printButton) {
            printButton.addEventListener("click", () => {
                if (!currentPayment) {
                    showMessage("Payment information is not loaded.");
                    return;
                }

                window.print();
            });
        }

        const backButton = $("back-to-payments-button");

        if (backButton) {
            backButton.addEventListener("click", () => {
                window.location.href = "customer-payments.html";
            });
        }
    }

    async function initializePage() {
        try {
            await initializeSupabase();

            const authenticated = await checkUserSession();

            if (!authenticated) return;

            await loadPaymentDetails();

            setupActions();

        } catch (error) {
            console.error("Payment details error:", error);

            showMessage(
                error.message || "Unable to load payment details."
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initializePage);
})();
