
"use strict";

(() => {
    const PAGE_SIZE = 10;

    let supabaseClient = null;
    let currentPage = 1;
    let totalPages = 1;
    let searchTimer = null;

    const $ = id => document.getElementById(id);

    /* ========================================
       Utility Functions
    ======================================== */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value || 0));
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

    function showMessage(message, type = "info") {
        const element = $("cash-transactions-message");
        if (!element) return;

        element.textContent = message;
        element.className = `cash-transactions-message show ${type}`;
    }

    function clearMessage() {
        const element = $("cash-transactions-message");
        if (!element) return;

        element.textContent = "";
        element.className = "cash-transactions-message";
    }

    function setLoading(button, loading, loadingText = "Loading...") {
        if (!button) return;

        if (loading) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent;
            }

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

    /* ========================================
       Supabase Connection
    ======================================== */

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

            if (window.supabaseClient) {
                return window.supabaseClient;
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

        const allowedRoles = [
            "owner",
            "manager",
            "accounts_staff"
        ];

        if (
            !profile ||
            profile.is_active !== true ||
            !allowedRoles.includes(profile.role)
        ) {
            showMessage(
                "You do not have permission to view account transactions.",
                "error"
            );

            return false;
        }

        return true;
    }

    /* ========================================
       Account Filters
    ======================================== */

    async function loadAccounts() {
        const select = $("all-account-filter");
        if (!select) return;

        const { data, error } = await supabaseClient
            .from("cash_accounts")
            .select("id, account_name, account_type")
            .eq("is_active", true)
            .order("account_name", { ascending: true });

        if (error) throw error;

        select.innerHTML = '<option value="all">All Accounts</option>';

        (data || []).forEach(account => {
            const option = document.createElement("option");

            option.value = account.id;
            option.textContent =
                `${account.account_name} (${account.account_type})`;

            select.appendChild(option);
        });
    }

    function getFilters() {
        return {
            search: $("all-transaction-search")?.value.trim() || "",
            account_id: $("all-account-filter")?.value || "all",
            account_type: $("all-account-type-filter")?.value || "all",
            transaction_type:
                $("all-transaction-type-filter")?.value || "all",
            date_from: $("all-date-from")?.value || null,
            date_to: $("all-date-to")?.value || null
        };
    }

    function validateFilters(filters) {
        if (
            filters.date_from &&
            filters.date_to &&
            filters.date_from > filters.date_to
        ) {
            showMessage(
                "Date From cannot be later than Date To.",
                "error"
            );

            return false;
        }

        return true;
    }

    /* ========================================
       Load Transactions
    ======================================== */

    async function loadTransactions() {
        clearMessage();

        const refreshButton = $("refresh-all-transactions");

        setLoading(refreshButton, true, "Loading...");

        try {
            const filters = getFilters();

            if (!validateFilters(filters)) return;

            const { data, error } =
                await supabaseClient.functions.invoke(
                    "get-all-cash-transactions",
                    {
                        body: {
                            ...filters,
                            page: currentPage,
                            page_size: PAGE_SIZE
                        }
                    }
                );

            if (error) throw error;

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Unable to load transactions."
                );
            }

            renderSummary(data.summary || {});
            renderTransactions(data.transactions || []);

            const pagination = data.pagination || {};

            totalPages = Math.max(
                1,
                Number(pagination.total_pages || 1)
            );

            updatePagination(
                Number(pagination.total_count || 0)
            );

        } catch (error) {
            console.error("Cash transactions error:", error);

            showMessage(
                error.message || "Failed to load transactions.",
                "error"
            );

            renderTransactions([]);
            renderSummary({});

            totalPages = 1;
            updatePagination(0);

        } finally {
            setLoading(refreshButton, false);
        }
    }

    /* ========================================
       Summary
    ======================================== */

    function renderSummary(summary) {
        const totalCount = Number(summary.total_count || 0);
        const totalIn = Number(summary.total_in || 0);
        const totalOut = Number(summary.total_out || 0);

        const netMovement = totalIn - totalOut;

        if ($("all-total-count")) {
            $("all-total-count").textContent =
                totalCount.toLocaleString("en-BD");
        }

        if ($("all-total-in")) {
            $("all-total-in").textContent = formatMoney(totalIn);
        }

        if ($("all-total-out")) {
            $("all-total-out").textContent = formatMoney(totalOut);
        }

        if ($("all-net-movement")) {
            $("all-net-movement").textContent =
                formatMoney(netMovement);
        }
    }

    /* ========================================
       Transaction Helpers
    ======================================== */

    function getTransactionType(transaction) {
        if (
            transaction.transaction_type === "transfer" ||
            transaction.reference_type === "transfer"
        ) {
            return "transfer";
        }

        return transaction.transaction_type;
    }

    function getTransactionDetailsLink(transaction) {
        if (!transaction.id) {
            return '<span class="text-muted">—</span>';
        }

        const url =
            `cash-transaction-details.html?id=${encodeURIComponent(transaction.id)}`;

        return `
            <a
                href="${url}"
                class="btn btn-sm btn-outline"
                aria-label="View transaction details"
            >
                View Details
            </a>
        `;
    }

    /* ========================================
       Render Transactions
    ======================================== */

    function renderTransactions(transactions) {
        const tbody = $("all-transactions-table-body");
        if (!tbody) return;

        if (!transactions.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        No transactions found.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = transactions.map(transaction => {
            const type = getTransactionType(transaction);

            const accountName = escapeHTML(
                transaction.account_name || "—"
            );

            const reference = escapeHTML(
                transaction.reference_type || "—"
            );

            const description = escapeHTML(
                transaction.description || "—"
            );

            const amount = Number(transaction.amount || 0);

            let typeLabel = "Unknown";
            let amountClass = "";

            if (type === "in") {
                typeLabel = "Money In";
                amountClass = "in";
            } else if (type === "out") {
                typeLabel = "Money Out";
                amountClass = "out";
            } else if (type === "transfer") {
                typeLabel = "Transfer";
            }

            const referenceText =
                transaction.reference_number ||
                transaction.reference_id ||
                reference;

            return `
                <tr>
                    <td>
                        ${escapeHTML(
                            formatDate(transaction.transaction_date)
                        )}
                    </td>

                    <td>
                        <span class="transaction-account-name">
                            ${accountName}
                        </span>
                    </td>

                    <td>
                        <span class="transaction-type-badge ${escapeHTML(type)}">
                            ${escapeHTML(typeLabel)}
                        </span>
                    </td>

                    <td>
                        <span class="transaction-reference">
                            ${escapeHTML(referenceText)}
                        </span>
                    </td>

                    <td>
                        <div class="transaction-description">
                            ${description}
                        </div>
                    </td>

                    <td>
                        <strong class="transaction-amount ${amountClass}">
                            ${escapeHTML(formatMoney(amount))}
                        </strong>
                    </td>

                    <td>
                        ${getTransactionDetailsLink(transaction)}
                    </td>
                </tr>
            `;
        }).join("");
    }

    /* ========================================
       Pagination
    ======================================== */

    function updatePagination(totalCount) {
        if ($("all-transaction-count")) {
            $("all-transaction-count").textContent =
                `${totalCount.toLocaleString("en-BD")} transactions found`;
        }

        if ($("all-transaction-page-info")) {
            $("all-transaction-page-info").textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if ($("all-transaction-previous-page")) {
            $("all-transaction-previous-page").disabled =
                currentPage <= 1;
        }

        if ($("all-transaction-next-page")) {
            $("all-transaction-next-page").disabled =
                currentPage >= totalPages;
        }
    }

    /* ========================================
       Reset Filters
    ======================================== */

    function resetFilters() {
        [
            "all-transaction-search",
            "all-date-from",
            "all-date-to"
        ].forEach(id => {
            if ($(id)) $(id).value = "";
        });

        if ($("all-account-filter")) {
            $("all-account-filter").value = "all";
        }

        if ($("all-account-type-filter")) {
            $("all-account-type-filter").value = "all";
        }

        if ($("all-transaction-type-filter")) {
            $("all-transaction-type-filter").value = "all";
        }

        currentPage = 1;
        loadTransactions();
    }

    /* ========================================
       Event Listeners
    ======================================== */

    function bindEvents() {
        $("all-transaction-search-button")?.addEventListener(
            "click",
            () => {
                currentPage = 1;
                loadTransactions();
            }
        );

        $("all-transaction-reset-button")?.addEventListener(
            "click",
            resetFilters
        );

        $("refresh-all-transactions")?.addEventListener(
            "click",
            loadTransactions
        );

        $("all-transaction-previous-page")?.addEventListener(
            "click",
            () => {
                if (currentPage > 1) {
                    currentPage--;
                    loadTransactions();
                }
            }
        );

        $("all-transaction-next-page")?.addEventListener(
            "click",
            () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    loadTransactions();
                }
            }
        );

        [
            "all-account-filter",
            "all-account-type-filter",
            "all-transaction-type-filter",
            "all-date-from",
            "all-date-to"
        ].forEach(id => {
            $(id)?.addEventListener("change", () => {
                currentPage = 1;
                loadTransactions();
            });
        });

        $("all-transaction-search")?.addEventListener(
            "input",
            () => {
                clearTimeout(searchTimer);

                searchTimer = setTimeout(() => {
                    currentPage = 1;
                    loadTransactions();
                }, 500);
            }
        );
    }

    /* ========================================
       Initialize
    ======================================== */

    async function initialize() {
        try {
            supabaseClient = await getClient();

            const hasAccess = await checkAccess();
            if (!hasAccess) return;

            await loadAccounts();

            bindEvents();

            await loadTransactions();

        } catch (error) {
            console.error(
                "Cash transactions initialization:",
                error
            );

            showMessage(
                error.message || "Unable to initialize transactions.",
                "error"
            );
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
    );

})();
