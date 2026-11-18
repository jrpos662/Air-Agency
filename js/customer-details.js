
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const message = document.getElementById("customer-details-message");

    const elements = {
        avatar: document.getElementById("customer-avatar"),
        fullName: document.getElementById("customer-full-name"),
        phone: document.getElementById("customer-phone"),
        email: document.getElementById("customer-email"),
        status: document.getElementById("customer-status"),
        customerId: document.getElementById("customer-id"),

        totalBookings: document.getElementById("customer-total-bookings"),
        totalSales: document.getElementById("customer-total-sales"),
        totalPaid: document.getElementById("customer-total-paid"),
        totalDue: document.getElementById("customer-total-due"),

        detailName: document.getElementById("detail-full-name"),
        detailPhone: document.getElementById("detail-phone"),
        detailEmail: document.getElementById("detail-email"),
        gender: document.getElementById("detail-gender"),
        nationality: document.getElementById("detail-nationality"),
        dob: document.getElementById("detail-date-of-birth"),
        address: document.getElementById("detail-address"),
        createdAt: document.getElementById("detail-created-at"),
        updatedAt: document.getElementById("detail-updated-at"),

        bookingsBody: document.getElementById("customer-bookings-body"),
        salesBody: document.getElementById("customer-sales-body"),
        notes: document.getElementById("customer-notes"),

        editButton: document.getElementById("edit-customer-button")
    };

    const customerId = new URLSearchParams(
        window.location.search
    ).get("id");

    function getClient() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            return window.AuthManager.initialize();
        }

        return null;
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

    function setText(element, value, fallback = "—") {
        if (!element) return;

        element.textContent =
            value === null || value === undefined || value === ""
                ? fallback
                : String(value);
    }

    function showMessage(text, type = "error") {
        if (!message) return;

        message.textContent = text;
        message.className =
            `customer-details-message show ${type}`;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function formatMoney(value) {
        const amount = Number(value);

        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number.isFinite(amount) ? amount : 0);
    }

    function showTableMessage(tbody, text, colspan) {
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="empty-state">
                    ${escapeHTML(text)}
                </td>
            </tr>
        `;
    }

    function renderCustomer(customer) {
        const fullName = customer.full_name || "Unnamed Customer";

        setText(elements.fullName, fullName);
        setText(elements.phone, customer.phone);
        setText(elements.email, customer.email);
        setText(elements.customerId, customer.id);

        setText(elements.detailName, fullName);
        setText(elements.detailPhone, customer.phone);
        setText(elements.detailEmail, customer.email);
        setText(elements.gender, customer.gender);
        setText(elements.nationality, customer.nationality);
        setText(elements.dob, formatDate(customer.date_of_birth));
        setText(elements.address, customer.address);
        setText(elements.createdAt, formatDate(customer.created_at));
        setText(elements.updatedAt, formatDate(customer.updated_at));
        setText(
            elements.notes,
            customer.notes,
            "No additional notes available."
        );

        if (elements.avatar) {
            const initials = fullName
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map(part => part.charAt(0))
                .join("")
                .toUpperCase();

            elements.avatar.textContent = initials || "CU";
        }

        if (elements.status) {
            const isActive = customer.is_active === true;

            elements.status.textContent =
                isActive ? "Active" : "Inactive";

            elements.status.className = isActive
                ? "status-badge"
                : "status-badge inactive";
        }
    }

    async function loadCustomer(client) {
        const { data, error } = await client
            .from("customers")
            .select(`
                id,
                full_name,
                phone,
                email,
                gender,
                address,
                nationality,
                date_of_birth,
                is_active,
                notes,
                created_at,
                updated_at
            `)
            .eq("id", customerId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error("Customer record was not found.");
        }

        renderCustomer(data);
        return data;
    }

    async function loadBookings(client) {
        showTableMessage(
            elements.bookingsBody,
            "Loading booking history...",
            6
        );

        const { data, error } = await client
            .from("bookings")
            .select(`
                id,
                booking_date,
                travel_date,
                origin,
                destination,
                status:booking_status
            `)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            console.error("Booking history error:", error);

            showTableMessage(
                elements.bookingsBody,
                "Unable to load booking history.",
                6
            );

            return;
        }

        const bookings = data || [];

        setText(elements.totalBookings, bookings.length);

        if (!bookings.length) {
            showTableMessage(
                elements.bookingsBody,
                "No booking records found.",
                6
            );
            return;
        }

        elements.bookingsBody.innerHTML = bookings.map(booking => {
            const status = String(booking.status || "unknown")
                .toLowerCase();

            return `
                <tr>
                    <td>${escapeHTML(String(booking.id).slice(0, 8))}</td>
                    <td>${escapeHTML(formatDate(booking.booking_date))}</td>
                    <td>${escapeHTML(formatDate(booking.travel_date))}</td>
                    <td>
                        ${escapeHTML(booking.origin || "—")}
                        →
                        ${escapeHTML(booking.destination || "—")}
                    </td>
                    <td>
                        <span class="status-badge ${status === "cancelled" ? "inactive" : ""}">
                            ${escapeHTML(status.replace(/_/g, " "))}
                        </span>
                    </td>
                    <td>
                        <a
                            href="booking-details.html?id=${encodeURIComponent(booking.id)}"
                            class="btn btn-outline btn-sm"
                        >
                            View
                        </a>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadSales(client) {
        showTableMessage(
            elements.salesBody,
            "Loading ticket sales...",
            7
        );

        const { data, error } = await client
            .from("ticket_sales")
            .select(`
                id,
                sale_reference,
                sale_date,
                selling_total,
                discount_amount,
                status:sale_status,
                sale_passengers ( pnr, origin, destination )
            `)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            console.error("Ticket sales history error:", error);

            showTableMessage(
                elements.salesBody,
                "Unable to load ticket sales history.",
                7
            );

            return;
        }

        // PNR and route are stored per passenger, not on the sale.
        const sales = (data || []).map(sale => {
            const firstPassenger = (sale.sale_passengers || [])[0] || {};

            return {
                ...sale,
                pnr: firstPassenger.pnr,
                origin: firstPassenger.origin,
                destination: firstPassenger.destination
            };
        });

        setText(elements.totalSales, sales.length);

        if (!sales.length) {
            showTableMessage(
                elements.salesBody,
                "No ticket sales found.",
                7
            );
            return;
        }

        elements.salesBody.innerHTML = sales.map(sale => {
            const status = String(sale.status || "unknown")
                .toLowerCase();

            const reference =
                sale.sale_reference ||
                String(sale.id).slice(0, 8);

            const sellingAmount =
                Number(sale.selling_total || 0) -
                Number(sale.discount_amount || 0);

            return `
                <tr>
                    <td>${escapeHTML(reference)}</td>
                    <td>${escapeHTML(formatDate(sale.sale_date))}</td>
                    <td>${escapeHTML(sale.pnr || "—")}</td>
                    <td>
                        ${escapeHTML(sale.origin || "—")}
                        →
                        ${escapeHTML(sale.destination || "—")}
                    </td>
                    <td>${escapeHTML(formatMoney(sellingAmount))}</td>
                    <td>
                        <span class="status-badge ${status === "cancelled" || status === "refunded" ? "inactive" : ""}">
                            ${escapeHTML(status.replace(/_/g, " "))}
                        </span>
                    </td>
                    <td>
                        <a
                            href="sale-details.html?id=${encodeURIComponent(sale.id)}"
                            class="btn btn-outline btn-sm"
                        >
                            View
                        </a>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function initializePage() {
        if (!customerId) {
            showMessage("Customer ID is missing from the page URL.");

            showTableMessage(
                elements.bookingsBody,
                "Customer ID is required.",
                6
            );

            showTableMessage(
                elements.salesBody,
                "Customer ID is required.",
                7
            );

            return;
        }

        const client = getClient();

        if (!client) {
            showMessage(
                "Supabase is not initialized. Please check your configuration."
            );
            return;
        }

        try {
            const customer = await loadCustomer(client);

            await Promise.all([
                loadBookings(client),
                loadSales(client)
            ]);

            // Financial totals must come from a verified,
            // role-protected payment allocation query or RPC.
            // Do not calculate them from unverified table relationships.
            setText(elements.totalPaid, "—");
            setText(elements.totalDue, "—");

            if (elements.editButton) {
                elements.editButton.disabled = true;
                elements.editButton.title =
                    "Customer editing page is not available yet.";
            }

        } catch (error) {
            console.error("Customer details loading error:", error);

            showMessage(
                error.message || "Unable to load customer details."
            );

            setText(elements.fullName, "Customer unavailable");
        }
    }

    await initializePage();
});
