
"use strict";

(() => {
    const PAGE_SIZE = 1;
    let supabaseClient = null;
    let transferId = null;
    let currentTransfer = null;

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

    function showMessage(message, type = "info") {
        const element = $("transfer-details-message");
        if (!element) return;

        element.textContent = message;
        element.className = `transfer-details-message show ${type}`;
    }

    function clearMessage() {
        const element = $("transfer-details-message");
        if (!element) return;

        element.textContent = "";
        element.className = "transfer-details-message";
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

    function setLoading(button, loading, loadingText = "Loading...") {
        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.textContent;
            button.disabled = true;
            button.textContent = loadingText;
        } else {
            button.disabled = false;

            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    async function getClient() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            const client = await window.AuthManager.initialize();

            if (client) {
                window.supabaseClient = client;
                return client;
            }
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
            return client;
        }

        throw new Error("Supabase connection is not configured.");
    }

    async function checkAccess() {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return false;
        }

        const { data: profile, error } = await supabaseClient
            .from("profiles")
            .select("role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (
            !profile ||
            profile.is_active !== true ||
            !["owner", "manager", "accounts_staff"].includes(profile.role)
        ) {
            showMessage(
                "You do not have permission to view account transfer details.",
                "error"
            );
            return false;
        }

        return true;
    }

    async function loadTransferDetails() {
        clearMessage();

        const refreshButton = $("refresh-transfer-details");
        setLoading(refreshButton, true, "Loading...");

        try {
            const { data, error } = await supabaseClient.functions.invoke(
                "get-account-transfer-details",
                {
                    body: {
                        transfer_id: transferId
                    }
                }
            );

            if (error) throw error;

            if (!data || data.success !== true || !data.transfer) {
                throw new Error(
                    data?.message || "Unable to load transfer details."
                );
            }

            currentTransfer = data.transfer;
            renderTransferDetails(currentTransfer);

        } catch (error) {
            console.error("Transfer details error:", error);

            showMessage(
                error.message || "Failed to load transfer details.",
                "error"
            );
        } finally {
            setLoading(refreshButton, false);
        }
    }

    function renderTransferDetails(transfer) {
        const fromAccount = transfer.from_account || {};
        const toAccount = transfer.to_account || {};

        const amount = Number(transfer.amount || 0);

        // Main summary
        setText("detail-transfer-reference", transfer.reference_number);
        setText("detail-transfer-amount", formatMoney(amount));
        setText("detail-transfer-id", transfer.id);
        setText("detail-transfer-date", formatDate(transfer.transfer_date));
        setText("detail-created-at", formatDateTime(transfer.created_at));

        // Source account
        setText(
            "detail-from-account",
            transfer.from_account_name || fromAccount.account_name
        );
        setText(
            "detail-from-type",
            transfer.from_account_type || fromAccount.account_type
        );
        setText(
            "detail-from-number",
            transfer.from_account_number || fromAccount.account_number
        );

        // Destination account
        setText(
            "detail-to-account",
            transfer.to_account_name || toAccount.account_name
        );
        setText(
            "detail-to-type",
            transfer.to_account_type || toAccount.account_type
        );
        setText(
            "detail-to-number",
            transfer.to_account_number || toAccount.account_number
        );

        // Additional information
        setText("detail-reference-number", transfer.reference_number);
        setText(
            "detail-recorded-by",
            transfer.recorded_by_name || transfer.created_by_name ||
            transfer.created_by
        );
        setText("detail-transfer-notes", transfer.notes, "No notes added.");

        // Optional dynamic title
        const title = $("page-transfer-reference");
        if (title) {
            title.textContent = transfer.reference_number
                ? `Transfer ${transfer.reference_number}`
                : "Transfer Details";
        }
    }

    function validateTransferId(id) {
        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        return uuidPattern.test(id || "");
    }

    function bindEvents() {
        $("refresh-transfer-details")?.addEventListener("click", () => {
            loadTransferDetails();
        });

        $("print-transfer-details")?.addEventListener("click", () => {
            if (!currentTransfer) {
                showMessage("Transfer details are not loaded yet.", "error");
                return;
            }

            window.print();
        });
    }

    async function initialize() {
        try {
            const params = new URLSearchParams(window.location.search);
            transferId = params.get("id");

            if (!validateTransferId(transferId)) {
                showMessage("Invalid or missing transfer ID.", "error");
                return;
            }

            supabaseClient = await getClient();

            const hasAccess = await checkAccess();
            if (!hasAccess) return;

            bindEvents();
            await loadTransferDetails();

        } catch (error) {
            console.error("Account transfer initialization error:", error);

            showMessage(
                error.message || "Unable to initialize transfer details.",
                "error"
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
