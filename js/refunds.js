/* refunds.js - Air Ticket Agency Management */

/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   REFUNDS & TICKET CHANGES
   Refund Page Controller
========================================================= */

"use strict";

(function () {

    const PAGE_SIZE = 10;
    const MAX_REFUND_RECORDS = 1000;

    const ALLOWED_ROLES = [
        "owner",
        "manager",
        "ticket_staff"
    ];

    let supabase = null;
    let currentProfile = null;

    let refundRecords = [];
    let filteredRefunds = [];
    let selectedTickets = [];

    let currentPage = 1;
    let messageTimer = null;
    let isSubmitting = false;

    const $ = (id) => document.getElementById(id);

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    document.addEventListener("DOMContentLoaded", initializeRefunds);

    async function initializeRefunds() {

        // Bind the form open/close buttons immediately so a click always
        // gives feedback, even before login/profile loading finishes.
        $("show-refund-form-button")
            ?.addEventListener("click", showRefundForm);

        $("cancel-refund-form-button")
            ?.addEventListener("click", hideRefundForm);

        try {

            if (!window.AuthManager) {
                throw new Error("Authentication controller is unavailable.");
            }

            await window.AuthManager.initialize();

            const session = await window.AuthManager.checkSession();

            if (!session || !session.user) {
                return;
            }

            supabase = window.supabaseClient;

            if (!supabase) {
                throw new Error("Supabase client is unavailable.");
            }

            await loadCurrentProfile(session.user);

            initializeRefundEvents();

            await Promise.all([
                loadRefundAccounts(),
                loadRefundHistory()
            ]);

        } catch (error) {

            console.error("Refund initialization error:", error);

            showMessage(
                error.message || "Unable to initialize Refund Management.",
                "error"
            );
        }
    }

    /* =====================================================
       USER PROFILE AND PERMISSIONS
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

        const name =
            data.full_name ||
            user.user_metadata?.full_name ||
            user.email ||
            "User";

        if ($("user-name")) {
            $("user-name").textContent = name;
        }

        if ($("user-role")) {
            $("user-role").textContent = formatRole(data.role);
        }

        if ($("user-avatar")) {
            $("user-avatar").textContent = getInitials(name);
        }

        document.body.dataset.userRole = data.role;

        const canProcess = ALLOWED_ROLES.includes(data.role);

        if ($("show-refund-form-button")) {
            $("show-refund-form-button").hidden = !canProcess;
        }

        if (!canProcess) {
            showMessage(
                "Your role does not have permission to process refunds.",
                "warning"
            );
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
       EVENTS
    ===================================================== */

    function initializeRefundEvents() {

        $("refund-form")
            ?.addEventListener("submit", handleRefundSubmit);

        $("refund-sale-search")
            ?.addEventListener("input", handleTicketSearch);

        $("refund-ticket")
            ?.addEventListener("change", handleTicketSelection);

        $("refund-type")
            ?.addEventListener("change", handleRefundTypeChange);

        $("refund-search-button")
            ?.addEventListener("click", applyRefundFilters);

        $("refund-reset-button")
            ?.addEventListener("click", resetRefundFilters);

        $("refund-refresh-button")
            ?.addEventListener("click", loadRefundHistory);

        $("refund-history-search")
            ?.addEventListener("keydown", handleSearchEnter);

        $("refund-history-type")
            ?.addEventListener("change", applyRefundFilters);

        $("refund-date-from")
            ?.addEventListener("change", applyRefundFilters);

        $("refund-date-to")
            ?.addEventListener("change", applyRefundFilters);

        $("refund-previous-page")
            ?.addEventListener("click", previousPage);

        $("refund-next-page")
            ?.addEventListener("click", nextPage);
    }

    function handleSearchEnter(event) {

        if (event.key === "Enter") {
            event.preventDefault();
            applyRefundFilters();
        }
    }

    /* =====================================================
       MESSAGE
    ===================================================== */

    function showMessage(message, type = "success") {

        const element = $("refunds-message");

        if (!element) return;

        clearTimeout(messageTimer);

        element.textContent = message;
        element.className = `refunds-message ${type}`;

        messageTimer = setTimeout(() => {
            element.className = "refunds-message";
            element.textContent = "";
        }, 6000);
    }

    /* =====================================================
       REFUND FORM VISIBILITY
    ===================================================== */

    function showRefundForm() {

        if (!currentProfile) {
            showMessage(
                "Please sign in first. The refund form opens after login and a successful Supabase connection.",
                "warning"
            );
            return;
        }

        if (!ALLOWED_ROLES.includes(currentProfile.role)) {
            showMessage("You do not have permission to process refunds.", "error");
            return;
        }

        const formCard = $("refund-form-card");

        if (!formCard) return;

        formCard.hidden = false;

        formCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function hideRefundForm() {

        const formCard = $("refund-form-card");

        if (formCard) {
            formCard.hidden = true;
        }

        $("refund-form")?.reset();

        resetTicketSelection();
    }

    /* =====================================================
       LOAD CASH / BANK ACCOUNTS
    ===================================================== */

    async function loadRefundAccounts() {

        const select = $("refund-account");

        if (!select) return;

        select.innerHTML = '<option value="">Loading accounts...</option>';

        const { data, error } = await supabase
            .from("cash_accounts")
            .select("id, account_name, account_type, bank_name, account_number")
            .eq("is_active", true)
            .order("account_name", { ascending: true });

        if (error) {

            console.error("Account loading error:", error);

            select.innerHTML =
                '<option value="">Unable to load accounts</option>';

            return;
        }

        select.innerHTML = '<option value="">Select payment account</option>';

        (data || []).forEach(account => {

            const option = document.createElement("option");

            option.value = account.id;

            let label = account.account_name;

            if (account.account_type) {
                label += ` (${formatAccountType(account.account_type)})`;
            }

            if (account.bank_name) {
                label += ` - ${account.bank_name}`;
            }

            if (account.account_number) {
                label += ` / ${account.account_number}`;
            }

            option.textContent = label;

            select.appendChild(option);
        });

        if (!data || data.length === 0) {
            select.innerHTML =
                '<option value="">No active accounts found</option>';
        }
    }

    function formatAccountType(type) {

        const labels = {
            cash: "Cash",
            bank: "Bank",
            mobile_banking: "Mobile Banking"
        };

        return labels[type] || type;
    }

    /* =====================================================
       TICKET SEARCH
    ===================================================== */

    async function handleTicketSearch() {

        const input = $("refund-sale-search");
        const select = $("refund-ticket");

        if (!input || !select) return;

        const term = input.value.trim();

        if (term.length < 2) {

            selectedTickets = [];

            select.innerHTML =
                '<option value="">Enter at least 2 characters</option>';

            return;
        }

        select.innerHTML =
            '<option value="">Searching tickets...</option>';

        try {

            const safeTerm = term.replace(/[,%()\\]/g, " ").trim();

            const { data, error } = await supabase
                .from("sale_passengers")
                .select(`
                    id,
                    sale_id,
                    passenger_name,
                    ticket_number,
                    pnr,
                    airline,
                    origin,
                    destination,
                    departure_at,
                    selling_price,
                    ticket_status
                `)
                .or(
                    `passenger_name.ilike.%${safeTerm}%,ticket_number.ilike.%${safeTerm}%,pnr.ilike.%${safeTerm}%`
                )
                .neq("ticket_status", "cancelled")
                .neq("ticket_status", "refunded")
                .order("created_at", { ascending: false })
                .limit(30);

            if (error) throw error;

            if (!data || data.length === 0) {

                selectedTickets = [];

                select.innerHTML =
                    '<option value="">No matching tickets found</option>';

                return;
            }

            const saleIds = [
                ...new Set(data.map(ticket => ticket.sale_id))
            ];

            const { data: sales, error: saleError } = await supabase
                .from("ticket_sales")
                .select("id, sale_reference, sale_date, customer_id, sale_status")
                .in("id", saleIds);

            if (saleError) throw saleError;

            const saleMap = new Map(
                (sales || []).map(sale => [sale.id, sale])
            );

            selectedTickets = data
                .filter(ticket => saleMap.has(ticket.sale_id))
                .map(ticket => ({
                    ...ticket,
                    sale: saleMap.get(ticket.sale_id)
                }));

            select.innerHTML =
                '<option value="">Select a ticket</option>';

            selectedTickets.forEach(ticket => {

                const option = document.createElement("option");

                option.value = ticket.id;

                const ticketNumber =
                    ticket.ticket_number || "No ticket number";

                const pnr =
                    ticket.pnr || "No PNR";

                option.textContent =
                    `${ticket.passenger_name} | ${ticketNumber} | ${pnr} | ${ticket.sale.sale_reference}`;

                select.appendChild(option);
            });

            if (selectedTickets.length === 0) {

                select.innerHTML =
                    '<option value="">No eligible tickets found</option>';
            }

        } catch (error) {

            console.error("Ticket search error:", error);

            select.innerHTML =
                '<option value="">Ticket search failed</option>';

            showMessage(
                error.message || "Unable to search tickets.",
                "error"
            );
        }
    }

    /* =====================================================
       TICKET SELECTION
    ===================================================== */

    function handleTicketSelection() {

        const ticketId = $("refund-ticket")?.value;

        const ticket = selectedTickets.find(
            item => item.id === ticketId
        );

        if (!ticket) {
            resetTicketSelection();
            return;
        }

        const sellingPrice = Number(ticket.selling_price || 0);

        const previousRefunds = refundRecords
            .filter(record =>
                record.sale_passenger_id === ticket.id &&
                record.refund_type === "customer"
            )
            .reduce(
                (total, record) => total + Number(record.refund_amount || 0),
                0
            );

        const remaining = Math.max(
            0,
            sellingPrice - previousRefunds
        );

        const amountInput = $("refund-amount");

        if (amountInput) {

            amountInput.max = remaining.toFixed(2);

            amountInput.value =
                remaining > 0 ? remaining.toFixed(2) : "";

            amountInput.placeholder =
                `Maximum refundable: ${formatMoney(remaining)}`;
        }

        if (remaining <= 0) {

            showMessage(
                "This ticket has no remaining customer-refundable amount.",
                "warning"
            );

        } else {

            showMessage(
                `Ticket selected. Remaining customer-refundable amount: ${formatMoney(remaining)}.`,
                "success"
            );
        }
    }

    function resetTicketSelection() {

        const amountInput = $("refund-amount");

        if (amountInput) {
            amountInput.value = "";
            amountInput.removeAttribute("max");
            amountInput.placeholder = "Enter refund amount";
        }
    }

    /* =====================================================
       REFUND CATEGORY SAFETY
    ===================================================== */

    function handleRefundTypeChange() {

        const type = $("refund-type")?.value;

        if (type === "agency" || type === "other") {

            showMessage(
                "Agency Refund and Other Refund are temporarily disabled. The current database function records every category as a cash outflow and updates ticket refund status. Backend accounting rules must be corrected first.",
                "warning"
            );

            return;
        }

        if (type === "customer") {

            showMessage(
                "Customer Refund selected.",
                "success"
            );

            handleTicketSelection();
        }
    }

    /* =====================================================
       SUBMIT REFUND
    ===================================================== */

    async function handleRefundSubmit(event) {

        event.preventDefault();

        if (isSubmitting) return;

        if (!currentProfile ||
            !ALLOWED_ROLES.includes(currentProfile.role)) {

            showMessage(
                "You do not have permission to process refunds.",
                "error"
            );

            return;
        }

        const ticketId = $("refund-ticket")?.value;
        const refundType = $("refund-type")?.value;
        const amount = Number($("refund-amount")?.value);
        const accountId = $("refund-account")?.value;
        const reason = $("refund-reason")?.value.trim();
        const reference = $("refund-reference")?.value.trim() || null;
        const notes = $("refund-notes")?.value.trim() || null;

        const ticket = selectedTickets.find(
            item => item.id === ticketId
        );

        if (!ticket) {
            showMessage("Please search and select a valid ticket.", "error");
            return;
        }

        if (refundType !== "customer") {

            showMessage(
                "Only Customer Refund can currently be submitted safely. Agency and Other Refund require corrected backend accounting.",
                "error"
            );

            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {

            showMessage(
                "Please enter a valid refund amount.",
                "error"
            );

            return;
        }

        if (!accountId) {

            showMessage(
                "Please select a refund payment account.",
                "error"
            );

            return;
        }

        if (reason.length < 3 || reason.length > 500) {

            showMessage(
                "Refund reason must contain 3 to 500 characters.",
                "error"
            );

            return;
        }

        if (reference && reference.length > 100) {

            showMessage(
                "Reference number cannot exceed 100 characters.",
                "error"
            );

            return;
        }

        if (notes && notes.length > 2000) {

            showMessage(
                "Notes cannot exceed 2000 characters.",
                "error"
            );

            return;
        }

        const previousRefunds = refundRecords
            .filter(record =>
                record.sale_passenger_id === ticket.id &&
                record.refund_type === "customer"
            )
            .reduce(
                (total, record) => total + Number(record.refund_amount || 0),
                0
            );

        const sellingPrice = Number(ticket.selling_price || 0);

        const remaining = sellingPrice - previousRefunds;

        if (amount > remaining + 0.001) {

            showMessage(
                `Refund amount exceeds the remaining refundable amount of ${formatMoney(remaining)}.`,
                "error"
            );

            return;
        }

        const submitButton = $("submit-refund-button");

        isSubmitting = true;

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Processing...";
        }

        try {

            const { data, error } = await supabase.functions.invoke(
                "record-refund",
                {
                    body: {
                        sale_passenger_id: ticket.id,
                        refund_amount: amount,
                        refund_type: refundType,
                        reason: reason,
                        reference: reference,
                        notes: notes,
                        account_id: accountId
                    }
                }
            );

            if (error) {

                let message = error.message;

                if (error.context &&
                    typeof error.context.json === "function") {

                    try {
                        const body = await error.context.json();

                        message = body.message || message;

                    } catch (_) {
                        // Keep original error message.
                    }
                }

                throw new Error(message || "Refund processing failed.");
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Refund could not be processed."
                );
            }

            showMessage(
                data.message || "Refund recorded successfully.",
                "success"
            );

            $("refund-form")?.reset();

            resetTicketSelection();

            selectedTickets = [];

            if ($("refund-ticket")) {
                $("refund-ticket").innerHTML =
                    '<option value="">Search and select a ticket</option>';
            }

            if ($("refund-form-card")) {
                $("refund-form-card").hidden = true;
            }

            await loadRefundHistory();

        } catch (error) {

            console.error("Refund submission error:", error);

            showMessage(
                error.message || "Refund could not be processed.",
                "error"
            );

        } finally {

            isSubmitting = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Process Refund";
            }
        }
    }

    /* =====================================================
       LOAD REFUND HISTORY
    ===================================================== */

    async function loadRefundHistory() {

        const tableBody = $("refunds-table-body");

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        Loading refund records...
                    </td>
                </tr>
            `;
        }

        try {

            const { data, error } = await supabase
                .from("refunds")
                .select(`
                    id,
                    sale_id,
                    sale_passenger_id,
                    refund_reference,
                    refund_amount,
                    refund_date,
                    refund_type,
                    reason,
                    notes,
                    processed_by
                `)
                .order("refund_date", { ascending: false })
                .limit(MAX_REFUND_RECORDS);

            if (error) throw error;

            const refunds = data || [];

            const passengerIds = [
                ...new Set(
                    refunds
                        .map(record => record.sale_passenger_id)
                        .filter(Boolean)
                )
            ];

            const saleIds = [
                ...new Set(
                    refunds
                        .map(record => record.sale_id)
                        .filter(Boolean)
                )
            ];

            const [passengerResult, saleResult] = await Promise.all([

                passengerIds.length
                    ? supabase
                        .from("sale_passengers")
                        .select("id, passenger_name, ticket_number, pnr, sale_id")
                        .in("id", passengerIds)
                    : Promise.resolve({ data: [], error: null }),

                saleIds.length
                    ? supabase
                        .from("ticket_sales")
                        .select("id, sale_reference, customer_id")
                        .in("id", saleIds)
                    : Promise.resolve({ data: [], error: null })
            ]);

            if (passengerResult.error) throw passengerResult.error;
            if (saleResult.error) throw saleResult.error;

            const passengerMap = new Map(
                (passengerResult.data || []).map(item => [item.id, item])
            );

            const saleMap = new Map(
                (saleResult.data || []).map(item => [item.id, item])
            );

            refundRecords = refunds.map(record => {

                const passenger =
                    passengerMap.get(record.sale_passenger_id) || {};

                const sale =
                    saleMap.get(record.sale_id) || {};

                return {
                    ...record,
                    passenger_name: passenger.passenger_name || "—",
                    ticket_number: passenger.ticket_number || "—",
                    pnr: passenger.pnr || "—",
                    sale_reference: sale.sale_reference || "—"
                };
            });

            updateRefundSummary();

            applyRefundFilters();

        } catch (error) {

            console.error("Refund history error:", error);

            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="table-empty">
                            Unable to load refund records.
                        </td>
                    </tr>
                `;
            }

            showMessage(
                error.message || "Unable to load refund history.",
                "error"
            );
        }
    }

    /* =====================================================
       SUMMARY
    ===================================================== */

    function updateRefundSummary() {

        const totalCount = refundRecords.length;

        const totalAmount = refundRecords.reduce(
            (sum, record) => sum + Number(record.refund_amount || 0),
            0
        );

        const today = getLocalDateString(new Date());

        const todayAmount = refundRecords
            .filter(record =>
                getLocalDateString(new Date(record.refund_date)) === today
            )
            .reduce(
                (sum, record) => sum + Number(record.refund_amount || 0),
                0
            );

        if ($("total-refund-count")) {
            $("total-refund-count").textContent =
                totalCount.toLocaleString("en-US");
        }

        if ($("total-refund-amount")) {
            $("total-refund-amount").textContent =
                formatMoney(totalAmount);
        }

        if ($("today-refund-amount")) {
            $("today-refund-amount").textContent =
                formatMoney(todayAmount);
        }
    }

    /* =====================================================
       FILTERS
    ===================================================== */

    function applyRefundFilters() {

        const search = (
            $("refund-history-search")?.value || ""
        ).trim().toLowerCase();

        const type = $("refund-history-type")?.value || "";

        const fromDate = $("refund-date-from")?.value || "";
        const toDate = $("refund-date-to")?.value || "";

        if (fromDate && toDate && fromDate > toDate) {

            showMessage(
                "From Date cannot be later than To Date.",
                "warning"
            );

            return;
        }

        filteredRefunds = refundRecords.filter(record => {

            const searchText = [
                record.refund_reference,
                record.passenger_name,
                record.ticket_number,
                record.pnr,
                record.sale_reference,
                record.reason
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            if (search && !searchText.includes(search)) {
                return false;
            }

            if (type && record.refund_type !== type) {
                return false;
            }

            const recordDate =
                getLocalDateString(new Date(record.refund_date));

            if (fromDate && recordDate < fromDate) {
                return false;
            }

            if (toDate && recordDate > toDate) {
                return false;
            }

            return true;
        });

        currentPage = 1;

        renderRefundTable();
    }

    function resetRefundFilters() {

        if ($("refund-history-search")) {
            $("refund-history-search").value = "";
        }

        if ($("refund-history-type")) {
            $("refund-history-type").value = "";
        }

        if ($("refund-date-from")) {
            $("refund-date-from").value = "";
        }

        if ($("refund-date-to")) {
            $("refund-date-to").value = "";
        }

        applyRefundFilters();
    }

    /* =====================================================
       TABLE RENDERING
    ===================================================== */

    function renderRefundTable() {

        const tbody = $("refunds-table-body");

        if (!tbody) return;

        const total = filteredRefunds.length;

        const totalPages = Math.max(
            1,
            Math.ceil(total / PAGE_SIZE)
        );

        currentPage = Math.min(currentPage, totalPages);

        const start = (currentPage - 1) * PAGE_SIZE;

        const pageRecords = filteredRefunds.slice(
            start,
            start + PAGE_SIZE
        );

        if ($("refund-record-count")) {
            $("refund-record-count").textContent =
                `${total.toLocaleString("en-US")} Records`;
        }

        if ($("refund-page-info")) {
            $("refund-page-info").textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if ($("refund-previous-page")) {
            $("refund-previous-page").disabled =
                currentPage <= 1;
        }

        if ($("refund-next-page")) {
            $("refund-next-page").disabled =
                currentPage >= totalPages;
        }

        if (pageRecords.length === 0) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        No refund records found.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = pageRecords.map(record => {

            return `
                <tr>
                    <td>${escapeHTML(record.refund_reference || "—")}</td>
                    <td>${escapeHTML(record.passenger_name)}</td>
                    <td>${escapeHTML(record.ticket_number)}</td>
                    <td>${escapeHTML(formatRefundType(record.refund_type))}</td>
                    <td>${escapeHTML(formatDate(record.refund_date))}</td>
                    <td>${escapeHTML(formatMoney(record.refund_amount))}</td>
                    <td>${escapeHTML(record.reason || "—")}</td>
                </tr>
            `;

        }).join("");
    }

    function previousPage() {

        if (currentPage > 1) {
            currentPage--;
            renderRefundTable();
        }
    }

    function nextPage() {

        const totalPages = Math.max(
            1,
            Math.ceil(filteredRefunds.length / PAGE_SIZE)
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderRefundTable();
        }
    }

    /* =====================================================
       FORMATTERS
    ===================================================== */

    function formatRefundType(type) {

        const labels = {
            customer: "Customer Refund",
            agency: "Agency Refund",
            other: "Other Refund"
        };

        return labels[type] || type || "—";
    }

    function formatMoney(value) {

        const amount = Number(value || 0);

        return "৳" + amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(value) {

        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getLocalDateString(date) {

        const year = date.getFullYear();

        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            date.getDate()
        ).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

})();

