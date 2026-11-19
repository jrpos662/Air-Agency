/* agency-accounts.js - Air Ticket Agency Management */

"use strict";

(() => {
    const PAGE_SIZE = 15;

    let supabaseClient = null;
    let agencyId = null;
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let statementData = null;

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function showMessage(message, type = "error") {
        const element = $("agency-accounts-message");
        if (!element) return;

        element.textContent = message;
        element.className = `agency-accounts-message show ${type}`;
    }

    function clearMessage() {
        const element = $("agency-accounts-message");
        if (!element) return;

        element.textContent = "";
        element.className = "agency-accounts-message";
    }

    function formatMoney(value) {
        const amount = Number(value ?? 0);

        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number.isFinite(amount) ? amount : 0);
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

    function getAgencyId() {
        const params = new URLSearchParams(window.location.search);

        return params.get("agency_id") || params.get("id");
    }

    function getFilters() {
        return {
            date_from: $("ledger-date-from")?.value || null,
            date_to: $("ledger-date-to")?.value || null,
            transaction_type: $("ledger-type-filter")?.value || "all",
            search: $("ledger-search")?.value.trim() || ""
        };
    }

    async function initializeSupabase() {
        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            return;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            supabaseClient = await window.AuthManager.initialize();
        }

        if (!supabaseClient) {
            throw new Error("Supabase client is not initialized.");
        }
    }

    async function checkSession() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            window.location.href = "login.html";
            return false;
        }

        const user = data.session.user;
        const name = user.user_metadata?.full_name || user.email || "User";

        if ($("user-name")) $("user-name").textContent = name;
        if ($("user-role")) $("user-role").textContent = "Authenticated User";
        if ($("user-avatar")) {
            $("user-avatar").textContent = name.charAt(0).toUpperCase();
        }

        return true;
    }

    function renderSummary(summary = {}) {
        $("accounts-opening-balance").textContent =
            formatMoney(summary.opening_balance);

        $("accounts-total-purchases").textContent =
            formatMoney(summary.total_purchases);

        $("accounts-total-payments").textContent =
            formatMoney(summary.total_payments);

        $("accounts-current-payable").textContent =
            formatMoney(summary.current_payable_balance);
    }

    function renderTransactions(transactions = []) {
        const tbody = $("agency-accounts-table-body");
        if (!tbody) return;

        if (!Array.isArray(transactions) || transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        No account transactions found.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions.map(item => `
            <tr>
                <td>${escapeHTML(formatDate(item.transaction_date))}</td>
                <td>${escapeHTML(item.transaction_reference || "—")}</td>
                <td>${escapeHTML(item.transaction_type || "—")}</td>
                <td>${escapeHTML(item.description || "—")}</td>
                <td>${escapeHTML(formatMoney(item.debit_amount))}</td>
                <td>${escapeHTML(formatMoney(item.credit_amount))}</td>
                <td>
                    <strong>
                        ${escapeHTML(formatMoney(item.running_balance))}
                    </strong>
                </td>
            </tr>
        `).join("");
    }

    function updatePagination(pagination = {}) {
        const totalCount = Number(pagination.total_count ?? 0);

        totalPages = Math.max(
            1,
            Number(
                pagination.total_pages ??
                Math.ceil(totalCount / PAGE_SIZE)
            )
        );

        currentPage = Math.min(
            Math.max(1, Number(pagination.page ?? currentPage)),
            totalPages
        );

        $("accounts-transaction-count").textContent =
            `${totalCount} transaction${totalCount === 1 ? "" : "s"}`;

        $("accounts-page-info").textContent =
            `Page ${currentPage} of ${totalPages}`;

        $("accounts-previous-page").disabled = currentPage <= 1;
        $("accounts-next-page").disabled = currentPage >= totalPages;
    }

    async function loadAgencyAccounts() {
        if (isLoading) return;

        isLoading = true;
        clearMessage();

        const tbody = $("agency-accounts-table-body");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        Loading account statement...
                    </td>
                </tr>
            `;
        }

        try {
            const { data, error } =
                await supabaseClient.functions.invoke(
                    "get-agency-account-statement",
                    {
                        body: {
                            agency_id: agencyId,
                            page: currentPage,
                            page_size: PAGE_SIZE,
                            filters: getFilters()
                        }
                    }
                );

            if (error) {
                throw new Error(
                    error.message ||
                    "Unable to load agency account statement."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.error ||
                    "Unable to retrieve account statement."
                );
            }

            if (!data.agency || !data.summary) {
                throw new Error("Invalid account statement response.");
            }

            statementData = data;

            $("accounts-agency-name").textContent =
                data.agency.name || "Agency Account Statement";

            $("accounts-agency-id").textContent =
                data.agency.id || agencyId;

            renderSummary(data.summary);
            renderTransactions(data.transactions || []);
            updatePagination(data.pagination || {});

        } catch (error) {
            console.error("Agency accounts error:", error);

            showMessage(
                error.message ||
                "Unable to load agency account statement."
            );

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-cell">
                            Unable to load account statement.
                        </td>
                    </tr>
                `;
            }
        } finally {
            isLoading = false;
        }
    }

    function validateDateFilters() {
        const from = $("ledger-date-from")?.value;
        const to = $("ledger-date-to")?.value;

        if (from && to && from > to) {
            showMessage(
                "The start date cannot be later than the end date."
            );
            return false;
        }

        return true;
    }

    function setupFilters() {
        $("apply-ledger-filter")?.addEventListener("click", async () => {
            if (!validateDateFilters()) return;

            currentPage = 1;
            await loadAgencyAccounts();
        });

        $("reset-ledger-filter")?.addEventListener("click", async () => {
            $("ledger-date-from").value = "";
            $("ledger-date-to").value = "";
            $("ledger-type-filter").value = "all";
            $("ledger-search").value = "";

            currentPage = 1;
            clearMessage();

            await loadAgencyAccounts();
        });

        $("ledger-search")?.addEventListener("keydown", async event => {
            if (event.key !== "Enter") return;

            if (!validateDateFilters()) return;

            currentPage = 1;
            await loadAgencyAccounts();
        });
    }

    function setupPagination() {
        $("accounts-previous-page")?.addEventListener("click", async () => {
            if (currentPage <= 1 || isLoading) return;

            currentPage--;
            await loadAgencyAccounts();
        });

        $("accounts-next-page")?.addEventListener("click", async () => {
            if (currentPage >= totalPages || isLoading) return;

            currentPage++;
            await loadAgencyAccounts();
        });
    }

    function setupActions() {
        $("refresh-agency-accounts")?.addEventListener(
            "click",
            async () => {
                await loadAgencyAccounts();
            }
        );

        $("back-to-agency-details")?.addEventListener("click", event => {
            event.preventDefault();

            window.location.href =
                `agency-details.html?id=${encodeURIComponent(agencyId)}`;
        });

        $("print-agency-statement")?.addEventListener("click", () => {
            if (!statementData) {
                showMessage("Load the account statement before printing.");
                return;
            }

            window.print();
        });
    }

    function setupPrintStyles() {
        const style = document.createElement("style");

        style.textContent = `
            @media print {
                .sidebar,
                .topbar,
                .page-heading-actions,
                .accounts-filter-card,
                #print-agency-statement,
                .accounts-ledger-footer,
                .dashboard-footer {
                    display: none !important;
                }

                .main-content {
                    margin: 0 !important;
                    width: 100% !important;
                }

                .agency-accounts-content {
                    padding: 0 !important;
                    max-width: none !important;
                }

                .accounts-ledger-card {
                    box-shadow: none !important;
                    border: none !important;
                }

                .accounts-ledger-card .data-table {
                    min-width: 0 !important;
                }

                .accounts-ledger-card .data-table th,
                .accounts-ledger-card .data-table td {
                    white-space: normal !important;
                    font-size: 9px !important;
                    padding: 7px !important;
                }

                body {
                    background: #fff !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    async function initializePage() {
        try {
            agencyId = getAgencyId();

            if (!agencyId) {
                // Opened from the sidebar: choose an agency first.
                window.location.replace("agencies.html");
                return;
            }

            if (false) {
                throw new Error("Agency ID is missing from the URL.");
            }

            await initializeSupabase();

            const authenticated = await checkSession();
            if (!authenticated) return;

            setupFilters();
            setupPagination();
            setupActions();
            setupPrintStyles();

            await loadAgencyAccounts();

        } catch (error) {
            console.error("Agency accounts initialization error:", error);

            showMessage(
                error.message ||
                "Unable to initialize agency accounts."
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initializePage);
})();
