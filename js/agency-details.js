
"use strict";

(() => {
    const PAGE_SIZE = 10;

    let supabaseClient = null;
    let agencyId = null;
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;

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

    function showMessage(message, type = "error") {
        const element = $("agency-details-message");

        if (!element) return;

        element.textContent = message;
        element.className = `agency-details-message show ${type}`;
    }

    function clearMessage() {
        const element = $("agency-details-message");

        if (!element) return;

        element.textContent = "";
        element.className = "agency-details-message";
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

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = value ?? "—";
        }
    }

    function setMoney(id, value) {
        setText(id, formatMoney(value));
    }

    function getAgencyId() {
        const params = new URLSearchParams(window.location.search);

        return params.get("id");
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

        setText(
            "user-name",
            user.user_metadata?.full_name ||
            user.email ||
            "User"
        );

        setText("user-role", "Authenticated User");

        const avatar = $("user-avatar");

        if (avatar) {
            const name =
                user.user_metadata?.full_name ||
                user.email ||
                "U";

            avatar.textContent = name.charAt(0).toUpperCase();
        }

        return true;
    }

    function renderAgency(agency) {
        if (!agency) {
            throw new Error("Agency information was not found.");
        }

        setText("agency-detail-name", agency.name);
        setText("agency-detail-id", agency.id);
        setText("detail-agency-name", agency.name);
        setText("detail-contact-person", agency.contact_person);
        setText("detail-agency-phone", agency.phone);
        setText("detail-agency-email", agency.email);
        setText("detail-agency-address", agency.address);
        setText("detail-agency-notes", agency.notes);
        setText("agency-created-date", formatDate(agency.created_at));

        const status = $("agency-detail-status");

        if (status) {
            const active = agency.is_active === true;

            status.textContent = active ? "Active" : "Inactive";
            status.className = `status-badge ${active ? "active" : "inactive"}`;
        }

        const editButton = $("edit-agency-button");

        if (editButton) {
            editButton.href =
                `edit-agency.html?id=${encodeURIComponent(agency.id)}`;

            // Editing is enabled only after the edit page and
            // server-side permission checks have been implemented.
            editButton.hidden = true;
        }

        const accountsButton = $("view-agency-accounts-button");

        if (accountsButton) {
            accountsButton.href =
                `agency-accounts.html?agency_id=${encodeURIComponent(agency.id)}`;
        }
    }

    function renderSummary(summary = {}) {
        setMoney("agency-opening-balance", summary.opening_balance);
        setMoney("agency-total-purchases", summary.total_purchases);
        setMoney("agency-total-payments", summary.total_payments);
        setMoney("agency-current-balance", summary.current_payable_balance);
    }

    function renderLedger(transactions = []) {
        const tbody = $("agency-ledger-body");

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

        tbody.innerHTML = transactions.map((transaction) => `
            <tr>
                <td>${escapeHTML(formatDate(transaction.transaction_date))}</td>
                <td>${escapeHTML(transaction.transaction_reference || "—")}</td>
                <td>${escapeHTML(transaction.transaction_type || "—")}</td>
                <td>${escapeHTML(transaction.description || "—")}</td>
                <td>${escapeHTML(formatMoney(transaction.debit_amount))}</td>
                <td>${escapeHTML(formatMoney(transaction.credit_amount))}</td>
                <td>
                    <strong>
                        ${escapeHTML(formatMoney(transaction.running_balance))}
                    </strong>
                </td>
            </tr>
        `).join("");
    }

    function updatePagination(pagination = {}) {
        const total = Number(pagination.total_count ?? 0);

        totalPages = Math.max(
            1,
            Number(pagination.total_pages ?? Math.ceil(total / PAGE_SIZE))
        );

        currentPage = Math.min(
            Math.max(1, Number(pagination.page ?? currentPage)),
            totalPages
        );

        setText(
            "agency-ledger-count",
            `${total} transaction${total === 1 ? "" : "s"}`
        );

        setText(
            "ledger-page-info",
            `Page ${currentPage} of ${totalPages}`
        );

        const previous = $("ledger-previous-page");
        const next = $("ledger-next-page");

        if (previous) previous.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;
    }

    async function loadAgencyDetails() {
        if (isLoading) return;

        isLoading = true;
        clearMessage();

        const tbody = $("agency-ledger-body");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        Loading account history...
                    </td>
                </tr>
            `;
        }

        try {
            const { data, error } = await supabaseClient.functions.invoke(
                "get-agency-details",
                {
                    body: {
                        agency_id: agencyId,
                        page: currentPage,
                        page_size: PAGE_SIZE
                    }
                }
            );

            if (error) {
                throw new Error(
                    error.message || "Unable to load agency details."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.error || "Unable to retrieve agency information."
                );
            }

            renderAgency(data.agency);
            renderSummary(data.summary);
            renderLedger(data.transactions);
            updatePagination(data.pagination);

        } catch (error) {
            console.error("Agency details loading error:", error);

            showMessage(
                error.message || "Unable to load agency details."
            );

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-cell">
                            Unable to load account history.
                        </td>
                    </tr>
                `;
            }

        } finally {
            isLoading = false;
        }
    }

    function setupPagination() {
        $("ledger-previous-page")?.addEventListener("click", async () => {
            if (currentPage <= 1 || isLoading) return;

            currentPage--;
            await loadAgencyDetails();
        });

        $("ledger-next-page")?.addEventListener("click", async () => {
            if (currentPage >= totalPages || isLoading) return;

            currentPage++;
            await loadAgencyDetails();
        });
    }

    async function initializePage() {
        try {
            agencyId = getAgencyId();

            if (!agencyId) {
                throw new Error("Agency ID is missing from the page URL.");
            }

            await initializeSupabase();

            const authenticated = await checkSession();

            if (!authenticated) return;

            setupPagination();

            await loadAgencyDetails();

        } catch (error) {
            console.error("Agency page initialization error:", error);

            showMessage(
                error.message || "Unable to initialize agency details."
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initializePage);
})();
