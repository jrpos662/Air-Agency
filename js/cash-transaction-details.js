
"use strict";

/* ========================================
   Cash Transaction Details
======================================== */

document.addEventListener("DOMContentLoaded", () => {
    initializeCashTransactionDetails();
});

const CashTransactionDetails = (() => {
    const PAGE_SIZE = 1;

    let supabaseClient = null;
    let transactionId = null;

    const elements = {};

    function getElements() {
        const ids = [
            "refresh-cash-transaction",
            "print-cash-transaction",
            "cash-transaction-details-message",
            "detail-transaction-reference",
            "detail-transaction-status",
            "detail-transaction-amount",
            "detail-transaction-date",
            "detail-transaction-id",
            "detail-transaction-created-at",
            "detail-account-name",
            "detail-account-type",
            "detail-account-provider",
            "detail-account-number",
            "detail-transaction-type",
            "detail-reference-type",
            "detail-reference-number",
            "detail-transaction-recorded-by",
            "detail-transaction-description",
            "linked-transfer-card",
            "detail-transfer-from",
            "detail-transfer-to",
            "view-linked-transfer"
        ];

        ids.forEach(id => {
            elements[id] = document.getElementById(id);
        });
    }

    function showMessage(message, type = "info") {
        const target = elements["cash-transaction-details-message"];
        if (!target) return;

        target.textContent = message;
        target.className = `alert alert-${type}`;
        target.style.display = "block";
    }

    function clearMessage() {
        const target = elements["cash-transaction-details-message"];
        if (!target) return;

        target.textContent = "";
        target.style.display = "none";
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
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

    function formatDate(value, includeTime = false) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            ...(includeTime ? {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            } : {})
        }).format(date);
    }

    function setText(id, value, fallback = "—") {
        const element = elements[id];
        if (!element) return;

        element.textContent =
            value !== null && value !== undefined && value !== ""
                ? String(value)
                : fallback;
    }

    function getClient() {
        if (window.supabaseClient) {
            return Promise.resolve(window.supabaseClient);
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            return Promise.resolve(window.AuthManager.initialize())
                .then(client => {
                    if (client) {
                        window.supabaseClient = client;
                        return client;
                    }

                    if (window.supabaseClient) {
                        return window.supabaseClient;
                    }

                    throw new Error("Supabase client is unavailable.");
                });
        }

        if (
            window.supabase &&
            window.APP_CONFIG &&
            window.isSupabaseConfigured?.()
        ) {
            const client = window.supabase.createClient(
                window.APP_CONFIG.supabaseUrl,
                window.APP_CONFIG.supabaseAnonKey
            );

            window.supabaseClient = client;
            return Promise.resolve(client);
        }

        return Promise.reject(
            new Error("Supabase configuration is missing.")
        );
    }

    async function checkAccess() {
        const { data, error } = await supabaseClient.auth.getUser();

        if (error || !data?.user) {
            window.location.href = "login.html";
            return false;
        }

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("role,is_active")
                .eq("id", data.user.id)
                .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (
            !profile ||
            profile.is_active !== true ||
            !["owner", "manager", "accounts_staff"].includes(profile.role)
        ) {
            showMessage(
                "You do not have permission to view this transaction.",
                "danger"
            );
            return false;
        }

        return true;
    }

    function getTransactionTypeLabel(type) {
        const labels = {
            in: "Money In",
            out: "Money Out",
            transfer: "Account Transfer"
        };

        return labels[type] || type || "Unknown";
    }

    function getStatusLabel(type) {
        if (type === "in") return "Money Received";
        if (type === "out") return "Money Paid";
        if (type === "transfer") return "Transfer Recorded";

        return "Recorded";
    }

    function renderTransferDetails(transfer) {
        const linkedCard = elements["linked-transfer-card"];

        if (!linkedCard) return;

        linkedCard.hidden = false;

        const fromName =
            transfer.from_account_name ||
            transfer.from_account?.account_name ||
            "—";

        const toName =
            transfer.to_account_name ||
            transfer.to_account?.account_name ||
            "—";

        setText("detail-transfer-from", fromName);
        setText("detail-transfer-to", toName);

        const transferId = transfer.transfer_id || transfer.id;

        if (transferId && elements["view-linked-transfer"]) {
            elements["view-linked-transfer"].href =
                `account-transfer-details.html?id=${encodeURIComponent(transferId)}`;
        }
    }

    function renderTransaction(transaction) {
        const isTransfer = transaction.transaction_type === "transfer";

        const amount = Number(transaction.amount || 0);

        setText(
            "detail-transaction-reference",
            transaction.reference_number ||
            transaction.id
        );

        setText(
            "detail-transaction-status",
            getStatusLabel(transaction.transaction_type)
        );

        setText(
            "detail-transaction-amount",
            formatMoney(amount)
        );

        setText(
            "detail-transaction-date",
            formatDate(transaction.transaction_date, true)
        );

        setText("detail-transaction-id", transaction.id);

        setText(
            "detail-transaction-created-at",
            formatDate(transaction.created_at, true)
        );

        setText(
            "detail-account-name",
            transaction.account_name
        );

        setText(
            "detail-account-type",
            transaction.account_type
        );

        setText(
            "detail-account-provider",
            transaction.bank_name
        );

        setText(
            "detail-account-number",
            transaction.account_number
        );

        setText(
            "detail-transaction-type",
            getTransactionTypeLabel(transaction.transaction_type)
        );

        setText(
            "detail-reference-type",
            transaction.reference_type
        );

        setText(
            "detail-reference-number",
            transaction.reference_number
        );

        setText(
            "detail-transaction-recorded-by",
            transaction.recorded_by_name ||
            transaction.recorded_by
        );

        setText(
            "detail-transaction-description",
            transaction.description,
            "No description provided."
        );

        const amountElement = elements["detail-transaction-amount"];

        if (amountElement) {
            amountElement.style.color =
                transaction.transaction_type === "in"
                    ? "var(--success, #15803d)"
                    : transaction.transaction_type === "out"
                        ? "var(--danger, #dc2626)"
                        : "var(--info, #0284c7)";
        }

        const statusElement = elements["detail-transaction-status"];

        if (statusElement) {
            statusElement.className =
                "transaction-detail-badge";

            if (transaction.transaction_type === "in") {
                statusElement.style.background = "#dcfce7";
                statusElement.style.color = "#15803d";
            } else if (transaction.transaction_type === "out") {
                statusElement.style.background = "#fee2e2";
                statusElement.style.color = "#b91c1c";
            } else {
                statusElement.style.background = "#e0f2fe";
                statusElement.style.color = "#0369a1";
            }
        }

        if (isTransfer) {
            renderTransferDetails(transaction);
        } else if (elements["linked-transfer-card"]) {
            elements["linked-transfer-card"].hidden = true;
        }
    }

    async function loadTransaction() {
        clearMessage();

        showMessage("Loading transaction details...", "info");

        try {
            const { data, error } =
                await supabaseClient.functions.invoke(
                    "get-cash-transaction-details",
                    {
                        body: {
                            transaction_id: transactionId
                        }
                    }
                );

            if (error) {
                throw error;
            }

            if (!data || data.success !== true || !data.transaction) {
                throw new Error(
                    data?.message || "Transaction details could not be loaded."
                );
            }

            renderTransaction(data.transaction);
            clearMessage();

        } catch (error) {
            console.error("Transaction details error:", error);

            showMessage(
                error.message ||
                "Unable to load transaction details.",
                "danger"
            );
        }
    }

    function bindEvents() {
        elements["refresh-cash-transaction"]?.addEventListener(
            "click",
            loadTransaction
        );

        elements["print-cash-transaction"]?.addEventListener(
            "click",
            () => window.print()
        );
    }

    async function initialize() {
        getElements();
        bindEvents();

        const params = new URLSearchParams(window.location.search);
        transactionId = params.get("id");

        if (!transactionId) {
            showMessage(
                "Transaction ID is missing from the page URL.",
                "danger"
            );
            return;
        }

        try {
            supabaseClient = await getClient();

            const allowed = await checkAccess();

            if (!allowed) return;

            await loadTransaction();

        } catch (error) {
            console.error("Initialization error:", error);

            showMessage(
                error.message ||
                "Unable to initialize transaction details.",
                "danger"
            );
        }
    }

    return {
        initialize,
        loadTransaction
    };
})();

function initializeCashTransactionDetails() {
    CashTransactionDetails.initialize();
}
