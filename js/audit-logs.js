
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   AUDIT LOGS
   Secure Supabase RPC Integration
========================================================= */

(function () {
    "use strict";

    const PAGE_SIZE = 15;

    let supabase = null;
    let currentProfile = null;

    let currentPage = 1;
    let totalRecords = 0;
    let totalPages = 1;

    let isLoading = false;

    let filters = {
        search: "",
        module: "",
        action: "",
        dateFrom: null,
        dateTo: null
    };

    const $ = id => document.getElementById(id);

    document.addEventListener("DOMContentLoaded", initializeAuditLogs);

    /* =====================================================
       INITIALIZE
    ===================================================== */

    async function initializeAuditLogs() {
        try {
            if (!window.AuthManager) {
                throw new Error("Authentication controller unavailable.");
            }

            await window.AuthManager.initialize();

            const session = await window.AuthManager.checkSession();

            if (!session || !session.user) return;

            supabase = window.supabaseClient;

            if (!supabase) {
                throw new Error("Supabase client unavailable.");
            }

            await loadCurrentProfile(session.user);

            bindAuditEvents();
            initializeAuditModal();

            await Promise.all([
                loadAuditSummary(),
                loadAuditLogs()
            ]);

        } catch (error) {
            console.error("Audit initialization:", error);

            showAuditMessage(
                error.message || "Unable to initialize Audit Logs.",
                "error"
            );
        }
    }

    /* =====================================================
       PROFILE AND ACCESS
    ===================================================== */

    async function loadCurrentProfile(user) {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data || data.is_active !== true) {
            await window.AuthManager.logout();
            return;
        }

        currentProfile = data;

        const role = String(data.role || "").toLowerCase();

        if (!["owner", "manager"].includes(role)) {
            throw new Error(
                "Access denied. Audit Logs are available to Owner and Manager only."
            );
        }

        const name =
            data.full_name ||
            user.user_metadata?.full_name ||
            user.email ||
            "User";

        if ($("user-name")) {
            $("user-name").textContent = name;
        }

        if ($("user-role")) {
            $("user-role").textContent = formatRole(role);
        }

        if ($("user-avatar")) {
            $("user-avatar").textContent = getInitials(name);
        }

        document.body.dataset.userRole = role;
    }

    function formatRole(role) {
        const labels = {
            owner: "Owner",
            manager: "Manager"
        };

        return labels[role] || "Staff";
    }

    function getInitials(name) {
        return String(name || "U")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }

    /* =====================================================
       EVENT BINDINGS
    ===================================================== */

    function bindAuditEvents() {
        $("audit-refresh-button")
            ?.addEventListener("click", refreshAuditLogs);

        $("audit-search-button")
            ?.addEventListener("click", applyAuditFilters);

        $("audit-reset-button")
            ?.addEventListener("click", resetAuditFilters);

        $("audit-previous-page")
            ?.addEventListener("click", previousPage);

        $("audit-next-page")
            ?.addEventListener("click", nextPage);

        $("audit-search")
            ?.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    applyAuditFilters();
                }
            });
    }

    /* =====================================================
       SUMMARY
    ===================================================== */

    async function loadAuditSummary() {
        try {
            const today = getDhakaDateString(new Date());

            const { data, error } = await supabase
                .from("audit_logs")
                .select("id, created_at", { count: "exact" })
                .order("created_at", { ascending: false })
                .limit(1000);

            if (error) throw error;

            const records = data || [];

            const todayCount = records.filter(record => {
                return getDhakaDateString(
                    new Date(record.created_at)
                ) === today;
            }).length;

            if ($("audit-total-count")) {
                $("audit-total-count").textContent =
                    Number(error ? 0 : records.length).toLocaleString("en-US");
            }

            if ($("audit-today-count")) {
                $("audit-today-count").textContent =
                    todayCount.toLocaleString("en-US");
            }

            if ($("audit-last-activity")) {
                $("audit-last-activity").textContent =
                    records.length
                        ? formatAuditDate(records[0].created_at)
                        : "—";
            }

            /*
             * The summary query is capped at 1000 rows.
             * It is a recent-activity summary, not a lifetime count.
             */

        } catch (error) {
            console.error("Audit summary error:", error);

            showAuditMessage(
                "Unable to load Audit Summary.",
                "error"
            );
        }
    }

    /* =====================================================
       LOAD AUDIT LOGS THROUGH SECURE RPC
    ===================================================== */

    async function loadAuditLogs() {
        if (isLoading) return;

        isLoading = true;

        const tbody = $("audit-table-body");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        Loading activity records...
                    </td>
                </tr>
            `;
        }

        try {
            const { data, error } = await supabase.rpc(
                "get_audit_logs",
                {
                    p_search: filters.search || null,
                    p_module: filters.module || null,
                    p_action: filters.action || null,
                    p_date_from: filters.dateFrom || null,
                    p_date_to: filters.dateTo || null,
                    p_page: currentPage,
                    p_page_size: PAGE_SIZE
                }
            );

            if (error) throw error;

            const records = data || [];

            totalRecords = records.length
                ? Number(records[0].total_count || 0)
                : 0;

            totalPages = Math.max(
                1,
                Math.ceil(totalRecords / PAGE_SIZE)
            );

            renderAuditLogs(records);

        } catch (error) {
            console.error("Secure Audit RPC error:", error);

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="table-empty">
                            Unable to load activity records.
                        </td>
                    </tr>
                `;
            }

            showAuditMessage(
                error.message || "Unable to load Audit Logs.",
                "error"
            );

        } finally {
            isLoading = false;
        }
    }

    /* =====================================================
       RENDER TABLE
    ===================================================== */

    function renderAuditLogs(records) {
        const tbody = $("audit-table-body");

        if (!tbody) return;

        updatePagination();

        if ($("audit-record-count")) {
            $("audit-record-count").textContent =
                totalRecords.toLocaleString("en-US");
        }

        if (!records.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        No activity records found.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.replaceChildren();

        records.forEach(log => {
            const row = document.createElement("tr");

            addCell(row, formatAuditDate(log.created_at));
            addCell(row, log.user_name || "Unknown User");

            const actionCell = document.createElement("td");

            const badge = document.createElement("span");

            badge.className =
                `audit-action audit-action-${getActionClass(log.action)}`;

            badge.textContent = formatAction(log.action);

            actionCell.appendChild(badge);
            row.appendChild(actionCell);

            addCell(row, formatModule(log.table_name));
            addCell(row, describeLog(log));

            const detailsCell = document.createElement("td");

            const button = document.createElement("button");

            button.type = "button";
            button.className = "audit-view-button";
            button.textContent = "View Details";

            button.addEventListener("click", () => {
                openAuditModal(log);
            });

            detailsCell.appendChild(button);
            row.appendChild(detailsCell);

            tbody.appendChild(row);
        });
    }

    function addCell(row, value) {
        const cell = document.createElement("td");
        cell.textContent = value || "—";
        row.appendChild(cell);
    }

    /* =====================================================
       ACTION AND MODULE LABELS
    ===================================================== */

    function formatAction(action) {
        if (!action) return "Activity";

        return String(action)
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function getActionClass(action) {
        const value = String(action || "").toLowerCase();

        if (/create|insert|added/.test(value)) return "create";
        if (/payment|paid/.test(value)) return "payment";
        if (/update|edit|change/.test(value)) return "update";
        if (/delete|remove/.test(value)) return "delete";
        if (/refund/.test(value)) return "refund";
        if (/cancel/.test(value)) return "cancel";
        if (/login/.test(value)) return "login";
        if (/logout/.test(value)) return "logout";

        return "update";
    }

    function formatModule(module) {
        if (!module) return "General";

        const labels = {
            bookings: "Bookings",
            booking_passengers: "Booking Passengers",
            ticket_sales: "Ticket Sales",
            sale_passengers: "Sale Passengers",
            customers: "Customers",
            customer_payments: "Customer Payments",
            agencies: "Agencies",
            agency_payments: "Agency Payments",
            agency_transactions: "Agency Transactions",
            expenses: "Expenses",
            cash_accounts: "Cash & Bank",
            cash_transactions: "Cash Transactions",
            refunds: "Refunds",
            ticket_changes: "Ticket Changes",
            profiles: "Staff",
            staff: "Staff",
            settings: "Settings"
        };

        return labels[module] ||
            String(module).replace(/_/g, " ");
    }

    function describeLog(log) {
        return `${formatAction(log.action)} in ${formatModule(log.table_name)}`;
    }

    /* =====================================================
       DETAILS MODAL
    ===================================================== */

    function initializeAuditModal() {
        $("audit-modal-close")
            ?.addEventListener("click", closeAuditModal);

        $("audit-modal-close-button")
            ?.addEventListener("click", closeAuditModal);

        $("audit-modal-overlay")
            ?.addEventListener("click", closeAuditModal);

        document.addEventListener("keydown", event => {
            const modal = $("audit-details-modal");

            if (
                event.key === "Escape" &&
                modal &&
                !modal.hidden
            ) {
                closeAuditModal();
            }
        });
    }

    function openAuditModal(log) {
        if (!log) return;

        setDetail("detail-audit-id", log.id);
        setDetail("detail-audit-user", log.user_name);
        setDetail("detail-audit-action", formatAction(log.action));
        setDetail("detail-audit-module", formatModule(log.table_name));
        setDetail("detail-audit-record", log.record_id);
        setDetail("detail-audit-date", formatAuditDate(log.created_at));
        setDetail("detail-audit-description", describeLog(log));

        const changes = {
            old_data: log.old_data,
            new_data: log.new_data,
            ip_address: log.ip_address,
            user_agent: log.user_agent
        };

        const changesElement = $("detail-audit-changes");

        if (changesElement) {
            changesElement.textContent =
                JSON.stringify(changes, null, 2);
        }

        const modal = $("audit-details-modal");

        if (!modal) return;

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        $("audit-modal-close")?.focus();
    }

    function setDetail(id, value) {
        const element = $(id);

        if (!element) return;

        element.textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);
    }

    function closeAuditModal() {
        const modal = $("audit-details-modal");

        if (!modal) return;

        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";
    }

    /* =====================================================
       FILTERS
    ===================================================== */

    function applyAuditFilters() {
        const search = ($("audit-search")?.value || "").trim();

        const dateFrom = $("audit-date-from")?.value || "";
        const dateTo = $("audit-date-to")?.value || "";

        if (search.length > 150) {
            showAuditMessage(
                "Search text cannot exceed 150 characters.",
                "warning"
            );
            return;
        }

        if (dateFrom && dateTo && dateFrom > dateTo) {
            showAuditMessage(
                "Date From cannot be later than Date To.",
                "warning"
            );
            return;
        }

        filters = {
            search,
            module: $("audit-module-filter")?.value || "",
            action: $("audit-action-filter")?.value || "",
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
        };

        currentPage = 1;

        hideAuditMessage();
        loadAuditLogs();
    }

    function resetAuditFilters() {
        [
            "audit-search",
            "audit-module-filter",
            "audit-action-filter",
            "audit-date-from",
            "audit-date-to"
        ].forEach(id => {
            if ($(id)) $(id).value = "";
        });

        filters = {
            search: "",
            module: "",
            action: "",
            dateFrom: null,
            dateTo: null
        };

        currentPage = 1;

        hideAuditMessage();
        loadAuditLogs();
    }

    /* =====================================================
       PAGINATION
    ===================================================== */

    function updatePagination() {
        if ($("audit-page-info")) {
            $("audit-page-info").textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if ($("audit-previous-page")) {
            $("audit-previous-page").disabled =
                currentPage <= 1;
        }

        if ($("audit-next-page")) {
            $("audit-next-page").disabled =
                currentPage >= totalPages;
        }
    }

    function previousPage() {
        if (currentPage <= 1 || isLoading) return;

        currentPage--;
        loadAuditLogs();
    }

    function nextPage() {
        if (currentPage >= totalPages || isLoading) return;

        currentPage++;
        loadAuditLogs();
    }

    /* =====================================================
       REFRESH
    ===================================================== */

    async function refreshAuditLogs() {
        if (isLoading) return;

        currentPage = 1;

        await Promise.all([
            loadAuditSummary(),
            loadAuditLogs()
        ]);

        showAuditMessage(
            "Audit Logs refreshed.",
            "success"
        );
    }

    /* =====================================================
       DATE AND TIME
    ===================================================== */

    function formatAuditDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-BD", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Dhaka"
        }).format(date);
    }

    function getDhakaDateString(date) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Dhaka",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);

        const values = {};

        parts.forEach(part => {
            values[part.type] = part.value;
        });

        return `${values.year}-${values.month}-${values.day}`;
    }

    /* =====================================================
       MESSAGES
    ===================================================== */

    function showAuditMessage(message, type = "info") {
        const element = $("audit-message");

        if (!element) return;

        element.textContent = message;
        element.className = `alert alert-${type}`;
        element.hidden = false;
    }

    function hideAuditMessage() {
        const element = $("audit-message");

        if (!element) return;

        element.hidden = true;
        element.textContent = "";
    }

})();
