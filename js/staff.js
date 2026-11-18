/* staff.js - Air Ticket Agency Management */

/* =========================================
   STAFF MANAGEMENT
   Air Ticket Agency Management
========================================= */

(() => {
    "use strict";

    const PAGE_SIZE = 10;

    const state = {
        staff: [],
        filteredStaff: [],
        currentPage: 1,
        currentRole: null
    };

    const $ = id => document.getElementById(id);

    const elements = {
        message: $("staff-message"),

        total: $("staff-total-count"),
        active: $("staff-active-count"),
        inactive: $("staff-inactive-count"),

        search: $("staff-search"),
        roleFilter: $("staff-role-filter"),
        statusFilter: $("staff-status-filter"),

        searchButton: $("staff-search-button"),
        resetButton: $("staff-reset-button"),
        refreshButton: $("staff-refresh-button"),

        tableBody: $("staff-table-body"),
        recordCount: $("staff-record-count"),

        pageInfo: $("staff-page-info"),
        previousPage: $("staff-previous-page"),
        nextPage: $("staff-next-page"),

        addButton: $("add-staff-button"),
        modal: $("staff-modal"),
        modalTitle: $("staff-modal-title"),
        modalClose: $("staff-modal-close"),
        cancelButton: $("staff-cancel-button"),

        form: $("staff-form"),
        fullName: $("staff-full-name"),
        email: $("staff-email"),
        role: $("staff-role"),
        password: $("staff-password"),
        saveButton: $("staff-save-button")
    };

    /* =====================================
       HELPERS
    ===================================== */

    function getSupabaseClient() {
        return window.supabaseClient || null;
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
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.className = `alert alert-${type}`;
        elements.message.hidden = false;
    }

    function hideMessage() {
        if (!elements.message) return;

        elements.message.hidden = true;
        elements.message.textContent = "";
    }

    function roleLabel(role) {
        const labels = {
            owner: "Owner",
            manager: "Manager",
            ticket_staff: "Ticket Staff",
            accounts_staff: "Accounts Staff"
        };

        return labels[role] || "Unknown";
    }

    function isActive(staff) {
        return staff.is_active === true;
    }

    function renderEmpty(message) {
        if (!elements.tableBody) return;

        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;
    }

    /* =====================================
       BACKEND REQUEST
    ===================================== */

    async function callStaffFunction(payload) {
        const supabase = getSupabaseClient();

        if (!supabase) {
            throw new Error(
                "Supabase client is not initialized."
            );
        }

        const { data, error } = await supabase.functions.invoke(
            "manage-staff",
            { body: payload }
        );

        if (error) {
            throw new Error(
                error.message || "Staff service request failed."
            );
        }

        if (!data || data.success !== true) {
            throw new Error(
                data?.message || "Unable to complete the staff request."
            );
        }

        return data;
    }

    /* =====================================
       OWNER ACCESS
    ===================================== */

    function updateOwnerControls() {
        const isOwner = state.currentRole === "owner";

        if (elements.addButton) {
            elements.addButton.hidden = !isOwner;
        }

        if (!isOwner && elements.modal) {
            closeModal();
        }
    }

    /* =====================================
       LOAD STAFF
    ===================================== */

    async function loadStaff() {
        hideMessage();

        if (elements.refreshButton) {
            elements.refreshButton.disabled = true;
            elements.refreshButton.textContent = "Loading...";
        }

        renderEmpty("Loading staff members...");

        try {
            /*
             * The Edge Function must:
             * 1. Verify the user's JWT.
             * 2. Verify an active profile.
             * 3. Return staff records only to authorized roles.
             * 4. Enforce Owner-only account creation.
             *
             * Expected response:
             * {
             *   success: true,
             *   current_role: "owner",
             *   staff: [{
             *     id, full_name, email, role,
             *     is_active, created_at
             *   }]
             * }
             */

            const result = await callStaffFunction({
                action: "list"
            });

            state.currentRole = result.current_role || null;

            state.staff = Array.isArray(result.staff)
                ? result.staff
                : [];

            updateOwnerControls();
            applyFilters();

        } catch (error) {
            console.error("Staff loading error:", error);

            state.staff = [];
            state.filteredStaff = [];

            updateSummary();
            renderEmpty("Unable to load staff members.");

            showMessage(
                error.message || "Unable to load staff members.",
                "danger"
            );

        } finally {
            if (elements.refreshButton) {
                elements.refreshButton.disabled = false;
                elements.refreshButton.textContent = "Refresh";
            }
        }
    }

    /* =====================================
       SUMMARY
    ===================================== */

    function updateSummary() {
        const total = state.staff.length;

        const active = state.staff.filter(
            isActive
        ).length;

        const inactive = total - active;

        if (elements.total) {
            elements.total.textContent =
                total.toLocaleString("en-BD");
        }

        if (elements.active) {
            elements.active.textContent =
                active.toLocaleString("en-BD");
        }

        if (elements.inactive) {
            elements.inactive.textContent =
                inactive.toLocaleString("en-BD");
        }

        if (elements.recordCount) {
            elements.recordCount.textContent =
                `${state.filteredStaff.length.toLocaleString("en-BD")} staff members`;
        }
    }

    /* =====================================
       FILTER
    ===================================== */

    function applyFilters() {
        const searchText = (
            elements.search?.value || ""
        ).trim().toLowerCase();

        const selectedRole =
            elements.roleFilter?.value || "all";

        const selectedStatus =
            elements.statusFilter?.value || "all";

        state.filteredStaff = state.staff.filter(staff => {

            const name = String(
                staff.full_name || ""
            ).toLowerCase();

            const email = String(
                staff.email || ""
            ).toLowerCase();

            const matchesSearch =
                !searchText ||
                name.includes(searchText) ||
                email.includes(searchText);

            const matchesRole =
                selectedRole === "all" ||
                staff.role === selectedRole;

            const active = isActive(staff);

            const matchesStatus =
                selectedStatus === "all" ||
                (selectedStatus === "active" && active) ||
                (selectedStatus === "inactive" && !active);

            return (
                matchesSearch &&
                matchesRole &&
                matchesStatus
            );
        });

        state.currentPage = 1;

        updateSummary();
        renderStaff();
    }

    /* =====================================
       RENDER STAFF TABLE
    ===================================== */

    function renderStaff() {
        if (!elements.tableBody) return;

        const totalRecords = state.filteredStaff.length;

        const totalPages = Math.max(
            1,
            Math.ceil(totalRecords / PAGE_SIZE)
        );

        if (state.currentPage > totalPages) {
            state.currentPage = totalPages;
        }

        if (totalRecords === 0) {
            renderEmpty("No staff members found.");
            updatePagination(totalPages);
            return;
        }

        const startIndex =
            (state.currentPage - 1) * PAGE_SIZE;

        const records = state.filteredStaff.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        elements.tableBody.innerHTML = records.map(staff => {

            const active = isActive(staff);

            const statusHTML = active
                ? '<span class="staff-status active">Active</span>'
                : '<span class="staff-status inactive">Inactive</span>';

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHTML(staff.full_name || "Unnamed")}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(staff.email || "—")}
                    </td>

                    <td>
                        <span class="staff-role-label">
                            ${escapeHTML(roleLabel(staff.role))}
                        </span>
                    </td>

                    <td>
                        ${statusHTML}
                    </td>

                    <td>
                        ${escapeHTML(formatDate(staff.created_at))}
                    </td>

                    <td>
                        <span class="text-muted">—</span>
                    </td>
                </tr>
            `;
        }).join("");

        updatePagination(totalPages);
    }

    /* =====================================
       PAGINATION
    ===================================== */

    function updatePagination(totalPages) {
        if (elements.pageInfo) {
            elements.pageInfo.textContent =
                `Page ${state.currentPage} of ${totalPages}`;
        }

        if (elements.previousPage) {
            elements.previousPage.disabled =
                state.currentPage <= 1;
        }

        if (elements.nextPage) {
            elements.nextPage.disabled =
                state.currentPage >= totalPages;
        }
    }

    function previousPage() {
        if (state.currentPage <= 1) return;

        state.currentPage--;
        renderStaff();
    }

    function nextPage() {
        const totalPages = Math.max(
            1,
            Math.ceil(
                state.filteredStaff.length / PAGE_SIZE
            )
        );

        if (state.currentPage >= totalPages) return;

        state.currentPage++;
        renderStaff();
    }

    /* =====================================
       MODAL
    ===================================== */

    function openModal() {
        if (state.currentRole !== "owner") {
            showMessage(
                "Only the Owner can create staff accounts.",
                "danger"
            );
            return;
        }

        if (elements.form) {
            elements.form.reset();
        }

        if (elements.modalTitle) {
            elements.modalTitle.textContent =
                "Add Staff Member";
        }

        if (elements.saveButton) {
            elements.saveButton.disabled = false;
            elements.saveButton.textContent =
                "Create Staff Account";
        }

        if (elements.modal) {
            elements.modal.hidden = false;
        }

        elements.fullName?.focus();
    }

    function closeModal() {
        if (elements.modal) {
            elements.modal.hidden = true;
        }

        if (elements.form) {
            elements.form.reset();
        }
    }

    /* =====================================
       CREATE STAFF
    ===================================== */

    async function createStaff(event) {
        event.preventDefault();
        hideMessage();

        if (state.currentRole !== "owner") {
            showMessage(
                "Only the Owner can create staff accounts.",
                "danger"
            );
            return;
        }

        const fullName = elements.fullName?.value.trim();
        const email = elements.email?.value.trim().toLowerCase();
        const role = elements.role?.value;
        const password = elements.password?.value;

        if (!fullName || !email || !role || !password) {
            showMessage(
                "Please complete all required fields.",
                "warning"
            );
            return;
        }

        if (!["manager", "ticket_staff", "accounts_staff"].includes(role)) {
            showMessage(
                "Please select a valid staff role.",
                "warning"
            );
            return;
        }

        if (password.length < 8) {
            showMessage(
                "Password must contain at least 8 characters.",
                "warning"
            );
            return;
        }

        if (elements.saveButton) {
            elements.saveButton.disabled = true;
            elements.saveButton.textContent = "Creating...";
        }

        try {
            /*
             * The Edge Function must create the Auth user
             * using service_role on the server only.
             *
             * It must also:
             * - Verify the caller is the active Owner.
             * - Validate email and role.
             * - Create the profile safely.
             * - Avoid exposing service_role to the browser.
             */

            await callStaffFunction({
                action: "create",
                full_name: fullName,
                email,
                role,
                password
            });

            closeModal();

            showMessage(
                "Staff account created successfully.",
                "success"
            );

            await loadStaff();

        } catch (error) {
            console.error("Staff creation error:", error);

            showMessage(
                error.message || "Unable to create staff account.",
                "danger"
            );

        } finally {
            if (elements.saveButton) {
                elements.saveButton.disabled = false;
                elements.saveButton.textContent =
                    "Create Staff Account";
            }
        }
    }

    /* =====================================
       EVENT LISTENERS
    ===================================== */

    function bindEvents() {

        elements.searchButton?.addEventListener(
            "click",
            applyFilters
        );

        elements.search?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                applyFilters();
            }
        });

        elements.roleFilter?.addEventListener(
            "change",
            applyFilters
        );

        elements.statusFilter?.addEventListener(
            "change",
            applyFilters
        );

        elements.resetButton?.addEventListener("click", () => {

            if (elements.search) {
                elements.search.value = "";
            }

            if (elements.roleFilter) {
                elements.roleFilter.value = "all";
            }

            if (elements.statusFilter) {
                elements.statusFilter.value = "all";
            }

            applyFilters();
        });

        elements.refreshButton?.addEventListener(
            "click",
            loadStaff
        );

        elements.previousPage?.addEventListener(
            "click",
            previousPage
        );

        elements.nextPage?.addEventListener(
            "click",
            nextPage
        );

        elements.addButton?.addEventListener(
            "click",
            openModal
        );

        elements.modalClose?.addEventListener(
            "click",
            closeModal
        );

        elements.cancelButton?.addEventListener(
            "click",
            closeModal
        );

        elements.modal?.addEventListener("click", event => {
            if (event.target === elements.modal) {
                closeModal();
            }
        });

        elements.form?.addEventListener(
            "submit",
            createStaff
        );

        document.addEventListener("keydown", event => {
            if (
                event.key === "Escape" &&
                elements.modal &&
                !elements.modal.hidden
            ) {
                closeModal();
            }
        });
    }

    /* =====================================
       INITIALIZE
    ===================================== */

    async function initialize() {
        bindEvents();

        if (window.AuthManager?.checkSession) {
            const session = await window.AuthManager.checkSession();

            if (session === false) return;
        }

        await loadStaff();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );
    } else {
        initialize();
    }

})();

