
/* ========================================
   Expense Categories
   Air Ticket Agency Management
======================================== */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {

    const tableBody = document.getElementById("categories-table-body");
    if (!tableBody) return;

    /* ========================================
       DOM Elements
    ======================================== */

    const message = document.getElementById("categories-message");

    const totalCategories = document.getElementById("total-categories");
    const activeCategories = document.getElementById("active-categories");
    const inactiveCategories = document.getElementById("inactive-categories");

    const categoryCount = document.getElementById("category-count");
    const pageInfo = document.getElementById("category-page-info");

    const searchInput = document.getElementById("category-search");
    const searchButton = document.getElementById("category-search-button");
    const statusFilter = document.getElementById("category-status-filter");

    const resetButton = document.getElementById("category-reset-button");
    const refreshButton = document.getElementById("category-refresh-button");

    const previousButton = document.getElementById("category-previous-page");
    const nextButton = document.getElementById("category-next-page");

    const modal = document.getElementById("category-modal");
    const modalTitle = document.getElementById("category-modal-title");

    const addButton = document.getElementById("add-category-button");
    const closeModalButton = document.getElementById("close-category-modal");
    const cancelButton = document.getElementById("cancel-category-button");

    const form = document.getElementById("category-form");
    const categoryId = document.getElementById("category-id");
    const categoryName = document.getElementById("category-name");
    const categoryDescription = document.getElementById("category-description");
    const categoryStatus = document.getElementById("category-status");

    const saveButton = document.getElementById("save-category-button");

    /* ========================================
       State
    ======================================== */

    const PAGE_SIZE = 10;

    let supabase = null;
    let currentPage = 1;
    let totalPages = 1;
    let totalRecords = 0;
    let isSaving = false;

    let currentSearch = "";
    let currentStatus = "all";

    let categories = [];

    /* ========================================
       Helpers
    ======================================== */

    function showMessage(text, type = "info") {

        message.textContent = text;
        message.className = `categories-message ${type}`;
    }

    function clearMessage() {

        message.textContent = "";
        message.className = "categories-message";
    }

    function setLoading(loading) {

        if (refreshButton) {
            refreshButton.disabled = loading;
            refreshButton.textContent = loading ? "Loading..." : "Refresh";
        }

        if (saveButton) {
            saveButton.disabled = loading || isSaving;
        }
    }

    function formatDate(value) {

        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-BD", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function escapeHTML(value) {

        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function setButtonLoading(loading) {

        isSaving = loading;

        saveButton.disabled = loading;
        saveButton.textContent = loading
            ? "Saving..."
            : categoryId.value
                ? "Update Category"
                : "Save Category";
    }

    /* ========================================
       Supabase Client
    ======================================== */

    async function initializeSupabase() {

        if (window.supabaseClient) {
            supabase = window.supabaseClient;
            return true;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            supabase = await window.AuthManager.initialize();

            if (supabase) {
                window.supabaseClient = supabase;
                return true;
            }
        }

        showMessage(
            "Supabase connection is not available. Please check your configuration.",
            "error"
        );

        return false;
    }

    /* ========================================
       Authentication
    ======================================== */

    async function checkAuthentication() {

        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
            window.location.href = "login.html";
            return false;
        }

        return true;
    }

    /* ========================================
       Update Statistics
    ======================================== */

    function updateStatistics(data) {

        const active = data.filter(item => item.is_active === true).length;

        const inactive = data.length - active;

        totalCategories.textContent = totalRecords;

        activeCategories.textContent = active;
        inactiveCategories.textContent = inactive;
    }

    /* ========================================
       Render Table
    ======================================== */

    function renderCategories(data) {

        tableBody.replaceChildren();

        if (!data.length) {

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "empty-state";
            cell.textContent = "No expense categories found.";

            row.appendChild(cell);
            tableBody.appendChild(row);

            return;
        }

        data.forEach(category => {

            const row = document.createElement("tr");

            const nameCell = document.createElement("td");
            nameCell.innerHTML = `
                <span class="category-name">
                    ${escapeHTML(category.name)}
                </span>
            `;

            const descriptionCell = document.createElement("td");
            descriptionCell.innerHTML = `
                <span class="category-description">
                    ${escapeHTML(category.description || "—")}
                </span>
            `;

            const statusCell = document.createElement("td");

            const statusBadge = document.createElement("span");

            statusBadge.className = category.is_active
                ? "category-status active"
                : "category-status inactive";

            statusBadge.textContent = category.is_active
                ? "Active"
                : "Inactive";

            statusCell.appendChild(statusBadge);

            const dateCell = document.createElement("td");
            dateCell.textContent = formatDate(category.created_at);

            const actionCell = document.createElement("td");
            actionCell.className = "category-actions";

            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.className = "category-action-button";
            editButton.dataset.action = "edit";
            editButton.dataset.id = category.id;
            editButton.textContent = "Edit";

            const statusButton = document.createElement("button");

            statusButton.type = "button";
            statusButton.className = "category-action-button";
            statusButton.dataset.action = "toggle";
            statusButton.dataset.id = category.id;
            statusButton.textContent = category.is_active
                ? "Deactivate"
                : "Activate";

            actionCell.append(editButton, statusButton);

            row.append(
                nameCell,
                descriptionCell,
                statusCell,
                dateCell,
                actionCell
            );

            tableBody.appendChild(row);
        });
    }

    /* ========================================
       Load Categories
    ======================================== */

    async function loadCategories() {

        setLoading(true);
        clearMessage();

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Loading categories...
                </td>
            </tr>
        `;

        try {

            let query = supabase
                .from("expense_categories")
                .select(
                    "id, name:category_name, description, is_active, created_at",
                    { count: "exact" }
                )
                .order("category_name", { ascending: true });

            if (currentSearch) {
                query = query.ilike("category_name", `%${currentSearch}%`);
            }

            if (currentStatus === "active") {
                query = query.eq("is_active", true);
            }

            if (currentStatus === "inactive") {
                query = query.eq("is_active", false);
            }

            const from = (currentPage - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data, error, count } = await query.range(from, to);

            if (error) throw error;

            categories = data || [];
            totalRecords = count || 0;

            totalPages = Math.max(
                1,
                Math.ceil(totalRecords / PAGE_SIZE)
            );

            renderCategories(categories);

            categoryCount.textContent =
                `${totalRecords} Categories`;

            pageInfo.textContent = totalRecords
                ? `Showing ${from + 1}–${Math.min(from + categories.length, totalRecords)} of ${totalRecords}`
                : "Showing 0 of 0";

            previousButton.disabled = currentPage <= 1;
            nextButton.disabled = currentPage >= totalPages;

            /*
             * Statistics are loaded separately so that
             * filters and pagination do not change totals.
             */

            await loadStatistics();

        } catch (error) {

            console.error("Load categories error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        Unable to load categories.
                    </td>
                </tr>
            `;

            showMessage(
                error.message || "Unable to load expense categories.",
                "error"
            );

        } finally {

            setLoading(false);
        }
    }

    /* ========================================
       Load Statistics
    ======================================== */

    async function loadStatistics() {

        const { data, error } = await supabase
            .from("expense_categories")
            .select("is_active");

        if (error) {
            console.error("Category statistics error:", error);
            return;
        }

        const allCategories = data || [];

        const active = allCategories.filter(
            item => item.is_active === true
        ).length;

        const inactive = allCategories.length - active;

        totalCategories.textContent = allCategories.length;
        activeCategories.textContent = active;
        inactiveCategories.textContent = inactive;
    }

    /* ========================================
       Modal Management
    ======================================== */

    function openModal(category = null) {

        clearMessage();

        form.reset();

        categoryId.value = "";

        if (category) {

            modalTitle.textContent = "Edit Expense Category";

            categoryId.value = category.id;
            categoryName.value = category.name || "";
            categoryDescription.value = category.description || "";

            categoryStatus.value = category.is_active
                ? "true"
                : "false";

            saveButton.textContent = "Update Category";

        } else {

            modalTitle.textContent = "Add Expense Category";

            categoryStatus.value = "true";

            saveButton.textContent = "Save Category";
        }

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");

        setTimeout(() => categoryName.focus(), 50);
    }

    function closeModal() {

        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");

        form.reset();
        categoryId.value = "";

        clearMessage();
    }

    /* ========================================
       Add / Update Category
    ======================================== */

    async function saveCategory(event) {

        event.preventDefault();

        if (isSaving) return;

        clearMessage();

        const id = categoryId.value;

        const name = categoryName.value.trim();

        const description =
            categoryDescription.value.trim() || null;

        const isActive = categoryStatus.value === "true";

        if (!name) {

            showMessage(
                "Please enter a category name.",
                "error"
            );

            categoryName.focus();
            return;
        }

        if (name.length > 100) {

            showMessage(
                "Category name cannot exceed 100 characters.",
                "error"
            );

            categoryName.focus();
            return;
        }

        if (description && description.length > 500) {

            showMessage(
                "Description cannot exceed 500 characters.",
                "error"
            );

            categoryDescription.focus();
            return;
        }

        setButtonLoading(true);

        try {

            const payload = {
                category_name: name,
                description,
                is_active: isActive
            };

            let result;

            if (id) {

                result = await supabase
                    .from("expense_categories")
                    .update(payload)
                    .eq("id", id)
                    .select("id")
                    .single();

            } else {

                result = await supabase
                    .from("expense_categories")
                    .insert(payload)
                    .select("id")
                    .single();
            }

            if (result.error) throw result.error;

            if (!result.data) {
                throw new Error(
                    "You do not have permission to save this category."
                );
            }

            closeModal();

            showMessage(
                id
                    ? "Expense category updated successfully."
                    : "Expense category created successfully.",
                "success"
            );

            currentPage = 1;

            await loadCategories();

        } catch (error) {

            console.error("Save category error:", error);

            if (error.code === "23505") {

                showMessage(
                    "A category with this name already exists.",
                    "error"
                );

            } else {

                showMessage(
                    error.message || "Unable to save expense category.",
                    "error"
                );
            }

        } finally {

            setButtonLoading(false);
        }
    }

    /* ========================================
       Activate / Deactivate Category
    ======================================== */

    async function toggleCategory(id) {

        const category = categories.find(
            item => String(item.id) === String(id)
        );

        if (!category) return;

        const newStatus = !category.is_active;

        const confirmation = newStatus
            ? `Activate "${category.name}"?`
            : `Deactivate "${category.name}"?`;

        if (!window.confirm(confirmation)) return;

        try {

            const { data, error } = await supabase
                .from("expense_categories")
                .update({
                    is_active: newStatus
                })
                .eq("id", category.id)
                .select("id")
                .single();

            if (error) throw error;

            if (!data) {
                throw new Error(
                    "You do not have permission to change this category."
                );
            }

            showMessage(
                newStatus
                    ? "Category activated successfully."
                    : "Category deactivated successfully.",
                "success"
            );

            await loadCategories();

        } catch (error) {

            console.error("Category status update error:", error);

            showMessage(
                error.message || "Unable to update category status.",
                "error"
            );
        }
    }

    /* ========================================
       Table Actions
    ======================================== */

    tableBody.addEventListener("click", event => {

        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "edit") {

            const category = categories.find(
                item => String(item.id) === String(id)
            );

            if (category) openModal(category);
        }

        if (action === "toggle") {
            toggleCategory(id);
        }
    });

    /* ========================================
       Search & Filters
    ======================================== */

    function applyFilters() {

        currentSearch = searchInput.value.trim();
        currentStatus = statusFilter.value;

        currentPage = 1;

        loadCategories();
    }

    searchButton.addEventListener("click", applyFilters);

    searchInput.addEventListener("keydown", event => {

        if (event.key === "Enter") {
            event.preventDefault();
            applyFilters();
        }
    });

    statusFilter.addEventListener("change", applyFilters);

    resetButton.addEventListener("click", () => {

        searchInput.value = "";
        statusFilter.value = "all";

        currentSearch = "";
        currentStatus = "all";
        currentPage = 1;

        loadCategories();
    });

    refreshButton.addEventListener("click", () => {
        loadCategories();
    });

    /* ========================================
       Pagination
    ======================================== */

    previousButton.addEventListener("click", () => {

        if (currentPage <= 1) return;

        currentPage--;

        loadCategories();
    });

    nextButton.addEventListener("click", () => {

        if (currentPage >= totalPages) return;

        currentPage++;

        loadCategories();
    });

    /* ========================================
       Modal Events
    ======================================== */

    addButton.addEventListener("click", () => {
        openModal();
    });

    closeModalButton.addEventListener("click", closeModal);

    cancelButton.addEventListener("click", closeModal);

    modal.addEventListener("click", event => {

        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {

        if (
            event.key === "Escape" &&
            modal.classList.contains("show")
        ) {
            closeModal();
        }
    });

    form.addEventListener("submit", saveCategory);

    /* ========================================
       Initialize
    ======================================== */

    const connected = await initializeSupabase();

    if (!connected) return;

    const authenticated = await checkAuthentication();

    if (!authenticated) return;

    await loadCategories();

});
