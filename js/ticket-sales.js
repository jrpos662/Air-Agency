
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const client = window.supabaseClient;
    const PAGE_SIZE = 10;

    let currentPage = 1;
    let allSales = [];
    let filteredSales = [];

    const customerMap = new Map();
    const passengerMap = new Map();
    const paymentMap = new Map();

    const elements = {
        search: document.getElementById("sale-search"),
        status: document.getElementById("sale-status-filter"),
        dateFrom: document.getElementById("sale-date-from"),
        dateTo: document.getElementById("sale-date-to"),

        searchButton: document.getElementById("sale-search-button"),
        resetButton: document.getElementById("sale-reset-button"),
        refreshButton: document.getElementById("sale-refresh-button"),

        tableBody: document.getElementById("sales-table-body"),
        message: document.getElementById("sale-message"),
        count: document.getElementById("sale-count"),

        previous: document.getElementById("sale-previous-page"),
        next: document.getElementById("sale-next-page"),
        pageInfo: document.getElementById("sale-page-info"),

        totalSales: document.getElementById("total-sales"),
        todaySales: document.getElementById("today-sales"),
        totalTickets: document.getElementById("total-tickets"),
        totalAmount: document.getElementById("total-sales-amount")
    };

    function showMessage(message, type = "error") {
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.className = `sale-message ${type}`;
    }

    function clearMessage() {
        if (!elements.message) return;

        elements.message.textContent = "";
        elements.message.className = "sale-message";
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2
        }).format(Number(amount) || 0);
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

    function localDateString(value = new Date()) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function createCell(value) {
        const cell = document.createElement("td");

        cell.textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);

        return cell;
    }

    function getCustomerName(sale) {
        return customerMap.get(sale.customer_id) || "Unknown Customer";
    }

    function getPassengerCount(saleId) {
        return passengerMap.get(saleId)?.length || 0;
    }

    function getPassengerPnr(saleId) {
        const passengers = passengerMap.get(saleId) || [];

        const pnrs = [
            ...new Set(
                passengers
                    .map(item => item.pnr)
                    .filter(Boolean)
            )
        ];

        return pnrs.join(", ") || "—";
    }

    function getNetAmount(sale) {
        return Math.max(
            0,
            Number(sale.selling_total || 0) -
            Number(sale.discount_amount || 0)
        );
    }

    function getPaidAmount(saleId) {
        return paymentMap.get(saleId) || 0;
    }

    function getPaymentStatus(sale) {
        const netAmount = getNetAmount(sale);
        const paid = getPaidAmount(sale.id);

        if (netAmount <= 0 || paid >= netAmount) {
            return "completed";
        }

        if (paid > 0) {
            return "partially_paid";
        }

        return "unpaid";
    }

    function getDisplayStatus(sale) {
        const saleStatus = String(
            sale.sale_status || "issued"
        ).toLowerCase();

        if (saleStatus === "cancelled") return "cancelled";
        if (saleStatus === "refunded") return "refunded";

        if (saleStatus === "partially_refunded") {
            return "partially_refunded";
        }

        return getPaymentStatus(sale);
    }

    function formatStatus(status) {
        return String(status || "unknown")
            .replaceAll("_", " ")
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    function createStatusCell(sale) {
        const cell = document.createElement("td");
        const badge = document.createElement("span");

        const status = getDisplayStatus(sale);

        badge.className = `sale-status ${status.replaceAll("_", "-")}`;
        badge.textContent = formatStatus(status);

        cell.appendChild(badge);

        return cell;
    }

    function createActionCell(saleId) {
        const cell = document.createElement("td");
        const button = document.createElement("button");

        button.type = "button";
        button.className = "sale-action-button";
        button.textContent = "View Details";

        button.addEventListener("click", () => {
            window.location.href =
                `sale-details.html?id=${encodeURIComponent(saleId)}`;
        });

        cell.appendChild(button);

        return cell;
    }

    function renderSales() {
        if (!elements.tableBody) return;

        elements.tableBody.replaceChildren();

        const totalPages = Math.max(
            1,
            Math.ceil(filteredSales.length / PAGE_SIZE)
        );

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * PAGE_SIZE;

        const pageSales = filteredSales.slice(
            start,
            start + PAGE_SIZE
        );

        if (!pageSales.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 8;
            cell.className = "table-empty";
            cell.textContent = "No ticket sales found.";

            row.appendChild(cell);
            elements.tableBody.appendChild(row);
        } else {
            pageSales.forEach(sale => {
                const row = document.createElement("tr");

                row.appendChild(
                    createCell(sale.sale_reference)
                );

                row.appendChild(
                    createCell(formatDate(sale.sale_date))
                );

                row.appendChild(
                    createCell(getCustomerName(sale))
                );

                row.appendChild(
                    createCell(getPassengerPnr(sale.id))
                );

                row.appendChild(
                    createCell(getPassengerCount(sale.id))
                );

                row.appendChild(
                    createCell(formatMoney(sale.selling_total))
                );

                row.appendChild(
                    createStatusCell(sale)
                );

                row.appendChild(
                    createActionCell(sale.id)
                );

                elements.tableBody.appendChild(row);
            });
        }

        if (elements.count) {
            elements.count.textContent =
                `${filteredSales.length} records`;
        }

        if (elements.pageInfo) {
            elements.pageInfo.textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if (elements.previous) {
            elements.previous.disabled = currentPage <= 1;
        }

        if (elements.next) {
            elements.next.disabled = currentPage >= totalPages;
        }
    }

    function updateStatistics() {
        const today = localDateString();

        const todayCount = allSales.filter(sale =>
            sale.sale_date === today
        ).length;

        const ticketCount = allSales.reduce(
            (total, sale) => total + getPassengerCount(sale.id),
            0
        );

        const totalAmount = allSales.reduce(
            (total, sale) => total + Number(sale.selling_total || 0),
            0
        );

        if (elements.totalSales) {
            elements.totalSales.textContent = allSales.length;
        }

        if (elements.todaySales) {
            elements.todaySales.textContent = todayCount;
        }

        if (elements.totalTickets) {
            elements.totalTickets.textContent = ticketCount;
        }

        if (elements.totalAmount) {
            elements.totalAmount.textContent = formatMoney(totalAmount);
        }
    }

    function applyFilters() {
        const search = (
            elements.search?.value || ""
        ).trim().toLowerCase();

        const status = elements.status?.value || "";

        const dateFrom = elements.dateFrom?.value || "";
        const dateTo = elements.dateTo?.value || "";

        filteredSales = allSales.filter(sale => {
            const reference = String(
                sale.sale_reference || ""
            ).toLowerCase();

            const customer = getCustomerName(sale).toLowerCase();

            const pnr = getPassengerPnr(sale.id).toLowerCase();

            const saleDate = sale.sale_date || "";

            const matchesSearch =
                !search ||
                reference.includes(search) ||
                customer.includes(search) ||
                pnr.includes(search);

            const matchesStatus =
                !status || getDisplayStatus(sale) === status;

            const matchesFrom =
                !dateFrom || saleDate >= dateFrom;

            const matchesTo =
                !dateTo || saleDate <= dateTo;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesFrom &&
                matchesTo
            );
        });

        currentPage = 1;
        renderSales();
    }

    async function loadRelatedData(sales) {
        customerMap.clear();
        passengerMap.clear();
        paymentMap.clear();

        const customerIds = [
            ...new Set(
                sales.map(sale => sale.customer_id).filter(Boolean)
            )
        ];

        const saleIds = sales.map(sale => sale.id);

        if (customerIds.length) {
            const { data, error } = await client
                .from("customers")
                .select("id, full_name")
                .in("id", customerIds);

            if (error) throw error;

            (data || []).forEach(customer => {
                customerMap.set(customer.id, customer.full_name);
            });
        }

        if (saleIds.length) {
            const { data, error } = await client
                .from("sale_passengers")
                .select("id, sale_id, pnr")
                .in("sale_id", saleIds);

            if (error) throw error;

            (data || []).forEach(passenger => {
                const list = passengerMap.get(passenger.sale_id) || [];

                list.push(passenger);
                passengerMap.set(passenger.sale_id, list);
            });

            const {
                data: allocations,
                error: allocationError
            } = await client
                .from("customer_payment_allocations")
                .select("sale_id, allocated_amount")
                .in("sale_id", saleIds);

            if (allocationError) throw allocationError;

            (allocations || []).forEach(allocation => {
                if (!allocation.sale_id) return;

                const current =
                    paymentMap.get(allocation.sale_id) || 0;

                paymentMap.set(
                    allocation.sale_id,
                    current + Number(allocation.allocated_amount || 0)
                );
            });
        }
    }

    async function initializeUser() {
        if (!window.AuthManager) {
            throw new Error("Authentication module is unavailable.");
        }

        await window.AuthManager.initialize();

        const user = await window.AuthManager.getCurrentUser();

        if (!user) {
            window.location.href = "login.html";
            return false;
        }

        const { data: profile, error } = await client
            .from("profiles")
            .select("is_active")
            .eq("id", user.id)
            .single();

        if (error) throw error;

        if (!profile || profile.is_active !== true) {
            throw new Error("Your account is inactive.");
        }

        return true;
    }

    async function loadSales() {
        if (!client) {
            showMessage("Supabase connection is not available.");
            return;
        }

        clearMessage();

        if (elements.tableBody) {
            elements.tableBody.replaceChildren();

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 8;
            cell.className = "table-empty";
            cell.textContent = "Loading sales records...";

            row.appendChild(cell);
            elements.tableBody.appendChild(row);
        }

        try {
            const authenticated = await initializeUser();

            if (!authenticated) return;

            // Do not select financial or purchase-price data.
            const { data, error } = await client
                .from("ticket_sales")
                .select(`
                    id,
                    sale_reference,
                    customer_id,
                    sale_date,
                    sale_status,
                    selling_total,
                    discount_amount,
                    created_at
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;

            allSales = data || [];

            await loadRelatedData(allSales);

            updateStatistics();
            applyFilters();

        } catch (error) {
            console.error("Ticket sales loading error:", error);

            showMessage(
                error.message || "Unable to load ticket sales."
            );

            if (elements.tableBody) {
                elements.tableBody.replaceChildren();

                const row = document.createElement("tr");
                const cell = document.createElement("td");

                cell.colSpan = 8;
                cell.className = "table-empty";
                cell.textContent = "Unable to load sales records.";

                row.appendChild(cell);
                elements.tableBody.appendChild(row);
            }
        }
    }

    elements.searchButton?.addEventListener(
        "click",
        applyFilters
    );

    elements.search?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            applyFilters();
        }
    });

    elements.status?.addEventListener(
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
        if (elements.status) elements.status.value = "";
        if (elements.dateFrom) elements.dateFrom.value = "";
        if (elements.dateTo) elements.dateTo.value = "";

        applyFilters();
    });

    elements.refreshButton?.addEventListener(
        "click",
        loadSales
    );

    elements.previous?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderSales();
        }
    });

    elements.next?.addEventListener("click", () => {
        const totalPages = Math.ceil(
            filteredSales.length / PAGE_SIZE
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderSales();
        }
    });

    loadSales();
});
