/* receipts.js - Air Ticket Agency Management */

/* =========================================
   RECEIPTS PAGE
   Air Ticket Agency Management
========================================= */

(() => {
    "use strict";

    const PAGE_SIZE = 10;

    const state = {
        receipts: [],
        filteredReceipts: [],
        currentPage: 1
    };

    const elements = {
        message: document.getElementById("receipts-message"),

        totalReceipts: document.getElementById("total-receipts"),
        totalReceived: document.getElementById("total-received"),
        todayReceipts: document.getElementById("today-receipts"),

        search: document.getElementById("receipt-search"),
        method: document.getElementById("receipt-method-filter"),
        dateFrom: document.getElementById("receipt-date-from"),
        dateTo: document.getElementById("receipt-date-to"),

        searchButton: document.getElementById("receipt-search-button"),
        resetButton: document.getElementById("receipt-reset-button"),
        refreshButton: document.getElementById("receipt-refresh-button"),

        tableBody: document.getElementById("receipts-table-body"),
        count: document.getElementById("receipt-count"),

        pageInfo: document.getElementById("receipt-page-info"),
        previousPage: document.getElementById("receipt-previous-page"),
        nextPage: document.getElementById("receipt-next-page")
    };

    /* =====================================
       HELPERS
    ===================================== */

    function getSupabaseClient() {
        return window.supabaseClient || null;
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2
        }).format(Number(amount) || 0);
    }

    function formatDate(dateValue) {
        if (!dateValue) return "—";

        const date = new Date(dateValue + "T00:00:00");

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function getTodayDate() {
        const now = new Date();
        const localDate = new Date(
            now.getTime() - now.getTimezoneOffset() * 60000
        );

        return localDate.toISOString().slice(0, 10);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[character];
        });
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

    function getPaymentMethodLabel(method) {
        const labels = {
            cash: "Cash",
            bank: "Bank",
            mobile_banking: "Mobile Banking",
            card: "Card",
            other: "Other"
        };

        return labels[method] || method || "—";
    }

    function getCustomerName(receipt) {
        return receipt.customer_name ||
            receipt.customer?.full_name ||
            "Unknown Customer";
    }

    function getCustomerPhone(receipt) {
        return receipt.customer_phone ||
            receipt.customer?.phone ||
            "";
    }

    /* =====================================
       LOAD RECEIPTS
    ===================================== */

    async function loadReceipts() {
        const supabase = getSupabaseClient();

        if (!supabase) {
            showMessage(
                "Supabase client is not initialized. Please check the authentication setup.",
                "danger"
            );

            renderEmptyState("Unable to connect to the database.");
            return;
        }

        hideMessage();

        if (elements.refreshButton) {
            elements.refreshButton.disabled = true;
            elements.refreshButton.textContent = "Loading...";
        }

        if (elements.tableBody) {
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        Loading receipts...
                    </td>
                </tr>
            `;
        }

        try {
            /*
             * Use only columns defined in the proposed schema.
             * Receipt Number is displayed using payment_reference.
             * No ticket purchase price or profit is selected.
             */

            const { data: payments, error } = await supabase
                .from("customer_payments")
                .select(`
                    id,
                    customer_id,
                    payment_reference,
                    payment_date,
                    amount,
                    payment_method,
                    received_by
                `)
                .order("payment_date", { ascending: false })
                .order("id", { ascending: false })
                .limit(5000);

            if (error) throw error;

            const paymentRows = payments || [];

            const customerIds = [
                ...new Set(
                    paymentRows
                        .map(payment => payment.customer_id)
                        .filter(Boolean)
                )
            ];

            let customersById = {};

            if (customerIds.length > 0) {
                const { data: customers, error: customerError } =
                    await supabase
                        .from("customers")
                        .select("id, full_name, phone")
                        .in("id", customerIds);

                if (customerError) throw customerError;

                customersById = Object.fromEntries(
                    (customers || []).map(customer => [
                        customer.id,
                        customer
                    ])
                );
            }

            state.receipts = paymentRows.map(payment => ({
                ...payment,
                customer: customersById[payment.customer_id] || null
            }));

            applyFilters();

        } catch (error) {
            console.error("Receipt loading error:", error);

            showMessage(
                error.message || "Unable to load receipts.",
                "danger"
            );

            state.receipts = [];
            applyFilters();

        } finally {
            if (elements.refreshButton) {
                elements.refreshButton.disabled = false;
                elements.refreshButton.textContent = "Refresh";
            }
        }
    }

    /* =====================================
       FILTER RECEIPTS
    ===================================== */

    function applyFilters() {
        const searchText = (
            elements.search?.value || ""
        ).trim().toLowerCase();

        const selectedMethod =
            elements.method?.value || "all";

        const dateFrom =
            elements.dateFrom?.value || "";

        const dateTo =
            elements.dateTo?.value || "";

        state.filteredReceipts = state.receipts.filter(receipt => {

            const customerName = getCustomerName(receipt).toLowerCase();
            const customerPhone = getCustomerPhone(receipt).toLowerCase();

            const receiptNumber = String(
                receipt.payment_reference || ""
            ).toLowerCase();

            const receivedBy = String(
                receipt.received_by || ""
            ).toLowerCase();

            const matchesSearch =
                !searchText ||
                receiptNumber.includes(searchText) ||
                customerName.includes(searchText) ||
                customerPhone.includes(searchText) ||
                receivedBy.includes(searchText);

            const matchesMethod =
                selectedMethod === "all" ||
                receipt.payment_method === selectedMethod;

            const paymentDate = receipt.payment_date || "";

            const matchesDateFrom =
                !dateFrom || paymentDate >= dateFrom;

            const matchesDateTo =
                !dateTo || paymentDate <= dateTo;

            return (
                matchesSearch &&
                matchesMethod &&
                matchesDateFrom &&
                matchesDateTo
            );
        });

        state.currentPage = 1;

        updateSummary();
        renderReceipts();
    }

    /* =====================================
       SUMMARY
    ===================================== */

    function updateSummary() {
        const receipts = state.filteredReceipts;

        const totalAmount = receipts.reduce(
            (sum, receipt) => sum + Number(receipt.amount || 0),
            0
        );

        const today = getTodayDate();

        const todayCount = receipts.filter(
            receipt => receipt.payment_date === today
        ).length;

        if (elements.totalReceipts) {
            elements.totalReceipts.textContent =
                receipts.length.toLocaleString("en-BD");
        }

        if (elements.totalReceived) {
            elements.totalReceived.textContent =
                formatMoney(totalAmount);
        }

        if (elements.todayReceipts) {
            elements.todayReceipts.textContent =
                todayCount.toLocaleString("en-BD");
        }

        if (elements.count) {
            elements.count.textContent =
                `${receipts.length.toLocaleString("en-BD")} receipts`;
        }
    }

    /* =====================================
       RENDER TABLE
    ===================================== */

    function renderEmptyState(message) {
        if (!elements.tableBody) return;

        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;
    }

    function renderReceipts() {
        if (!elements.tableBody) return;

        const totalRecords = state.filteredReceipts.length;

        const totalPages = Math.max(
            1,
            Math.ceil(totalRecords / PAGE_SIZE)
        );

        if (state.currentPage > totalPages) {
            state.currentPage = totalPages;
        }

        if (totalRecords === 0) {
            renderEmptyState("No receipts found.");
            updatePagination(totalPages);
            return;
        }

        const startIndex =
            (state.currentPage - 1) * PAGE_SIZE;

        const pageReceipts = state.filteredReceipts.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        elements.tableBody.innerHTML = pageReceipts.map(receipt => {

            const receiptNumber =
                receipt.payment_reference || receipt.id;

            const customerName = getCustomerName(receipt);
            const customerPhone = getCustomerPhone(receipt);

            const recordedBy = receipt.received_by
                ? String(receipt.received_by).slice(0, 8)
                : "—";

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHTML(receiptNumber)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(formatDate(receipt.payment_date))}
                    </td>

                    <td>
                        <strong>
                            ${escapeHTML(customerName)}
                        </strong>
                        ${
                            customerPhone
                                ? `<br><small>${escapeHTML(customerPhone)}</small>`
                                : ""
                        }
                    </td>

                    <td>
                        ${escapeHTML(
                            getPaymentMethodLabel(receipt.payment_method)
                        )}
                    </td>

                    <td>
                        ${escapeHTML(receipt.payment_reference || "—")}
                    </td>

                    <td>
                        <strong>
                            ${escapeHTML(formatMoney(receipt.amount))}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(recordedBy)}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            data-print-receipt="${escapeHTML(receipt.id)}"
                        >
                            Print
                        </button>
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

    function goToPreviousPage() {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderReceipts();
        }
    }

    function goToNextPage() {
        const totalPages = Math.max(
            1,
            Math.ceil(
                state.filteredReceipts.length / PAGE_SIZE
            )
        );

        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderReceipts();
        }
    }

    /* =====================================
       PRINT RECEIPT
    ===================================== */

    function printReceipt(receiptId) {
        const receipt = state.receipts.find(
            item => String(item.id) === String(receiptId)
        );

        if (!receipt) {
            showMessage("Receipt not found.", "danger");
            return;
        }

        const customerName = getCustomerName(receipt);
        const customerPhone = getCustomerPhone(receipt);

        const receiptNumber =
            receipt.payment_reference || receipt.id;

        const printWindow = window.open(
            "",
            "_blank",
            "width=800,height=700"
        );

        if (!printWindow) {
            showMessage(
                "Please allow pop-ups to print the receipt.",
                "warning"
            );
            return;
        }

        const safeName = escapeHTML(customerName);
        const safePhone = escapeHTML(customerPhone);
        const safeReference = escapeHTML(receiptNumber);
        const safeMethod = escapeHTML(
            getPaymentMethodLabel(receipt.payment_method)
        );
        const safeDate = escapeHTML(
            formatDate(receipt.payment_date)
        );
        const safeAmount = escapeHTML(
            formatMoney(receipt.amount)
        );

        const AS = window.AppSettings;
        const settingsHeader = AS
            ? AS.headerHtml(AS.receiptTitle("Payment Receipt"))
            : "<h1>Air Ticket Agency</h1><p>Payment Receipt</p>";
        const receiptHeading = "CUSTOMER PAYMENT RECEIPT";
        const footerHtml = (AS
            ? AS.footerLines([
                "This receipt confirms the payment received.",
                "Thank you for choosing our agency.",
                "Computer-generated receipt."
            ])
            : ["Computer-generated receipt."]
        ).map((line) => `<p>${escapeHTML(line)}</p>`).join("");
        const paper = AS ? AS.paper() : { page: "A4", width: "210mm" };
        const copyCount = AS ? AS.copies() : 1;
        const pageCss = `@page { size: ${paper.page}; margin: 8mm; }
            .receipt { max-width: ${paper.width === "210mm" || paper.width === "148mm" ? "650px" : paper.width}; }
            .copy-break { page-break-after: always; }`;

        const receiptOnce = `
                <main class="receipt">

                    <header class="header">
                        ${settingsHeader}
                    </header>

                    <div class="title">${receiptHeading}</div>

                    <table class="details">
                        <tr>
                            <td>Receipt Number</td>
                            <td><strong>${safeReference}</strong></td>
                        </tr>

                        <tr>
                            <td>Payment Date</td>
                            <td>${safeDate}</td>
                        </tr>

                        <tr>
                            <td>Customer Name</td>
                            <td>${safeName}</td>
                        </tr>

                        <tr>
                            <td>Customer Phone</td>
                            <td>${safePhone || "—"}</td>
                        </tr>

                        <tr>
                            <td>Payment Method</td>
                            <td>${safeMethod}</td>
                        </tr>
                    </table>

                    <div class="amount">
                        <span>Amount Received</span>
                        <strong>${safeAmount}</strong>
                    </div>

                    <footer class="footer">
                        ${footerHtml}
                    </footer>

                </main>
        `;
        const receiptCopies = Array.from({ length: copyCount })
            .map((_, i) => i < copyCount - 1
                ? receiptOnce + '<div class="copy-break"></div>'
                : receiptOnce)
            .join("");

        printWindow.document.open();

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <title>Payment Receipt - ${safeReference}</title>

                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        margin: 0;
                        padding: 30px;
                        color: #222;
                        font-family: Arial, sans-serif;
                        background: #fff;
                    }

                    .receipt {
                        max-width: 650px;
                        margin: 0 auto;
                        padding: 30px;
                        border: 1px solid #ddd;
                    }

                    .header {
                        text-align: center;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #b91c35;
                    }

                    .header h1 {
                        margin: 0 0 7px;
                        color: #b91c35;
                        font-size: 23px;
                    }

                    .header p {
                        margin: 4px 0;
                        color: #666;
                        font-size: 12px;
                    }

                    .title {
                        margin: 25px 0;
                        text-align: center;
                        font-size: 20px;
                        font-weight: bold;
                    }

                    .details {
                        width: 100%;
                        border-collapse: collapse;
                    }

                    .details td {
                        padding: 12px 8px;
                        border-bottom: 1px solid #eee;
                        font-size: 13px;
                    }

                    .details td:first-child {
                        width: 42%;
                        color: #666;
                    }

                    .amount {
                        margin-top: 25px;
                        padding: 18px;
                        text-align: center;
                        background: #f8f8f8;
                        border: 1px solid #eee;
                    }

                    .amount span {
                        display: block;
                        margin-bottom: 8px;
                        color: #666;
                        font-size: 12px;
                    }

                    .amount strong {
                        color: #b91c35;
                        font-size: 25px;
                    }

                    .footer {
                        margin-top: 35px;
                        text-align: center;
                        color: #777;
                        font-size: 11px;
                        line-height: 1.7;
                    }

                    @media print {
                        body {
                            padding: 0;
                        }

                        .receipt {
                            border: none;
                            padding: 10px;
                        }
                    }
                ${pageCss}
                </style>
            </head>

            <body>
                ${receiptCopies}

                <script>
                    window.onload = function () {
                        window.print();
                    };
                <\/script>
            </body>
            </html>
        `);

        printWindow.document.close();
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

        elements.method?.addEventListener(
            "change",
            applyFilters
        );

        elements.dateFrom?.addEventListener(
            "change",
            applyFilters
        );

        elements.dateTo?.addEventListener(
            "change",
            applyFilters
        );

        elements.resetButton?.addEventListener("click", () => {

            if (elements.search) elements.search.value = "";
            if (elements.method) elements.method.value = "all";
            if (elements.dateFrom) elements.dateFrom.value = "";
            if (elements.dateTo) elements.dateTo.value = "";

            applyFilters();
        });

        elements.refreshButton?.addEventListener(
            "click",
            loadReceipts
        );

        elements.previousPage?.addEventListener(
            "click",
            goToPreviousPage
        );

        elements.nextPage?.addEventListener(
            "click",
            goToNextPage
        );

        elements.tableBody?.addEventListener("click", event => {

            const printButton = event.target.closest(
                "[data-print-receipt]"
            );

            if (!printButton) return;

            printReceipt(
                printButton.dataset.printReceipt
            );
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

        await loadReceipts();
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

