/* customer-payments.js - Air Ticket Agency Management */


"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const client = window.supabaseClient;

    const elements = {
        search: document.getElementById("payment-search"),
        searchButton: document.getElementById("payment-search-button"),
        method: document.getElementById("payment-method-filter"),
        dateFrom: document.getElementById("payment-date-from"),
        dateTo: document.getElementById("payment-date-to"),
        reset: document.getElementById("payment-reset-button"),
        refresh: document.getElementById("payment-refresh-button"),
        message: document.getElementById("customer-payments-message"),
        table: document.getElementById("customer-payments-table-body"),
        count: document.getElementById("payment-count"),
        previous: document.getElementById("payment-previous-page"),
        next: document.getElementById("payment-next-page"),
        pageInfo: document.getElementById("payment-page-info"),
        newButton: document.getElementById("new-customer-payment-button"),
        totalCount: document.getElementById("total-payment-count"),
        totalAmount: document.getElementById("total-payment-amount"),
        todayAmount: document.getElementById("today-payment-amount"),
        customerCount: document.getElementById("payment-customer-count")
    };

    const PAGE_SIZE = 10;

    let currentPage = 1;
    let totalRecords = 0;
    let loading = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatMoney(amount) {
        return "৳" + Number(amount || 0).toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-GB");
    }

    function getToday() {
        const date = new Date();

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function showMessage(message, type = "error") {
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.className =
            `customer-payments-message show ${type}`;
    }

    function clearMessage() {
        if (!elements.message) return;

        elements.message.textContent = "";
        elements.message.className = "customer-payments-message";
    }

    function methodLabel(method) {
        const labels = {
            cash: "Cash",
            bank: "Bank",
            mobile_banking: "Mobile Banking"
        };

        return labels[method] || method || "—";
    }

    function setLoading(status) {
        loading = status;

        if (elements.refresh) {
            elements.refresh.disabled = status;
            elements.refresh.textContent = status ? "Loading..." : "Refresh";
        }

        if (elements.searchButton) {
            elements.searchButton.disabled = status;
        }
    }

    async function loadPayments() {
        if (!client) {
            showMessage(
                "Supabase connection is unavailable. Please check authentication configuration."
            );
            return;
        }

        if (loading) return;

        setLoading(true);
        clearMessage();

        try {
            const from = (currentPage - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = client
                .from("customer_payments")
                .select(`
                    id,
                    receipt_number:payment_reference,
                    payment_date,
                    amount,
                    payment_method,
                    payment_reference,
                    customer_id,
                    recorded_by:received_by
                `, { count: "exact" });

            if (elements.method?.value &&
                elements.method.value !== "all") {
                query = query.eq(
                    "payment_method",
                    elements.method.value
                );
            }

            if (elements.dateFrom?.value) {
                query = query.gte(
                    "payment_date",
                    elements.dateFrom.value
                );
            }

            if (elements.dateTo?.value) {
                query = query.lte(
                    "payment_date",
                    elements.dateTo.value
                );
            }

            const { data, error, count } = await query
                .order("payment_date", { ascending: false })
                .range(from, to);

            if (error) throw error;

            totalRecords = count || 0;

            const customerIds = [
                ...new Set(
                    (data || [])
                        .map(payment => payment.customer_id)
                        .filter(Boolean)
                )
            ];

            const customers = new Map();

            if (customerIds.length) {
                const { data: customerData, error: customerError } =
                    await client
                        .from("customers")
                        .select("id, full_name, phone")
                        .in("id", customerIds);

                if (customerError) throw customerError;

                (customerData || []).forEach(customer => {
                    customers.set(customer.id, customer);
                });
            }

            let payments = (data || []).map(payment => ({
                ...payment,
                customer: customers.get(payment.customer_id) || null
            }));

            const search = elements.search?.value
                ?.trim()
                .toLowerCase();

            if (search) {
                payments = payments.filter(payment => {
                    const customerName =
                        payment.customer?.full_name || "";

                    const phone =
                        payment.customer?.phone || "";

                    return [
                        payment.receipt_number,
                        payment.payment_reference,
                        customerName,
                        phone
                    ].some(value =>
                        String(value || "")
                            .toLowerCase()
                            .includes(search)
                    );
                });
            }

            renderPayments(payments);

            if (search) {
                elements.count.textContent =
                    `${payments.length} matching records on this page`;
            } else {
                elements.count.textContent =
                    `${totalRecords} payment records`;
            }

            updatePagination();
            await loadSummary();

        } catch (error) {
            console.error("Customer payments error:", error);

            showMessage(
                error.message || "Unable to load customer payments."
            );

            if (elements.table) {
                elements.table.innerHTML = `
                    <tr>
                        <td colspan="8" class="empty-state">
                            Unable to load payment records.
                        </td>
                    </tr>
                `;
            }

        } finally {
            setLoading(false);
        }
    }

    function renderPayments(payments) {
        if (!elements.table) return;

        if (!payments.length) {
            elements.table.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        No payment records found.
                    </td>
                </tr>
            `;
            return;
        }

        elements.table.innerHTML = payments.map(payment => {
            const customer = payment.customer;

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHTML(payment.receipt_number || "—")}
                        </strong>
                    </td>

                    <td>${escapeHTML(formatDate(payment.payment_date))}</td>

                    <td>
                        <div>${escapeHTML(customer?.full_name || "Unknown Customer")}</div>
                        <small>${escapeHTML(customer?.phone || "")}</small>
                    </td>

                    <td>
                        <strong>${formatMoney(payment.amount)}</strong>
                    </td>

                    <td>${escapeHTML(methodLabel(payment.payment_method))}</td>

                    <td>${escapeHTML(payment.payment_reference || "—")}</td>

                    <td>${escapeHTML(payment.recorded_by || "—")}</td>

                    <td>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            data-payment-id="${escapeHTML(payment.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadSummary() {
        if (!client) return;

        try {
            const { data, error } = await client
                .from("customer_payments")
                .select("amount, payment_date, customer_id");

            if (error) throw error;

            const payments = data || [];
            const today = getToday();

            const totalAmount = payments.reduce(
                (sum, payment) => sum + Number(payment.amount || 0),
                0
            );

            const todayAmount = payments
                .filter(payment =>
                    String(payment.payment_date || "").slice(0, 10) === today
                )
                .reduce(
                    (sum, payment) => sum + Number(payment.amount || 0),
                    0
                );

            const customerIds = new Set(
                payments
                    .map(payment => payment.customer_id)
                    .filter(Boolean)
            );

            if (elements.totalCount) {
                elements.totalCount.textContent =
                    payments.length.toLocaleString("en-BD");
            }

            if (elements.totalAmount) {
                elements.totalAmount.textContent =
                    formatMoney(totalAmount);
            }

            if (elements.todayAmount) {
                elements.todayAmount.textContent =
                    formatMoney(todayAmount);
            }

            if (elements.customerCount) {
                elements.customerCount.textContent =
                    customerIds.size.toLocaleString("en-BD");
            }

        } catch (error) {
            console.error("Payment summary error:", error);
        }
    }

    function updatePagination() {
        const totalPages = Math.max(
            1,
            Math.ceil(totalRecords / PAGE_SIZE)
        );

        if (elements.pageInfo) {
            elements.pageInfo.textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if (elements.previous) {
            elements.previous.disabled =
                currentPage <= 1 || loading;
        }

        if (elements.next) {
            elements.next.disabled =
                currentPage >= totalPages || loading;
        }
    }

    function applyFilters() {
        currentPage = 1;
        loadPayments();
    }

    elements.searchButton?.addEventListener(
        "click",
        applyFilters
    );

    elements.search?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
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

    elements.reset?.addEventListener("click", () => {
        if (elements.search) elements.search.value = "";
        if (elements.method) elements.method.value = "all";
        if (elements.dateFrom) elements.dateFrom.value = "";
        if (elements.dateTo) elements.dateTo.value = "";

        currentPage = 1;
        loadPayments();
    });

    elements.refresh?.addEventListener(
        "click",
        loadPayments
    );

    elements.previous?.addEventListener("click", () => {
        if (currentPage > 1 && !loading) {
            currentPage--;
            loadPayments();
        }
    });

    elements.next?.addEventListener("click", () => {
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

        if (currentPage < totalPages && !loading) {
            currentPage++;
            loadPayments();
        }
    });

    elements.newButton?.addEventListener("click", () => {
        window.location.href = "new-customer-payment.html";
    });

    elements.table?.addEventListener("click", event => {
        const button = event.target.closest("[data-payment-id]");

        if (!button) return;

        const paymentId = button.dataset.paymentId;

        if (!paymentId) return;

        window.location.href =
            `customer-payment-details.html?id=${encodeURIComponent(paymentId)}`;
    });

    loadPayments();
});
