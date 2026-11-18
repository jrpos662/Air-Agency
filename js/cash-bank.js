
/* ========================================
   Cash & Bank
   File: js/cash-bank.js
======================================== */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    initializeCashBank();
});

const CashBank = (() => {
    const PAGE_SIZE = 10;

    let supabase = null;
    let currentPage = 1;
    let totalPages = 1;
    let accounts = [];
    let isSaving = false;

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
        return "৳" + Number(value || 0).toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function showMessage(message, type = "info") {
        const element = $("cash-bank-message");
        if (!element) return;

        element.textContent = message;
        element.className = `cash-bank-message show ${type}`;
    }

    function hideMessage() {
        const element = $("cash-bank-message");
        if (!element) return;

        element.textContent = "";
        element.className = "cash-bank-message";
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

            if (client) return client;
        }

        throw new Error("Supabase client is not available.");
    }

    async function checkAccess() {
        if (
            !window.AuthManager ||
            typeof window.AuthManager.checkSession !== "function"
        ) {
            throw new Error("Authentication service is unavailable.");
        }

        await window.AuthManager.checkSession();

        const { data, error } = await supabase
            .from("profiles")
            .select("role,is_active")
            .eq("id", (await supabase.auth.getUser()).data.user.id)
            .single();

        if (error || !data || !data.is_active) {
            throw new Error("Unable to verify your account.");
        }

        const allowedRoles = [
            "owner",
            "manager",
            "accounts_staff"
        ];

        if (!allowedRoles.includes(data.role)) {
            throw new Error("You do not have permission to access Cash & Bank.");
        }
    }

    async function invokeOverview() {
        const payload = {
            account_type: "all",
            search: $("transaction-search")?.value.trim() || null,
            account_id: $("transaction-account-filter")?.value || null,
            transaction_type: $("transaction-type-filter")?.value || "all",
            date_from: $("transaction-date-from")?.value || null,
            date_to: $("transaction-date-to")?.value || null,
            page: currentPage,
            page_size: PAGE_SIZE
        };

        const { data, error } = await supabase.functions.invoke(
            "get-cash-bank-overview",
            { body: payload }
        );

        if (error) {
            throw new Error(error.message || "Unable to load Cash & Bank data.");
        }

        if (!data || !data.success) {
            throw new Error(data?.message || "Unable to load Cash & Bank data.");
        }

        return data;
    }

    async function loadOverview() {
        hideMessage();

        const accountContainer = $("account-cards");
        const transactionBody = $("cash-transactions-body");

        if (accountContainer) {
            accountContainer.innerHTML = "<p>Loading accounts...</p>";
        }

        if (transactionBody) {
            transactionBody.innerHTML =
                '<tr><td colspan="8">Loading transactions...</td></tr>';
        }

        try {
            const result = await invokeOverview();

            accounts = Array.isArray(result.accounts)
                ? result.accounts
                : [];

            renderSummary(result.summary || {});
            renderAccounts();
            renderAccountFilter();
            renderTransactions(result.transactions || []);
            renderPagination(result.pagination || {});

        } catch (error) {
            console.error("Cash & Bank loading error:", error);

            if (accountContainer) {
                accountContainer.innerHTML =
                    '<div class="account-empty-state">Unable to load accounts.</div>';
            }

            if (transactionBody) {
                transactionBody.innerHTML =
                    '<tr><td colspan="8">Unable to load transactions.</td></tr>';
            }

            showMessage(error.message, "error");
        }
    }

    function renderSummary(summary) {
        if ($("total-account-balance")) {
            $("total-account-balance").textContent =
                formatMoney(summary.total_balance);
        }

        if ($("total-cash-balance")) {
            $("total-cash-balance").textContent =
                formatMoney(summary.cash_balance);
        }

        if ($("total-bank-balance")) {
            $("total-bank-balance").textContent =
                formatMoney(summary.bank_balance);
        }

        if ($("total-mobile-balance")) {
            $("total-mobile-balance").textContent =
                formatMoney(summary.mobile_banking_balance);
        }
    }

    function getAccountTypeLabel(type) {
        const labels = {
            cash: "Cash",
            bank: "Bank",
            mobile_banking: "Mobile Banking"
        };

        return labels[type] || "Account";
    }

    function renderAccounts() {
        const container = $("account-cards");
        if (!container) return;

        const selectedType = $("account-type-filter")?.value || "all";

        const filtered = accounts.filter(account =>
            selectedType === "all" || account.account_type === selectedType
        );

        if (!filtered.length) {
            container.innerHTML = `
                <div class="account-empty-state">
                    <h3>No Accounts Found</h3>
                    <p>No accounts are available for this account type.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(account => `
            <article class="account-card">
                <div class="account-card-header">
                    <div>
                        <h3>${escapeHTML(account.account_name)}</h3>
                        <p>${escapeHTML(
                            account.bank_name ||
                            getAccountTypeLabel(account.account_type)
                        )}</p>
                    </div>

                    <span class="account-type-badge">
                        ${escapeHTML(getAccountTypeLabel(account.account_type))}
                    </span>
                </div>

                <div class="account-card-balance">
                    <span>Current Balance</span>
                    <strong>${formatMoney(account.current_balance)}</strong>
                </div>

                <div class="account-card-footer">
                    <span>${account.is_active ? "Active" : "Inactive"}</span>
                    <span>${escapeHTML(account.account_number || "")}</span>
                </div>
            </article>
        `).join("");
    }

    function renderAccountFilter() {
        const select = $("transaction-account-filter");
        if (!select) return;

        const previousValue = select.value;

        select.innerHTML = `
            <option value="">All Accounts</option>
            ${accounts.map(account => `
                <option value="${escapeHTML(account.id)}">
                    ${escapeHTML(account.account_name)}
                </option>
            `).join("")}
        `;

        if (accounts.some(account => account.id === previousValue)) {
            select.value = previousValue;
        }
    }

    function renderTransactions(transactions) {
        const tbody = $("cash-transactions-body");
        if (!tbody) return;

        if (!transactions.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">No transactions found.</td>
                </tr>
            `;

            if ($("transaction-count")) {
                $("transaction-count").textContent = "0 Transactions";
            }

            return;
        }

        tbody.innerHTML = transactions.map(transaction => {
            const type = transaction.transaction_type || "debit";

            const typeLabel = {
                credit: "Money In",
                debit: "Money Out",
                transfer: "Transfer"
            }[type] || type;

            const typeClass = {
                credit: "transaction-credit",
                debit: "transaction-debit",
                transfer: "transaction-transfer"
            }[type] || "";

            return `
                <tr>
                    <td>${formatDate(transaction.transaction_date)}</td>

                    <td>${escapeHTML(transaction.reference || "—")}</td>

                    <td>${escapeHTML(transaction.account_name || "—")}</td>

                    <td>
                        <span class="${typeClass}">
                            ${escapeHTML(typeLabel)}
                        </span>
                    </td>

                    <td>${escapeHTML(transaction.description || "—")}</td>

                    <td>${formatMoney(transaction.amount)}</td>

                    <td>—</td>

                    <td>—</td>
                </tr>
            `;
        }).join("");

        if ($("transaction-count")) {
            $("transaction-count").textContent =
                `${Number($("transaction-count").dataset.total || transactions.length)} Transactions`;
        }
    }

    function renderPagination(pagination) {
        totalPages = Math.max(1, Number(pagination.total_pages) || 1);
        currentPage = Math.min(
            Math.max(1, Number(pagination.page) || 1),
            totalPages
        );

        if ($("transaction-count")) {
            $("transaction-count").dataset.total =
                pagination.total_records || 0;

            $("transaction-count").textContent =
                `${pagination.total_records || 0} Transactions`;
        }

        if ($("transaction-page-info")) {
            $("transaction-page-info").textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if ($("transaction-previous-page")) {
            $("transaction-previous-page").disabled = currentPage <= 1;
        }

        if ($("transaction-next-page")) {
            $("transaction-next-page").disabled =
                currentPage >= totalPages;
        }
    }

    function resetFilters() {
        if ($("transaction-search")) {
            $("transaction-search").value = "";
        }

        if ($("transaction-account-filter")) {
            $("transaction-account-filter").value = "";
        }

        if ($("transaction-type-filter")) {
            $("transaction-type-filter").value = "all";
        }

        if ($("transaction-date-from")) {
            $("transaction-date-from").value = "";
        }

        if ($("transaction-date-to")) {
            $("transaction-date-to").value = "";
        }

        currentPage = 1;
        loadOverview();
    }

    function openAccountModal() {
        const modal = $("account-modal");
        if (!modal) return;

        $("account-form")?.reset();

        if ($("account-opening-balance")) {
            $("account-opening-balance").value = "0";
        }

        if ($("account-modal-title")) {
            $("account-modal-title").textContent = "Add New Account";
        }

        modal.classList.add("show");
    }

    function closeAccountModal() {
        $("account-modal")?.classList.remove("show");
    }

    async function saveAccount(event) {
        event.preventDefault();

        if (isSaving) return;

        const form = $("account-form");
        if (!form) return;

        const formData = new FormData(form);

        const accountName = $("account-name")?.value.trim();
        const accountType = $("account-type")?.value;
        const openingBalance = Number(
            $("account-opening-balance")?.value || 0
        );

        const openingDate = $("account-opening-date")?.value || null;

        if (!accountName || !accountType) {
            showMessage("Please complete the required account fields.", "error");
            return;
        }

        if (!["cash", "bank", "mobile_banking"].includes(accountType)) {
            showMessage("Invalid account type.", "error");
            return;
        }

        if (!Number.isFinite(openingBalance) || openingBalance < 0) {
            showMessage("Opening balance must be zero or greater.", "error");
            return;
        }

        if (openingBalance > 0 && !openingDate) {
            showMessage("Please select an opening balance date.", "error");
            return;
        }

        isSaving = true;

        const saveButton = $("save-account-button");

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        try {
            const payload = {
                action: "create",
                account_name: accountName,
                account_type: accountType,
                bank_name: $("account-provider")?.value.trim() || null,
                account_number: $("account-number")?.value.trim() || null,
                opening_balance: openingBalance,
                opening_date: openingDate,
                notes: $("account-notes")?.value.trim() || null
            };

            const { data, error } = await supabase.functions.invoke(
                "manage-cash-account",
                { body: payload }
            );

            if (error) {
                throw new Error(error.message || "Unable to create account.");
            }

            if (!data || !data.success) {
                throw new Error(data?.message || "Account creation failed.");
            }

            closeAccountModal();
            showMessage("Account created successfully.", "success");

            currentPage = 1;
            await loadOverview();

        } catch (error) {
            console.error("Account creation error:", error);
            showMessage(error.message, "error");

        } finally {
            isSaving = false;

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "Save Account";
            }
        }
    }

    function bindEvents() {
        $("refresh-accounts-button")?.addEventListener("click", () => {
            currentPage = 1;
            loadOverview();
        });

        $("add-account-button")?.addEventListener(
            "click",
            openAccountModal
        );

        $("close-account-modal")?.addEventListener(
            "click",
            closeAccountModal
        );

        $("cancel-account-button")?.addEventListener(
            "click",
            closeAccountModal
        );

        $("account-modal")?.addEventListener("click", event => {
            if (event.target.id === "account-modal") {
                closeAccountModal();
            }
        });

        $("account-form")?.addEventListener("submit", saveAccount);

        $("account-type-filter")?.addEventListener("change", renderAccounts);

        $("transaction-search-button")?.addEventListener("click", () => {
            currentPage = 1;
            loadOverview();
        });

        $("transaction-reset-button")?.addEventListener(
            "click",
            resetFilters
        );

        $("transaction-previous-page")?.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                loadOverview();
            }
        });

        $("transaction-next-page")?.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadOverview();
            }
        });

        $("transaction-search")?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                currentPage = 1;
                loadOverview();
            }
        });

        $("view-all-transactions")?.addEventListener("click", () => {
            window.location.href = "cash-transactions.html";
        });
    }

    async function init() {
        try {
            supabase = await getClient();

            await checkAccess();

            bindEvents();

            await loadOverview();

        } catch (error) {
            console.error("Cash & Bank initialization error:", error);
            showMessage(error.message, "error");
        }
    }

    return { init };
})();

async function initializeCashBank() {
    await CashBank.init();
}
