
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const client = window.supabaseClient;

    const params = new URLSearchParams(window.location.search);
    const saleId = params.get("id");

    const elements = {
        message: document.getElementById("sale-details-message"),
        reference: document.getElementById("sale-reference"),
        status: document.getElementById("sale-status"),

        saleId: document.getElementById("detail-sale-id"),
        saleDate: document.getElementById("detail-sale-date"),
        createdAt: document.getElementById("detail-created-at"),
        pnr: document.getElementById("detail-pnr"),

        customerName: document.getElementById("detail-customer-name"),
        customerPhone: document.getElementById("detail-customer-phone"),
        customerEmail: document.getElementById("detail-customer-email"),

        agency: document.getElementById("detail-agency"),
        airline: document.getElementById("detail-airline"),
        travelDate: document.getElementById("detail-travel-date"),
        route: document.getElementById("detail-route"),

        passengerCount: document.getElementById("sale-passenger-count"),
        passengersBody: document.getElementById("sale-passengers-body"),

        sellingTotal: document.getElementById("detail-selling-total"),
        discount: document.getElementById("detail-discount"),
        netTotal: document.getElementById("detail-net-total"),
        totalPaid: document.getElementById("detail-total-paid"),
        customerDue: document.getElementById("detail-customer-due"),

        paymentStatus: document.getElementById("detail-payment-status"),
        paymentMethod: document.getElementById("detail-payment-method"),
        paymentReference: document.getElementById("detail-payment-reference"),
        notes: document.getElementById("detail-sale-notes"),

        printButton: document.getElementById("print-sale-button"),
        receiptButton: document.getElementById("view-receipt-button"),
        paymentButton: document.getElementById("record-payment-button")
    };

    function showMessage(message, type = "error") {
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.className =
            `sale-details-message ${type}`;
    }

    function clearMessage() {
        if (!elements.message) return;

        elements.message.textContent = "";
        elements.message.className = "sale-details-message";
    }

    function setText(element, value, fallback = "—") {
        if (!element) return;

        element.textContent =
            value === null || value === undefined || value === ""
                ? fallback
                : String(value);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(
            `${String(value).slice(0, 10)}T00:00:00`
        );

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function formatDateTime(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function normalizeStatus(value) {
        return String(value || "unknown")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "");
    }

    function renderStatus(status) {
        const value = String(status || "unknown");

        setText(
            elements.status,
            value.replaceAll("_", " ")
        );

        if (elements.status) {
            elements.status.className =
                `sale-status ${normalizeStatus(value)}`;
        }
    }

    function appendCell(row, value) {
        const cell = document.createElement("td");

        cell.textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);

        row.appendChild(cell);
    }

    function renderPassengers(passengers) {
        if (!elements.passengersBody) return;

        elements.passengersBody.replaceChildren();

        setText(
            elements.passengerCount,
            `${passengers.length} Passenger${passengers.length === 1 ? "" : "s"}`
        );

        if (!passengers.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.className = "table-empty";
            cell.textContent = "No passenger information found.";

            row.appendChild(cell);
            elements.passengersBody.appendChild(row);
            return;
        }

        passengers.forEach((passenger, index) => {
            const row = document.createElement("tr");

            appendCell(row, index + 1);
            appendCell(row, passenger.passenger_name);
            appendCell(row, passenger.passport_number);
            appendCell(row, formatDate(passenger.date_of_birth));

            appendCell(
                row,
                passenger.passenger_type
                    ? passenger.passenger_type.toUpperCase()
                    : "—"
            );

            appendCell(row, passenger.ticket_number);

            elements.passengersBody.appendChild(row);
        });
    }

    function renderPaymentSummary(sale, allocations, payments) {
        const sellingTotal = Number(sale.selling_total || 0);
        const discount = Number(sale.discount_amount || 0);

        const netTotal = Math.max(
            0,
            sellingTotal - discount
        );

        const totalPaid = allocations.reduce(
            (sum, allocation) =>
                sum + Number(allocation.allocated_amount || 0),
            0
        );

        const due = Math.max(0, netTotal - totalPaid);

        setText(elements.sellingTotal, formatMoney(sellingTotal));
        setText(elements.discount, formatMoney(discount));
        setText(elements.netTotal, formatMoney(netTotal));
        setText(elements.totalPaid, formatMoney(totalPaid));
        setText(elements.customerDue, formatMoney(due));

        let status = "Unpaid";

        if (due <= 0 && netTotal > 0) {
            status = "Paid";
        } else if (totalPaid > 0) {
            status = "Partially Paid";
        }

        setText(elements.paymentStatus, status);

        const methods = [
            ...new Set(
                payments
                    .map(payment => payment.payment_method)
                    .filter(Boolean)
                    .map(method => method.replaceAll("_", " "))
            )
        ];

        setText(
            elements.paymentMethod,
            methods.join(", ")
        );

        const references = [
            ...new Set(
                payments
                    .map(payment => payment.payment_reference)
                    .filter(Boolean)
            )
        ];

        setText(
            elements.paymentReference,
            references.join(", ")
        );

        if (elements.paymentButton) {
            elements.paymentButton.disabled = due <= 0;
        }
    }

    function renderSale(
        sale,
        customer,
        passengers,
        agencies,
        allocations,
        payments
    ) {
        setText(
            elements.reference,
            sale.sale_reference || sale.id
        );

        setText(elements.saleId, sale.id);
        setText(elements.saleDate, formatDate(sale.sale_date));
        setText(elements.createdAt, formatDateTime(sale.created_at));

        const pnrs = [
            ...new Set(
                passengers.map(item => item.pnr).filter(Boolean)
            )
        ];

        setText(elements.pnr, pnrs.join(", "));

        setText(elements.customerName, customer?.full_name);
        setText(elements.customerPhone, customer?.phone);
        setText(elements.customerEmail, customer?.email);

        const agencyNames = [
            ...new Set(
                passengers
                    .map(passenger =>
                        agencies.get(passenger.agency_id)
                    )
                    .filter(Boolean)
            )
        ];

        setText(
            elements.agency,
            agencyNames.join(", ")
        );

        const airlines = [
            ...new Set(
                passengers.map(item => item.airline).filter(Boolean)
            )
        ];

        setText(
            elements.airline,
            airlines.join(", ")
        );

        const travelDates = [
            ...new Set(
                passengers
                    .map(item => item.departure_at)
                    .filter(Boolean)
                    .map(item => formatDate(item))
            )
        ];

        setText(
            elements.travelDate,
            travelDates.join(", ")
        );

        const routes = [
            ...new Set(
                passengers
                    .filter(item => item.origin || item.destination)
                    .map(item =>
                        `${item.origin || "—"} → ${item.destination || "—"}`
                    )
            )
        ];

        setText(
            elements.route,
            routes.join(" | ")
        );

        setText(elements.notes, sale.notes);

        renderStatus(sale.sale_status);
        renderPassengers(passengers);

        renderPaymentSummary(
            sale,
            allocations,
            payments
        );

        if (elements.receiptButton) {
            elements.receiptButton.disabled = false;
        }
    }

    async function verifyUser() {
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
            .maybeSingle();

        if (error) throw error;

        if (!profile || !profile.is_active) {
            throw new Error("Your account is inactive.");
        }

        return true;
    }

    async function loadSale() {
        if (!client) {
            throw new Error(
                "Supabase connection is unavailable. Check supabase-config.js and auth.js."
            );
        }

        if (!saleId) {
            throw new Error("Sale ID is missing from the URL.");
        }

        /*
         * Only customer-visible sale fields are selected.
         * Purchase price and profit are never requested.
         */

        const { data: sale, error: saleError } = await client
            .from("ticket_sales")
            .select(`
                id,
                sale_reference,
                customer_id,
                booking_id,
                sale_date,
                sale_status,
                selling_total,
                discount_amount,
                notes,
                created_at
            `)
            .eq("id", saleId)
            .maybeSingle();

        if (saleError) throw saleError;

        if (!sale) {
            throw new Error("Ticket sale was not found.");
        }

        const [
            customerResult,
            passengerResult,
            allocationResult
        ] = await Promise.all([
            client
                .from("customers")
                .select("id, full_name, phone, email")
                .eq("id", sale.customer_id)
                .maybeSingle(),

            client
                .from("sale_passengers")
                .select(`
                    id,
                    sale_id,
                    agency_id,
                    passenger_name,
                    passenger_type,
                    passport_number,
                    ticket_number,
                    pnr,
                    airline,
                    origin,
                    destination,
                    departure_at,
                    arrival_at
                `)
                .eq("sale_id", sale.id)
                .order("created_at", { ascending: true }),

            client
                .from("customer_payment_allocations")
                .select("id, payment_id, allocated_amount")
                .eq("sale_id", sale.id)
        ]);

        if (customerResult.error) throw customerResult.error;
        if (passengerResult.error) throw passengerResult.error;
        if (allocationResult.error) throw allocationResult.error;

        const passengers = passengerResult.data || [];
        const allocations = allocationResult.data || [];

        const agencyIds = [
            ...new Set(
                passengers
                    .map(item => item.agency_id)
                    .filter(Boolean)
            )
        ];

        const paymentIds = [
            ...new Set(
                allocations
                    .map(item => item.payment_id)
                    .filter(Boolean)
            )
        ];

        let agencies = new Map();
        let payments = [];

        if (agencyIds.length) {
            const { data, error } = await client
                .from("agencies")
                .select("id, agency_name")
                .in("id", agencyIds);

            if (error) throw error;

            agencies = new Map(
                (data || []).map(item => [
                    item.id,
                    item.agency_name
                ])
            );
        }

        if (paymentIds.length) {
            const { data, error } = await client
                .from("customer_payments")
                .select(`
                    id,
                    payment_reference,
                    payment_date,
                    payment_method
                `)
                .in("id", paymentIds);

            if (error) throw error;

            payments = data || [];
        }

        renderSale(
            sale,
            customerResult.data,
            passengers,
            agencies,
            allocations,
            payments
        );
    }

    elements.printButton?.addEventListener("click", () => {
        window.print();
    });

    elements.receiptButton?.addEventListener("click", () => {
        if (!saleId) return;

        window.location.href =
            `receipts.html?sale_id=${encodeURIComponent(saleId)}`;
    });

    elements.paymentButton?.addEventListener("click", () => {
        if (!saleId) return;

        window.location.href =
            `customer-payments.html?sale_id=${encodeURIComponent(saleId)}`;
    });

    async function initialize() {
        try {
            clearMessage();

            const authenticated = await verifyUser();

            if (!authenticated) return;

            await loadSale();

        } catch (error) {
            console.error("Sale details loading error:", error);

            showMessage(
                error.message || "Unable to load ticket sale details."
            );
        }
    }

    initialize();
});
