
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   FILE: js/reports.js

   Reports Module
   Supabase Edge Function Integration
   Responsive UI | Role-Based Access | CSV Export
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const PAGE_SIZE = 10;
    const FUNCTION_NAME = "get-business-reports";

    const ALLOWED_ROLES = [
        "owner",
        "manager",
        "ticket_staff",
        "accounts_staff"
    ];

    const PROFIT_ROLES = [
        "owner",
        "manager"
    ];

    const REPORT_MAP = {
        "#sales-report": "sales",
        "#booking-report": "bookings",
        "#customer-report": "customer_due",
        "#agency-report": "agency_payable",
        "#expense-report": "expenses",
        "#cash-report": "cash_bank",
        "#profit-loss-report": "profit_loss"
    };

    /* =====================================================
       STATE
    ===================================================== */

    let supabase = null;
    let currentRole = null;
    let currentUser = null;

    let currentPage = 1;
    let totalPages = 1;

    let currentReport = null;
    let currentRows = [];
    let currentColumns = [];

    let isLoading = false;
    let initialized = false;

    /* =====================================================
       DOM ELEMENTS
    ===================================================== */

    const $ = id => document.getElementById(id);

    const elements = {};

    function cacheElements() {
        elements.message = $("reports-message");

        elements.dateFrom = $("report-date-from");
        elements.dateTo = $("report-date-to");
        elements.reportType = $("report-type");

        elements.generate = $("generate-report-button");
        elements.reset = $("reset-report-filters");
        elements.print = $("print-reports-button");
        elements.export = $("export-reports-button");

        elements.totalSales = $("report-total-sales");
        elements.totalReceived = $("report-total-received");
        elements.customerDue = $("report-customer-due");
        elements.agencyPayable = $("report-agency-payable");

        elements.results = $("report-results");
        elements.resultsTitle = $("report-results-title");
        elements.resultsSubtitle = $("report-results-subtitle");

        elements.tableHead = $("report-table-head");
        elements.tableBody = $("report-table-body");

        elements.recordCount = $("report-record-count");
        elements.previous = $("report-previous-page");
        elements.next = $("report-next-page");
        elements.pageInfo = $("report-page-info");
    }

    /* =====================================================
       START
    ===================================================== */

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        if (initialized) return;

        initialized = true;

        cacheElements();

        try {
            setMessage("Initializing reports...", "info");

            if (!window.AuthManager) {
                throw new Error(
                    "Authentication service unavailable."
                );
            }

            await window.AuthManager.initialize();

            const session =
                await window.AuthManager.checkSession();

            if (!session || !session.user) {
                return;
            }

            currentUser = session.user;

            supabase = window.supabaseClient;

            if (!supabase) {
                throw new Error(
                    "Supabase connection unavailable."
                );
            }

            const validProfile =
                await verifyProfile(currentUser);

            if (!validProfile) {
                return;
            }

            bindEvents();
            setDefaultDates();
            setInitialTable();
            clearSummary();
            configureRoleAccess();

            setMessage(
                "Select your filters and generate a report.",
                "info"
            );

            await generateReport();

        } catch (error) {
            console.error(
                "Reports initialization error:",
                error
            );

            setMessage(
                error.message ||
                "Unable to initialize reports.",
                "error"
            );
        }
    }

    /* =====================================================
       PROFILE VALIDATION
    ===================================================== */

    async function verifyProfile(user) {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data || data.is_active !== true) {
            setMessage(
                "Your account is inactive or unavailable.",
                "error"
            );

            await window.AuthManager.logout();

            return false;
        }

        currentRole = String(data.role || "")
            .toLowerCase();

        if (!ALLOWED_ROLES.includes(currentRole)) {
            throw new Error(
                "You do not have permission to view reports."
            );
        }

        const name =
            data.full_name ||
            user.email ||
            "User";

        updateUserInformation(name, currentRole);

        return true;
    }

    function updateUserInformation(name, role) {
        const nameElement = $("user-name");
        const roleElement = $("user-role");
        const avatarElement = $("user-avatar");

        if (nameElement) {
            nameElement.textContent = name;
        }

        if (roleElement) {
            roleElement.textContent = formatRole(role);
        }

        if (avatarElement) {
            avatarElement.textContent = getInitials(name);
        }
    }

    function formatRole(role) {
        const labels = {
            owner: "Owner",
            manager: "Manager",
            ticket_staff: "Ticket Staff",
            accounts_staff: "Accounts Staff"
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
       ROLE-BASED ACCESS
    ===================================================== */

    function canViewProfit() {
        return PROFIT_ROLES.includes(currentRole);
    }

    function configureRoleAccess() {
        const allowed = canViewProfit();

        const profitCard = document.querySelector(
            ".financial-report-card"
        );

        if (profitCard) {
            profitCard.hidden = !allowed;
        }

        const profitOption =
            elements.reportType?.querySelector(
                'option[value="profit_loss"]'
            );

        if (profitOption) {
            profitOption.disabled = !allowed;
        }

        document.querySelectorAll(
            '[data-financial-role="owner-manager"]'
        ).forEach(element => {
            element.hidden = !allowed;
        });
    }

    /* =====================================================
       EVENT BINDING
    ===================================================== */

    function bindEvents() {
        elements.generate?.addEventListener(
            "click",
            function () {
                currentPage = 1;
                generateReport();
            }
        );

        elements.reset?.addEventListener(
            "click",
            resetFilters
        );

        elements.previous?.addEventListener(
            "click",
            function () {
                if (isLoading || currentPage <= 1) {
                    return;
                }

                currentPage--;
                generateReport();
            }
        );

        elements.next?.addEventListener(
            "click",
            function () {
                if (
                    isLoading ||
                    currentPage >= totalPages
                ) {
                    return;
                }

                currentPage++;
                generateReport();
            }
        );

        elements.print?.addEventListener(
            "click",
            printReport
        );

        elements.export?.addEventListener(
            "click",
            exportCSV
        );

        bindReportCards();
    }

    /* =====================================================
       REPORT CARD NAVIGATION
    ===================================================== */

    function bindReportCards() {
        document.querySelectorAll(
            ".reports-content a[href^='#']"
        ).forEach(link => {

            link.addEventListener("click", function (event) {
                const href = link.getAttribute("href");
                const reportType = REPORT_MAP[href];

                if (!reportType) return;

                event.preventDefault();

                if (
                    reportType === "profit_loss" &&
                    !canViewProfit()
                ) {
                    setMessage(
                        "You are not authorized to view Profit & Loss.",
                        "error"
                    );

                    return;
                }

                if (elements.reportType) {
                    elements.reportType.value = reportType;
                }

                currentPage = 1;

                generateReport();

                elements.results?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });

        });
    }

    /* =====================================================
       DEFAULT DATE RANGE
    ===================================================== */

    function setDefaultDates() {
        const today = getDhakaToday();

        const [year, month] = today
            .split("-")
            .map(Number);

        const firstDay =
            `${year}-${String(month).padStart(2, "0")}-01`;

        if (elements.dateFrom) {
            elements.dateFrom.value = firstDay;
        }

        if (elements.dateTo) {
            elements.dateTo.value = today;
        }
    }

    function getDhakaToday() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Dhaka",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());

        const result = {};

        parts.forEach(part => {
            result[part.type] = part.value;
        });

        return (
            `${result.year}-${result.month}-${result.day}`
        );
    }

    /* =====================================================
       GENERATE REPORT
    ===================================================== */

    async function generateReport() {
        if (!supabase || isLoading) return;

        const dateFrom =
            elements.dateFrom?.value || "";

        const dateTo =
            elements.dateTo?.value || "";

        const reportType =
            elements.reportType?.value || "all";

        if (
            dateFrom &&
            dateTo &&
            dateFrom > dateTo
        ) {
            setMessage(
                "Date From cannot be later than Date To.",
                "error"
            );

            return;
        }

        if (
            reportType === "profit_loss" &&
            !canViewProfit()
        ) {
            setMessage(
                "Profit & Loss access is restricted.",
                "error"
            );

            return;
        }

        if (reportType === "all" && !canViewProfit()) {
            // The backend must also enforce role-based
            // filtering for the "all" report.
        }

        isLoading = true;

        setLoading(true);

        setMessage(
            "Generating report...",
            "info"
        );

        try {
            const { data, error } =
                await supabase.functions.invoke(
                    FUNCTION_NAME,
                    {
                        body: {
                            date_from: dateFrom || null,
                            date_to: dateTo || null,
                            report_type: reportType,
                            page: currentPage,
                            page_size: PAGE_SIZE
                        }
                    }
                );

            if (error) {
                throw new Error(
                    error.message ||
                    "Unable to generate report."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message ||
                    "Report generation failed."
                );
            }

            if (
                data.role &&
                data.role !== currentRole
            ) {
                throw new Error(
                    "Report access verification failed."
                );
            }

            renderReport(data);

            setMessage(
                "Report generated successfully.",
                "success"
            );

        } catch (error) {
            console.error(
                "Report generation error:",
                error
            );

            clearReportResults();

            setMessage(
                error.message ||
                "Unable to generate report.",
                "error"
            );

        } finally {
            isLoading = false;
            setLoading(false);
        }
    }

    /* =====================================================
       RENDER REPORT
    ===================================================== */

    function renderReport(data) {
        currentReport = data.report || {};

        currentRows = Array.isArray(currentReport.rows)
            ? currentReport.rows
            : [];

        currentColumns = Array.isArray(currentReport.columns)
            ? currentReport.columns
            : [];

        const summary = data.summary || {};
        const pagination = data.pagination || {};

        renderSummary(summary);

        setText(
            elements.resultsTitle,
            currentReport.title || "Report Results"
        );

        setText(
            elements.resultsSubtitle,
            currentReport.subtitle ||
            "Generated report data"
        );

        currentPage = Math.max(
            1,
            Number(pagination.page) || currentPage
        );

        totalPages = Math.max(
            1,
            Number(pagination.total_pages) || 1
        );

        renderTable();
        updatePagination(pagination);

        if (elements.export) {
            elements.export.disabled =
                currentRows.length === 0 ||
                currentColumns.length === 0;
        }

        if (elements.print) {
            elements.print.disabled =
                currentColumns.length === 0;
        }
    }

    /* =====================================================
       SUMMARY CARDS
    ===================================================== */

    function renderSummary(summary) {
        setText(
            elements.totalSales,
            formatMoney(summary.total_sales)
        );

        setText(
            elements.totalReceived,
            formatMoney(summary.total_received)
        );

        setText(
            elements.customerDue,
            formatMoney(summary.customer_due)
        );

        setText(
            elements.agencyPayable,
            formatMoney(summary.agency_payable)
        );
    }

    function clearSummary() {
        setText(
            elements.totalSales,
            formatMoney(0)
        );

        setText(
            elements.totalReceived,
            formatMoney(0)
        );

        setText(
            elements.customerDue,
            formatMoney(0)
        );

        setText(
            elements.agencyPayable,
            formatMoney(0)
        );
    }

    /* =====================================================
       TABLE RENDERING
    ===================================================== */

    function renderTable() {
        if (!elements.tableHead || !elements.tableBody) {
            return;
        }

        elements.tableHead.replaceChildren();
        elements.tableBody.replaceChildren();

        const headerRow = document.createElement("tr");

        currentColumns.forEach(column => {
            const th = document.createElement("th");

            th.textContent =
                column.label ||
                column.key ||
                "";

            headerRow.appendChild(th);
        });

        if (currentColumns.length) {
            elements.tableHead.appendChild(headerRow);
        }

        if (!currentRows.length) {
            renderEmptyTable(
                "No report records found.",
                currentColumns.length
            );

            return;
        }

        currentRows.forEach(row => {
            const tr = document.createElement("tr");

            currentColumns.forEach(column => {
                const td = document.createElement("td");

                td.textContent = formatCellValue(
                    row[column.key],
                    column.type
                );

                tr.appendChild(td);
            });

            elements.tableBody.appendChild(tr);
        });
    }

    function renderEmptyTable(message, columnCount = 1) {
        if (!elements.tableBody) return;

        elements.tableBody.replaceChildren();

        const tr = document.createElement("tr");
        const td = document.createElement("td");

        td.colSpan = Math.max(
            Number(columnCount) || 1,
            1
        );

        td.textContent = message;
        td.className = "empty-state";

        tr.appendChild(td);
        elements.tableBody.appendChild(tr);
    }

    function formatCellValue(value, type) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        if (type === "currency") {
            return formatMoney(value);
        }

        if (type === "date") {
            return formatDisplayDate(value);
        }

        if (typeof value === "boolean") {
            return value ? "Yes" : "No";
        }

        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        return String(value);
    }

    function formatDisplayDate(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeZone: "Asia/Dhaka"
        }).format(date);
    }

    /* =====================================================
       PAGINATION
    ===================================================== */

    function updatePagination(pagination) {
        const totalCount = Math.max(
            0,
            Number(pagination.total_count) || 0
        );

        totalPages = Math.max(
            1,
            Number(pagination.total_pages) || 1
        );

        setText(
            elements.recordCount,
            `${totalCount.toLocaleString("en-US")} records`
        );

        setText(
            elements.pageInfo,
            `Page ${currentPage} of ${totalPages}`
        );

        if (elements.previous) {
            elements.previous.disabled =
                isLoading || currentPage <= 1;
        }

        if (elements.next) {
            elements.next.disabled =
                isLoading ||
                currentPage >= totalPages;
        }
    }

    /* =====================================================
       CSV EXPORT
       Exports the currently displayed page.
    ===================================================== */

    function exportCSV() {
        if (
            !currentRows.length ||
            !currentColumns.length
        ) {
            setMessage(
                "There is no report data to export.",
                "warning"
            );

            return;
        }

        const rows = [
            currentColumns.map(column =>
                column.label || column.key
            ),

            ...currentRows.map(row =>
                currentColumns.map(column =>
                    safeCSVValue(row[column.key])
                )
            )
        ];

        const csv = rows
            .map(row =>
                row.map(escapeCSV).join(",")
            )
            .join("\r\n");

        const blob = new Blob(
            ["\uFEFF" + csv],
            {
                type: "text/csv;charset=utf-8;"
            }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;

        link.download =
            `air-agency-${getSafeReportName()}-${getDhakaToday()}.csv`;

        document.body.appendChild(link);

        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        setMessage(
            "Current report page exported successfully.",
            "success"
        );
    }

    function getSafeReportName() {
        const value =
            elements.reportType?.value || "report";

        return value.replace(/[^a-z0-9_-]/gi, "-");
    }

    function safeCSVValue(value) {
        if (value === null || value === undefined) {
            return "";
        }

        const text = String(value);

        // Prevent spreadsheet formula injection.
        if (/^[\s]*[=+\-@\t\r]/.test(text)) {
            return "'" + text;
        }

        return text;
    }

    function escapeCSV(value) {
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    /* =====================================================
       PRINT
    ===================================================== */

    function printReport() {
        if (
            !currentReport ||
            !currentColumns.length
        ) {
            setMessage(
                "Generate a report before printing.",
                "warning"
            );

            return;
        }

        window.print();
    }

    /* =====================================================
       RESET FILTERS
    ===================================================== */

    function resetFilters() {
        if (isLoading) return;

        setDefaultDates();

        if (elements.reportType) {
            elements.reportType.value = "all";
        }

        currentPage = 1;

        currentReport = null;
        currentRows = [];
        currentColumns = [];

        clearSummary();
        setInitialTable();

        setMessage(
            "Filters have been reset. Generate a report to continue.",
            "info"
        );
    }

    /* =====================================================
       CLEAR REPORT RESULTS
    ===================================================== */

    function clearReportResults() {
        currentReport = null;
        currentRows = [];
        currentColumns = [];

        totalPages = 1;
        currentPage = 1;

        clearSummary();

        setInitialTable();

        if (elements.resultsTitle) {
            elements.resultsTitle.textContent =
                "Report Results";
        }

        if (elements.resultsSubtitle) {
            elements.resultsSubtitle.textContent =
                "No report data available.";
        }
    }

    /* =====================================================
       INITIAL TABLE
    ===================================================== */

    function setInitialTable() {
        if (elements.tableHead) {
            elements.tableHead.replaceChildren();
        }

        renderEmptyTable(
            "Generate a report to view records.",
            10
        );

        setText(
            elements.recordCount,
            "0 records"
        );

        setText(
            elements.pageInfo,
            "Page 1 of 1"
        );

        if (elements.previous) {
            elements.previous.disabled = true;
        }

        if (elements.next) {
            elements.next.disabled = true;
        }

        if (elements.export) {
            elements.export.disabled = true;
        }

        if (elements.print) {
            elements.print.disabled = true;
        }
    }

    /* =====================================================
       LOADING STATE
    ===================================================== */

    function setLoading(loading) {
        if (elements.generate) {
            elements.generate.disabled = loading;

            elements.generate.textContent = loading
                ? "Generating..."
                : "Generate Report";
        }

        if (elements.reset) {
            elements.reset.disabled = loading;
        }

        if (elements.reportType) {
            elements.reportType.disabled = loading;
        }

        if (elements.dateFrom) {
            elements.dateFrom.disabled = loading;
        }

        if (elements.dateTo) {
            elements.dateTo.disabled = loading;
        }

        if (elements.export && loading) {
            elements.export.disabled = true;
        }

        if (elements.previous) {
            elements.previous.disabled =
                loading || currentPage <= 1;
        }

        if (elements.next) {
            elements.next.disabled =
                loading || currentPage >= totalPages;
        }
    }

    /* =====================================================
       MESSAGE
    ===================================================== */

    function setMessage(message, type = "info") {
        if (!elements.message) return;

        elements.message.textContent = message;

        elements.message.className =
            `reports-message alert alert-${type}`;

        elements.message.hidden = false;
    }

    /* =====================================================
       GENERAL HELPERS
    ===================================================== */

    function formatMoney(value) {
        const amount = Number(value);

        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(
            Number.isFinite(amount) ? amount : 0
        );
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

})();
