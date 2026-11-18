/* customers.js - Air Ticket Agency Management */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const client = window.supabaseClient;

    const PAGE_SIZE = 10;

    const elements = {
        search: document.getElementById("customer-search"),
        searchButton: document.getElementById("customer-search-button"),
        statusFilter: document.getElementById("customer-status-filter"),
        resetButton: document.getElementById("customer-reset-button"),
        refreshButton: document.getElementById("customer-refresh-button"),

        tableBody: document.getElementById("customers-table-body"),
        message: document.getElementById("customers-message"),
        count: document.getElementById("customer-count"),

        total: document.getElementById("total-customers"),
        active: document.getElementById("active-customers"),
        inactive: document.getElementById("inactive-customers"),

        previous: document.getElementById("customer-previous-page"),
        next: document.getElementById("customer-next-page"),
        pageInfo: document.getElementById("customer-page-info")
    };

    let currentPage = 1;
    let totalRecords = 0;
    let isLoading = false;

    function showMessage(message, type = "error") {
        elements.message.textContent = message;
        elements.message.className = `customers-message ${type}`;
    }

    function clearMessage() {
        elements.message.textContent = "";
        elements.message.className = "customers-message";
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(`${value}`.slice(0, 10) + "T00:00:00");

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function renderEmpty(message) {
        elements.tableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "table-empty";
        cell.textContent = message;

        row.appendChild(cell);
        elements.tableBody.appendChild(row);
    }

    function createCell(value) {
        const cell = document.createElement("td");
        cell.textContent = value || "—";
        return cell;
    }

    function renderCustomers(customers) {
        elements.tableBody.replaceChildren();

        if (!customers.length) {
            renderEmpty("No customers found.");
            return;
        }

        customers.forEach((customer, index) => {
            const row = document.createElement("tr");

            row.appendChild(
                createCell(
                    String((currentPage - 1) * PAGE_SIZE + index + 1)
                )
            );

            row.appendChild(createCell(customer.full_name));
            row.appendChild(createCell(customer.phone));
            row.appendChild(createCell(customer.email));
            row.appendChild(createCell(formatDate(customer.created_at)));

            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");

            statusBadge.className = customer.is_active
                ? "customer-status active"
                : "customer-status inactive";

            statusBadge.textContent = customer.is_active
                ? "Active"
                : "Inactive";

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            const actionCell = document.createElement("td");
            const detailsLink = document.createElement("a");

            detailsLink.className = "customer-action";
            detailsLink.textContent = "View Details";
            detailsLink.href =
                `customer-details.html?id=${encodeURIComponent(customer.id)}`;

            actionCell.appendChild(detailsLink);
            row.appendChild(actionCell);

            elements.tableBody.appendChild(row);
        });
    }

    async function loadStatistics() {
        const [
            totalResult,
            activeResult,
            inactiveResult
        ] = await Promise.all([
            client
                .from("customers")
                .select("id", { count: "exact", head: true }),

            client
                .from("customers")
                .select("id", { count: "exact", head: true })
                .eq("is_active", true),

            client
                .from("customers")
                .select("id", { count: "exact", head: true })
                .eq("is_active", false)
        ]);

        if (totalResult.error) throw totalResult.error;
        if (activeResult.error) throw activeResult.error;
        if (inactiveResult.error) throw inactiveResult.error;

        elements.total.textContent = totalResult.count ?? 0;
        elements.active.textContent = activeResult.count ?? 0;
        elements.inactive.textContent = inactiveResult.count ?? 0;
    }

    async function loadCustomers() {
        if (!client) {
            showMessage(
                "Supabase connection is unavailable. Check auth.js."
            );
            return;
        }

        if (isLoading) return;

        isLoading = true;
        clearMessage();

        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    Loading customers...
                </td>
            </tr>
        `;

        try {
            const searchTerm = elements.search.value.trim();
            const status = elements.statusFilter.value;

            let query = client
                .from("customers")
                .select(
                    "id, full_name, phone, email, created_at, is_active",
                    { count: "exact" }
                );

            if (status === "active") {
                query = query.eq("is_active", true);
            } else if (status === "inactive") {
                query = query.eq("is_active", false);
            }

            if (searchTerm) {
                const safeTerm = searchTerm.replace(
                    /[%_,()]/g,
                    character => `\\${character}`
                );

                query = query.or(
                    `full_name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%`
                );
            }

            const from = (currentPage - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data, error, count } = await query
                .order("created_at", { ascending: false })
                .range(from, to);

            if (error) throw error;

            totalRecords = count || 0;

            renderCustomers(data || []);

            elements.count.textContent =
                `${totalRecords} Customer${totalRecords === 1 ? "" : "s"}`;

            updatePagination();

            await loadStatistics();

        } catch (error) {
            console.error("Customer loading error:", error);

            renderEmpty("Unable to load customers.");

            showMessage(
                error.message || "Unable to load customer information."
            );

        } finally {
            isLoading = false;
        }
    }

    function updatePagination() {
        const totalPages = Math.max(
            1,
            Math.ceil(totalRecords / PAGE_SIZE)
        );

        elements.pageInfo.textContent =
            `Page ${currentPage} of ${totalPages}`;

        elements.previous.disabled = currentPage <= 1;
        elements.next.disabled = currentPage >= totalPages;
    }

    function searchCustomers() {
        currentPage = 1;
        loadCustomers();
    }

    function resetFilters() {
        elements.search.value = "";
        elements.statusFilter.value = "all";

        currentPage = 1;

        loadCustomers();
    }

    elements.searchButton.addEventListener(
        "click",
        searchCustomers
    );

    elements.search.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchCustomers();
        }
    });

    elements.statusFilter.addEventListener(
        "change",
        searchCustomers
    );

    elements.resetButton.addEventListener(
        "click",
        resetFilters
    );

    elements.refreshButton.addEventListener("click", () => {
        loadCustomers();
    });

    elements.previous.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            loadCustomers();
        }
    });

    elements.next.addEventListener("click", () => {
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

        if (currentPage < totalPages) {
            currentPage++;
            loadCustomers();
        }
    });

    loadCustomers();
});

