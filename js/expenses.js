
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const $ = (id) => document.getElementById(id);

    const el = {
        message: $("expenses-message"),
        search: $("expense-search"),
        category: $("expense-category-filter"),
        method: $("expense-method-filter"),
        dateFrom: $("expense-date-from"),
        dateTo: $("expense-date-to"),

        searchButton: $("expense-search-button"),
        resetButton: $("expense-reset-button"),
        refreshButton: $("expense-refresh-button"),

        tableBody: $("expenses-table-body"),
        count: $("expense-count"),
        previous: $("expense-previous-page"),
        next: $("expense-next-page"),
        pageInfo: $("expense-page-info"),

        total: $("total-expenses"),
        totalCount: $("expense-total-count"),
        today: $("today-expenses"),
        monthly: $("monthly-expenses")
    };

    const PAGE_SIZE = 10;

    let supabase = null;
    let expenses = [];
    let categories = [];
    let filteredExpenses = [];
    let currentPage = 1;

    /* ========================================
       HELPERS
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

    function money(value) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function localDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(`${value}T00:00:00`);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-GB");
    }

    function showMessage(message, type = "info") {
        if (!el.message) return;

        el.message.textContent = message;
        el.message.className = `expenses-message alert alert-${type}`;
    }

    function hideMessage() {
        if (!el.message) return;

        el.message.textContent = "";
        el.message.className = "expenses-message";
    }

    function setText(element, value) {
        if (element) element.textContent = value;
    }

    function categoryName(categoryId) {
        const category = categories.find(
            item => String(item.id) === String(categoryId)
        );

        return category?.name || "Uncategorized";
    }

    /* ========================================
       SUPABASE INITIALIZATION
    ======================================== */

    async function initialize() {
        try {
            supabase = window.supabaseClient;

            if (!supabase && window.AuthManager?.initialize) {
                supabase = await window.AuthManager.initialize();
            }

            if (!supabase) {
                showMessage("Supabase connection is unavailable.", "danger");
                return false;
            }

            const { data, error } = await supabase.auth.getSession();

            if (error || !data.session) {
                window.location.href = "login.html";
                return false;
            }

            return true;

        } catch (error) {
            console.error("Initialization error:", error);
            showMessage("Unable to initialize the Expenses page.", "danger");
            return false;
        }
    }

    /* ========================================
       LOAD CATEGORIES
    ======================================== */

    async function loadCategories() {
        const { data, error } = await supabase
            .from("expense_categories")
            .select("id, name:category_name")
            .order("category_name", { ascending: true });

        if (error) {
            console.error("Category loading error:", error);
            throw error;
        }

        categories = data || [];

        if (!el.category) return;

        const selected = el.category.value || "all";

        el.category.innerHTML = `
            <option value="all">All Categories</option>
        `;

        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            el.category.appendChild(option);
        });

        el.category.value = selected;
    }

    /* ========================================
       LOAD EXPENSES
    ======================================== */

    async function loadExpenses() {
        showMessage("Loading expenses...", "info");

        try {
            await loadCategories();

            const { data, error } = await supabase
                .from("expenses")
                .select(`
                    id,
                    expense_date,
                    expense_reference,
                    description:expense_title,
                    amount,
                    payment_method,
                    category_id,
                    recorded_by,
                    created_at
                `)
                .order("expense_date", { ascending: false })
                .order("created_at", { ascending: false });

            if (error) throw error;

            expenses = data || [];

            updateSummary();
            applyFilters();
            hideMessage();

        } catch (error) {
            console.error("Expense loading error:", error);

            expenses = [];
            filteredExpenses = [];

            updateSummary();
            renderTable();

            showMessage(
                "Unable to load expenses. Please check your database tables, columns and permissions.",
                "danger"
            );
        }
    }

    /* ========================================
       SUMMARY
    ======================================== */

    function updateSummary() {
        const today = localDate();
        const month = today.slice(0, 7);

        const total = expenses.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
        );

        const todayTotal = expenses
            .filter(item => item.expense_date === today)
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);

        const monthlyTotal = expenses
            .filter(item => String(item.expense_date || "").startsWith(month))
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);

        const average = expenses.length
            ? total / expenses.length
            : 0;

        setText(el.total, money(total));
        setText(el.totalCount, `${expenses.length} transactions`);
        setText(el.today, money(todayTotal));
        setText(el.monthly, money(monthlyTotal));
        setText(el.average, money(average));
    }

    /* ========================================
       FILTERS
    ======================================== */

    function applyFilters() {
        const search = (el.search?.value || "")
            .trim()
            .toLowerCase();

        const category = el.category?.value || "all";
        const method = el.method?.value || "all";
        const dateFrom = el.dateFrom?.value || "";
        const dateTo = el.dateTo?.value || "";

        filteredExpenses = expenses.filter(item => {
            const name = categoryName(item.category_id);

            const searchable = [
                item.expense_reference,
                item.description,
                item.payment_method,
                name
            ].join(" ").toLowerCase();

            if (search && !searchable.includes(search)) {
                return false;
            }

            if (
                category !== "all" &&
                String(item.category_id) !== category
            ) {
                return false;
            }

            if (
                method !== "all" &&
                item.payment_method !== method
            ) {
                return false;
            }

            if (dateFrom && item.expense_date < dateFrom) {
                return false;
            }

            if (dateTo && item.expense_date > dateTo) {
                return false;
            }

            return true;
        });

        currentPage = 1;
        renderTable();
    }

    /* ========================================
       RENDER TABLE
    ======================================== */

    function renderTable() {
        if (!el.tableBody) return;

        const totalPages = Math.max(
            1,
            Math.ceil(filteredExpenses.length / PAGE_SIZE)
        );

        currentPage = Math.min(currentPage, totalPages);

        const start = (currentPage - 1) * PAGE_SIZE;

        const pageItems = filteredExpenses.slice(
            start,
            start + PAGE_SIZE
        );

        if (pageItems.length === 0) {
            el.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-cell">
                        No expenses found.
                    </td>
                </tr>
            `;
        } else {
            el.tableBody.innerHTML = pageItems.map(item => `
                <tr>
                    <td class="expense-reference">
                        ${escapeHTML(item.expense_reference || "—")}
                    </td>

                    <td>
                        ${formatDate(item.expense_date)}
                    </td>

                    <td>
                        ${escapeHTML(categoryName(item.category_id))}
                    </td>

                    <td>
                        ${escapeHTML(item.description || "—")}
                    </td>

                    <td>
                        <span class="expense-method">
                            ${escapeHTML(
                                String(item.payment_method || "—")
                                    .replaceAll("_", " ")
                            )}
                        </span>
                    </td>

                    <td class="expense-amount">
                        ${money(item.amount)}
                    </td>

                    <td>
                        ${escapeHTML(item.recorded_by || "—")}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="expense-action-button"
                            data-expense-id="${escapeHTML(item.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        setText(
            el.count,
            `${filteredExpenses.length} expenses`
        );

        setText(
            el.pageInfo,
            `Page ${currentPage} of ${totalPages}`
        );

        if (el.previous) {
            el.previous.disabled = currentPage <= 1;
        }

        if (el.next) {
            el.next.disabled = currentPage >= totalPages;
        }
    }

    /* ========================================
       EVENT LISTENERS
    ======================================== */

    el.searchButton?.addEventListener("click", applyFilters);

    el.search?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            applyFilters();
        }
    });

    el.category?.addEventListener("change", applyFilters);
    el.method?.addEventListener("change", applyFilters);
    el.dateFrom?.addEventListener("change", applyFilters);
    el.dateTo?.addEventListener("change", applyFilters);

    el.resetButton?.addEventListener("click", () => {
        if (el.search) el.search.value = "";
        if (el.category) el.category.value = "all";
        if (el.method) el.method.value = "all";
        if (el.dateFrom) el.dateFrom.value = "";
        if (el.dateTo) el.dateTo.value = "";

        applyFilters();
    });

    el.refreshButton?.addEventListener("click", loadExpenses);

    el.previous?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    el.next?.addEventListener("click", () => {
        const totalPages = Math.ceil(
            filteredExpenses.length / PAGE_SIZE
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });

    el.tableBody?.addEventListener("click", event => {
        const button = event.target.closest("[data-expense-id]");

        if (!button) return;

        const id = button.dataset.expenseId;

        window.location.href =
            `expense-details.html?id=${encodeURIComponent(id)}`;
    });

    /* ========================================
       START
    ======================================== */

    if (await initialize()) {
        await loadExpenses();
    }
});
