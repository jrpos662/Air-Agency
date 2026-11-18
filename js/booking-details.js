
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   BOOKING DETAILS
========================================= */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {

    /* =====================================
       SUPABASE
    ===================================== */

    const client = window.supabaseClient || null;

    /* =====================================
       DOM ELEMENTS
    ===================================== */

    const elements = {
        reference: document.getElementById("booking-reference"),
        status: document.getElementById("booking-status"),

        bookingId: document.getElementById("detail-booking-id"),
        bookingDate: document.getElementById("detail-booking-date"),
        travelDate: document.getElementById("detail-travel-date"),
        agency: document.getElementById("detail-agency"),
        createdAt: document.getElementById("detail-created-at"),

        quotedAmount: document.getElementById("detail-quoted-amount"),
        advanceAmount: document.getElementById("detail-advance-amount"),

        customerName: document.getElementById("detail-customer-name"),
        customerPhone: document.getElementById("detail-customer-phone"),
        customerEmail: document.getElementById("detail-customer-email"),

        origin: document.getElementById("detail-origin"),
        destination: document.getElementById("detail-destination"),

        passengerCount: document.getElementById("passenger-count"),
        passengerBody: document.getElementById("passenger-details-body"),

        notes: document.getElementById("detail-notes"),
        message: document.getElementById("details-message"),

        editButton: document.getElementById("edit-booking-button"),
        convertButton: document.getElementById("convert-booking-button"),

        userName: document.getElementById("user-name"),
        userRole: document.getElementById("user-role"),
        userAvatar: document.getElementById("user-avatar")
    };

    /* =====================================
       PAGE STATE
    ===================================== */

    const bookingId = new URLSearchParams(
        window.location.search
    ).get("id");

    let currentBooking = null;
    let isConverting = false;

    /* =====================================
       MESSAGE
    ===================================== */

    function showMessage(message, type = "error") {
        if (!elements.message) {
            console.error(message);
            return;
        }

        elements.message.textContent = message;
        elements.message.className =
            `booking-detail-message ${type}`;

        elements.message.hidden = false;
    }

    function clearMessage() {
        if (!elements.message) return;

        elements.message.textContent = "";
        elements.message.className =
            "booking-detail-message";

        elements.message.hidden = true;
    }

    /* =====================================
       HELPERS
    ===================================== */

    function setText(element, value, fallback = "—") {
        if (!element) return;

        element.textContent =
            value === null ||
            value === undefined ||
            value === ""
                ? fallback
                : String(value);
    }

    function formatMoney(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return "৳ 0.00";
        }

        return "৳ " + amount.toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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

    function formatDateTime(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function normalizeStatus(status) {
        return String(status || "unknown")
            .toLowerCase()
            .replaceAll("_", "-")
            .replaceAll(" ", "-");
    }

    function renderStatus(status) {
        if (!elements.status) return;

        const normalized = normalizeStatus(status);

        const labels = {
            pending: "Pending",
            submitted: "Submitted",
            confirmed: "Confirmed",
            ticketed: "Ticketed",
            cancelled: "Cancelled",
            expired: "Expired"
        };

        elements.status.textContent =
            labels[String(status || "").toLowerCase()] ||
            String(status || "Unknown");

        elements.status.className =
            `booking-status ${normalized}`;
    }

    /* =====================================
       PASSENGER TABLE
    ===================================== */

    function createCell(value) {
        const cell = document.createElement("td");

        cell.textContent =
            value === null ||
            value === undefined ||
            value === ""
                ? "—"
                : String(value);

        return cell;
    }

    function renderPassengers(passengers) {
        if (!elements.passengerBody) return;

        elements.passengerBody.replaceChildren();

        if (!passengers || passengers.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.textContent =
                "No passenger information found.";

            row.appendChild(cell);
            elements.passengerBody.appendChild(row);

            return;
        }

        passengers.forEach((passenger, index) => {
            const row = document.createElement("tr");

            row.appendChild(createCell(index + 1));
            row.appendChild(createCell(passenger.passenger_name));
            row.appendChild(createCell(passenger.passport_number));
            row.appendChild(createCell(formatDate(passenger.date_of_birth)));
            row.appendChild(createCell(passenger.passenger_type));

            elements.passengerBody.appendChild(row);
        });
    }

    /* =====================================
       LOAD BOOKING
    ===================================== */

    async function loadBooking() {
        if (!client) {
            showMessage(
                "Supabase connection is unavailable. Please check your configuration."
            );
            return;
        }

        if (!bookingId) {
            showMessage("Booking ID is missing.");
            return;
        }

        try {
            clearMessage();

            showMessage(
                "Loading booking details...",
                "success"
            );

            /* ---------------------------------
               1. BOOKING
            --------------------------------- */

            const {
                data: booking,
                error: bookingError
            } = await client
                .from("bookings")
                .select(`
                    id,
                    booking_reference,
                    customer_id,
                    agency_id,
                    booking_status,
                    booking_date,
                    travel_date,
                    origin,
                    destination,
                    passenger_count,
                    quoted_amount,
                    advance_amount,
                    notes,
                    converted_sale_id,
                    created_at
                `)
                .eq("id", bookingId)
                .maybeSingle();

            if (bookingError) throw bookingError;

            if (!booking) {
                showMessage("Booking not found.");
                return;
            }

            currentBooking = booking;

            /* ---------------------------------
               2. CUSTOMER
            --------------------------------- */

            const {
                data: customer,
                error: customerError
            } = await client
                .from("customers")
                .select(`
                    id,
                    full_name,
                    phone,
                    email
                `)
                .eq("id", booking.customer_id)
                .maybeSingle();

            if (customerError) throw customerError;

            /* ---------------------------------
               3. SOURCE AGENCY
            --------------------------------- */

            let agency = null;

            if (booking.agency_id) {
                const {
                    data,
                    error
                } = await client
                    .from("agencies")
                    .select("id, agency_name")
                    .eq("id", booking.agency_id)
                    .maybeSingle();

                if (error) throw error;

                agency = data;
            }

            /* ---------------------------------
               4. PASSENGERS
            --------------------------------- */

            const {
                data: passengers,
                error: passengerError
            } = await client
                .from("booking_passengers")
                .select(`
                    id,
                    passenger_name,
                    passport_number,
                    date_of_birth,
                    passenger_type,
                    created_at
                `)
                .eq("booking_id", bookingId)
                .order("created_at", {
                    ascending: true
                });

            if (passengerError) throw passengerError;

            /* ---------------------------------
               5. BOOKING INFORMATION
            --------------------------------- */

            setText(
                elements.reference,
                booking.booking_reference
                    ? `Booking Reference: ${booking.booking_reference}`
                    : "Booking Reference: —"
            );

            setText(elements.bookingId, booking.id);

            setText(
                elements.bookingDate,
                formatDate(booking.booking_date)
            );

            setText(
                elements.travelDate,
                formatDate(booking.travel_date)
            );

            setText(
                elements.agency,
                agency?.agency_name,
                "No source agency"
            );

            setText(
                elements.createdAt,
                formatDateTime(booking.created_at)
            );

            /* ---------------------------------
               6. BOOKING AMOUNTS
            --------------------------------- */

            setText(
                elements.quotedAmount,
                formatMoney(booking.quoted_amount)
            );

            setText(
                elements.advanceAmount,
                formatMoney(booking.advance_amount)
            );

            /* ---------------------------------
               7. CUSTOMER INFORMATION
            --------------------------------- */

            setText(
                elements.customerName,
                customer?.full_name
            );

            setText(
                elements.customerPhone,
                customer?.phone
            );

            setText(
                elements.customerEmail,
                customer?.email
            );

            /* ---------------------------------
               8. ROUTE
            --------------------------------- */

            setText(
                elements.origin,
                booking.origin
            );

            setText(
                elements.destination,
                booking.destination
            );

            /* ---------------------------------
               9. NOTES
            --------------------------------- */

            setText(
                elements.notes,
                booking.notes,
                "No additional notes."
            );

            /* ---------------------------------
               10. PASSENGER INFORMATION
            --------------------------------- */

            const passengerTotal =
                passengers?.length || 0;

            setText(
                elements.passengerCount,
                `${passengerTotal} Passenger(s)`
            );

            renderPassengers(passengers || []);

            /* ---------------------------------
               11. BOOKING STATUS
            --------------------------------- */

            renderStatus(booking.booking_status);

            /* ---------------------------------
               12. CONVERSION BUTTON
            --------------------------------- */

            if (elements.editButton) {
                elements.editButton.hidden = true;
            }

            const isTicketed =
                String(booking.booking_status || "")
                    .toLowerCase() === "ticketed";

            const alreadyConverted =
                Boolean(booking.converted_sale_id);

            if (elements.convertButton) {
                elements.convertButton.hidden =
                    !isTicketed || alreadyConverted;

                elements.convertButton.disabled = false;

                elements.convertButton.textContent =
                    "Convert to Ticket Sale";
            }

            if (alreadyConverted) {
                showMessage(
                    "This booking has already been converted into a ticket sale.",
                    "success"
                );
            } else {
                clearMessage();
            }

        } catch (error) {
            console.error(
                "Booking details loading error:",
                error
            );

            showMessage(
                error.message ||
                "Unable to load booking details."
            );
        }
    }

    /* =====================================
       CONVERT BOOKING TO TICKET SALE
    ===================================== */

    async function convertBooking() {
        if (isConverting) return;

        if (!client || !currentBooking) {
            showMessage(
                "Booking information is not available."
            );
            return;
        }

        if (currentBooking.converted_sale_id) {
            showMessage(
                "This booking has already been converted."
            );
            return;
        }

        const status = String(
            currentBooking.booking_status || ""
        ).toLowerCase();

        if (status !== "ticketed") {
            showMessage(
                "Only ticketed bookings can be converted into ticket sales."
            );
            return;
        }

        const confirmed = window.confirm(
            "Convert this ticketed booking into a ticket sale?"
        );

        if (!confirmed) return;

        isConverting = true;

        if (elements.convertButton) {
            elements.convertButton.disabled = true;
            elements.convertButton.textContent = "Converting...";
        }

        try {
            const {
                data,
                error
            } = await client.functions.invoke(
                "convert-booking-to-sale",
                {
                    body: {
                        booking_id: bookingId
                    }
                }
            );

            if (error) {
                console.error(
                    "Conversion function error:",
                    error
                );

                throw new Error(
                    "Booking conversion could not be completed. Please check the backend function."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message ||
                    data?.error ||
                    "Booking conversion failed."
                );
            }

            const saleId = data.sale_id;

            if (saleId) {
                window.location.href =
                    `sale-details.htm?id=${encodeURIComponent(saleId)}`;

                return;
            }

            showMessage(
                "Booking converted successfully, but the sale reference was not returned.",
                "success"
            );

            await loadBooking();

        } catch (error) {
            console.error(
                "Booking conversion error:",
                error
            );

            showMessage(
                error.message ||
                "Unable to convert booking. Please try again."
            );

        } finally {
            isConverting = false;

            if (elements.convertButton) {
                elements.convertButton.disabled = false;
                elements.convertButton.textContent =
                    "Convert to Ticket Sale";
            }
        }
    }

    /* =====================================
       EVENTS
    ===================================== */

    elements.convertButton?.addEventListener(
        "click",
        convertBooking
    );

    /* =====================================
       INITIALIZE
    ===================================== */

    await loadBooking();

});
