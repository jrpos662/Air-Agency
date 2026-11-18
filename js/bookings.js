
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   BOOKINGS LIST
========================================= */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        const tableBody = document.getElementById("bookings-table-body");
        const searchInput = document.getElementById("booking-search");
        const statusFilter = document.getElementById("status-filter");
        const searchButton = document.getElementById("search-button");
        const resetButton = document.getElementById("reset-button");
        const refreshButton = document.getElementById("refresh-button");
        const newBookingButton = document.getElementById("new-booking-button");
        const previousButton = document.getElementById("previous-page");
        const nextButton = document.getElementById("next-page");
        const pageInfo = document.getElementById("page-info");
        const bookingCount = document.getElementById("booking-count");
        const messageBox = document.getElementById("booking-message");

        const PAGE_SIZE = 10;

        let currentPage = 1;
        let totalBookings = 0;
        let isLoading = false;

        /* =====================================
           MESSAGE
        ===================================== */

        function showMessage(message, type = "info") {
            if (!messageBox) return;

            messageBox.textContent = message;
            messageBox.className = `alert alert-${type}`;
            messageBox.hidden = false;
        }

        function hideMessage() {
            if (!messageBox) return;

            messageBox.hidden = true;
            messageBox.textContent = "";
        }

        /* =====================================
           HELPERS
        ===================================== */

        function escapeHTML(value) {
            return String(value ?? "").replace(/[&<>"']/g, function (char) {
                const entities = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;"
                };

                return entities[char];
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

        function formatStatus(status) {
            const labels = {
                pending: "Pending",
                submitted: "Submitted",
                confirmed: "Confirmed",
                issued: "Issued",
                ticket_issued: "Issued",
                cancelled: "Cancelled",
                refunded: "Refunded"
            };

            return labels[status] ||
                String(status || "Unknown")
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, letter => letter.toUpperCase());
        }

        function statusClass(status) {
            const classes = {
                pending: "status-pending",
                submitted: "status-submitted",
                confirmed: "status-confirmed",
                issued: "status-issued",
                ticket_issued: "status-issued",
                cancelled: "status-cancelled",
                refunded: "status-cancelled"
            };

            return classes[String(status || "").toLowerCase()] ||
                "status-pending";
        }

        /* =====================================
           RENDER BOOKINGS
        ===================================== */

        function renderBookings(bookings) {
            if (!tableBody) return;

            if (!bookings.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="table-empty">
                            No bookings found.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = bookings.map(function (booking) {
                const bookingId = escapeHTML(booking.id);

                const reference = escapeHTML(
                    booking.booking_reference ||
                    String(booking.id || "").slice(0, 8).toUpperCase()
                );

                const route = [
                    booking.origin,
                    booking.destination
                ]
                    .filter(Boolean)
                    .map(escapeHTML)
                    .join(" → ");

                const status = String(
                    booking.booking_status || ""
                ).toLowerCase();

                return `
                    <tr>
                        <td>#${reference}</td>

                        <td>${formatDate(booking.booking_date)}</td>

                        <td>${formatDate(booking.travel_date)}</td>

                        <td>${route || "—"}</td>

                        <td>
                            <span class="booking-status ${statusClass(status)}">
                                ${escapeHTML(formatStatus(status))}
                            </span>
                        </td>

                        <td>
                            <button
                                type="button"
                                class="booking-action"
                                data-booking-id="${bookingId}"
                            >
                                View Details
                            </button>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        /* =====================================
           PAGINATION
        ===================================== */

        function updatePagination() {
            const totalPages = Math.max(
                1,
                Math.ceil(totalBookings / PAGE_SIZE)
            );

            if (pageInfo) {
                pageInfo.textContent =
                    `Page ${currentPage} of ${totalPages}`;
            }

            if (previousButton) {
                previousButton.disabled =
                    isLoading || currentPage <= 1;
            }

            if (nextButton) {
                nextButton.disabled =
                    isLoading || currentPage >= totalPages;
            }

            if (bookingCount) {
                bookingCount.textContent =
                    `${totalBookings} booking(s) found`;
            }
        }

        /* =====================================
           LOAD BOOKINGS FROM SUPABASE
        ===================================== */

        async function loadBookings() {
            if (isLoading || !tableBody) return;

            const client = window.supabaseClient;

            if (!client) {
                showMessage(
                    "Supabase is not initialized. Please check your configuration.",
                    "error"
                );

                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="table-empty">
                            Unable to connect to the database.
                        </td>
                    </tr>
                `;

                return;
            }

            isLoading = true;
            hideMessage();

            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        Loading bookings...
                    </td>
                </tr>
            `;

            updatePagination();

            try {
                const from = (currentPage - 1) * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;

                let query = client
                    .from("bookings")
                    .select(`
                        id,
                        booking_reference,
                        booking_date,
                        travel_date,
                        origin,
                        destination,
                        booking_status,
                        created_at
                    `, {
                        count: "exact"
                    });

                const search = searchInput?.value.trim();

                if (search) {
                    const safeSearch = search.replace(/[,%()]/g, " ");

                    query = query.or(
                        `booking_reference.ilike.%${safeSearch}%,origin.ilike.%${safeSearch}%,destination.ilike.%${safeSearch}%`
                    );
                }

                const selectedStatus = statusFilter?.value;

                if (selectedStatus) {
                    query = query.eq(
                        "booking_status",
                        selectedStatus
                    );
                }

                const { data, error, count } = await query
                    .order("created_at", {
                        ascending: false
                    })
                    .range(from, to);

                if (error) {
                    throw error;
                }

                totalBookings = count || 0;

                renderBookings(data || []);
                updatePagination();

            } catch (error) {
                console.error("Booking loading error:", error);

                showMessage(
                    error.message ||
                    "Failed to load bookings. Please check database permissions.",
                    "error"
                );

                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="table-empty">
                            Failed to load bookings.
                        </td>
                    </tr>
                `;

                totalBookings = 0;

            } finally {
                isLoading = false;
                updatePagination();
            }
        }

        /* =====================================
           SEARCH AND FILTER
        ===================================== */

        function applySearch() {
            currentPage = 1;
            loadBookings();
        }

        searchButton?.addEventListener("click", applySearch);

        searchInput?.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                applySearch();
            }
        });

        statusFilter?.addEventListener("change", applySearch);

        resetButton?.addEventListener("click", function () {
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "";

            currentPage = 1;
            loadBookings();
        });

        refreshButton?.addEventListener("click", function () {
            loadBookings();
        });

        /* =====================================
           PAGINATION EVENTS
        ===================================== */

        previousButton?.addEventListener("click", function () {
            if (currentPage > 1 && !isLoading) {
                currentPage--;
                loadBookings();
            }
        });

        nextButton?.addEventListener("click", function () {
            const totalPages = Math.ceil(
                totalBookings / PAGE_SIZE
            );

            if (
                currentPage < totalPages &&
                !isLoading
            ) {
                currentPage++;
                loadBookings();
            }
        });

        /* =====================================
           NEW BOOKING
        ===================================== */

        newBookingButton?.addEventListener("click", function () {
            window.location.href = "new-booking.html";
        });

        /* =====================================
           BOOKING DETAILS
        ===================================== */

        tableBody?.addEventListener("click", function (event) {
            const button = event.target.closest("[data-booking-id]");

            if (!button) return;

            const bookingId = button.dataset.bookingId;

            if (!bookingId) return;

            const params = new URLSearchParams({
                id: bookingId
            });

            window.location.href =
                `booking-details.html?${params.toString()}`;
        });

        /* =====================================
           INITIAL LOAD
        ===================================== */

        loadBookings();
    });

})();
