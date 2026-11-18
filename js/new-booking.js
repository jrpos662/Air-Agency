
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   CREATE NEW BOOKING
========================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================
       DOM ELEMENTS
    ===================================== */

    const form = document.getElementById("new-booking-form");
    const customerSelect = document.getElementById("customer-id");
    const agencySelect = document.getElementById("agency-id");
    const passengerList = document.getElementById("passenger-list");
    const addPassengerButton = document.getElementById("add-passenger-button");
    const saveButton = document.getElementById("save-booking-button");
    const messageBox = document.getElementById("new-booking-message");

    const bookingDateInput = document.getElementById("booking-date");
    const travelDateInput = document.getElementById("travel-date");
    const quotedAmountInput = document.getElementById("quoted-amount");

    /* =====================================
       CONFIGURATION
    ===================================== */

    const MAX_PASSENGERS = 20;
    const MAX_NOTES_LENGTH = 2000;
    const MAX_AMOUNT = 999999999999;

    let isSaving = false;

    /* =====================================
       REQUIRED ELEMENT CHECK
    ===================================== */

    if (
        !form ||
        !customerSelect ||
        !agencySelect ||
        !passengerList ||
        !addPassengerButton ||
        !saveButton ||
        !bookingDateInput ||
        !travelDateInput ||
        !quotedAmountInput
    ) {
        console.error(
            "New booking page: Required HTML elements are missing."
        );
        return;
    }

    /* =====================================
       SUPABASE
    ===================================== */

    function getSupabase() {
        return window.supabaseClient || null;
    }

    /* =====================================
       MESSAGE HELPERS
    ===================================== */

    function showMessage(message, type = "info") {
        if (!messageBox) {
            alert(message);
            return;
        }

        messageBox.textContent = message;
        messageBox.className = `alert alert-${type}`;
        messageBox.hidden = false;

        messageBox.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }

    function hideMessage() {
        if (!messageBox) return;

        messageBox.hidden = true;
        messageBox.textContent = "";
    }

    /* =====================================
       DATE HELPERS
    ===================================== */

    function getLocalDate() {
        const now = new Date();

        return new Date(
            now.getTime() -
            now.getTimezoneOffset() * 60000
        ).toISOString().slice(0, 10);
    }

    function setTodayAsBookingDate() {
        bookingDateInput.value = getLocalDate();
    }

    /* =====================================
       SELECT HELPERS
    ===================================== */

    function setLoadingOption(select, text) {
        select.innerHTML = "";

        const option = document.createElement("option");
        option.value = "";
        option.textContent = text;

        select.appendChild(option);
    }

    /* =====================================
       LOAD CUSTOMERS
       Schema: customers.id, full_name, phone
    ===================================== */

    async function loadCustomers() {
        const client = getSupabase();

        if (!client) {
            setLoadingOption(
                customerSelect,
                "Supabase unavailable"
            );
            return;
        }

        setLoadingOption(
            customerSelect,
            "Loading customers..."
        );

        try {
            const { data, error } = await client
                .from("customers")
                .select("id, full_name, phone")
                .order("full_name", {
                    ascending: true
                })
                .limit(1000);

            if (error) throw error;

            customerSelect.innerHTML =
                '<option value="">Select a customer</option>';

            if (!data || data.length === 0) {
                setLoadingOption(
                    customerSelect,
                    "No customers found"
                );
                return;
            }

            data.forEach(customer => {
                const option = document.createElement("option");

                option.value = customer.id;

                option.textContent =
                    `${customer.full_name || "Unnamed customer"}` +
                    (
                        customer.phone
                            ? ` - ${customer.phone}`
                            : ""
                    );

                customerSelect.appendChild(option);
            });

        } catch (error) {
            console.error(
                "Customer loading error:",
                error
            );

            setLoadingOption(
                customerSelect,
                "Unable to load customers"
            );

            showMessage(
                "Unable to load customers. Please check your database connection and permissions.",
                "error"
            );
        }
    }

    /* =====================================
       LOAD AGENCIES
       Schema: agencies.id, agency_name, is_active
    ===================================== */

    async function loadAgencies() {
        const client = getSupabase();

        if (!client) {
            setLoadingOption(
                agencySelect,
                "Supabase unavailable"
            );
            return;
        }

        setLoadingOption(
            agencySelect,
            "Loading agencies..."
        );

        try {
            const { data, error } = await client
                .from("agencies")
                .select("id, agency_name")
                .eq("is_active", true)
                .order("agency_name", {
                    ascending: true
                })
                .limit(1000);

            if (error) throw error;

            agencySelect.innerHTML =
                '<option value="">Select source agency (Optional)</option>';

            (data || []).forEach(agency => {
                const option = document.createElement("option");

                option.value = agency.id;
                option.textContent =
                    agency.agency_name || "Unnamed agency";

                agencySelect.appendChild(option);
            });

        } catch (error) {
            console.error(
                "Agency loading error:",
                error
            );

            setLoadingOption(
                agencySelect,
                "Unable to load agencies"
            );

            showMessage(
                "Unable to load agencies. Please check your database connection and permissions.",
                "error"
            );
        }
    }

    /* =====================================
       PASSENGER CARD
    ===================================== */

    function createPassengerCard() {
        const card = document.createElement("div");

        card.className = "passenger-card";
        card.setAttribute("data-passenger", "");

        card.innerHTML = `
            <div class="passenger-card-heading">
                <h4>Passenger</h4>
                <span class="passenger-number"></span>
            </div>

            <div class="form-grid">

                <div class="form-group full-width">
                    <label>
                        Full Name <span class="required">*</span>
                    </label>

                    <input
                        type="text"
                        name="full_name"
                        placeholder="Passenger full name"
                        maxlength="150"
                        autocomplete="off"
                        required
                    >
                </div>

                <div class="form-group">
                    <label>Passport Number</label>

                    <input
                        type="text"
                        name="passport_number"
                        placeholder="Passport number"
                        maxlength="30"
                    >
                </div>

                <div class="form-group">
                    <label>Date of Birth</label>

                    <input
                        type="date"
                        name="date_of_birth"
                    >
                </div>

                <div class="form-group">
                    <label>Passenger Type</label>

                    <select name="passenger_type">
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                        <option value="infant">Infant</option>
                    </select>
                </div>

            </div>
        `;

        return card;
    }

    /* =====================================
       UPDATE PASSENGER NUMBERS
    ===================================== */

    function updatePassengerNumbers() {
        const cards = passengerList.querySelectorAll(
            "[data-passenger]"
        );

        cards.forEach((card, index) => {
            const heading = card.querySelector("h4");
            const number = card.querySelector(
                ".passenger-number"
            );

            if (heading) {
                heading.textContent =
                    `Passenger ${index + 1}`;
            }

            if (number) {
                number.textContent =
                    String(index + 1).padStart(2, "0");
            }

            let removeButton = card.querySelector(
                ".remove-passenger-button"
            );

            if (cards.length > 1 && !removeButton) {
                removeButton = document.createElement("button");

                removeButton.type = "button";
                removeButton.className =
                    "remove-passenger-button";

                removeButton.textContent = "Remove";

                removeButton.setAttribute(
                    "aria-label",
                    "Remove passenger"
                );

                card.querySelector(
                    ".passenger-card-heading"
                )?.appendChild(removeButton);
            }

            if (cards.length === 1 && removeButton) {
                removeButton.remove();
            }
        });

        addPassengerButton.disabled =
            cards.length >= MAX_PASSENGERS;

        addPassengerButton.textContent =
            cards.length >= MAX_PASSENGERS
                ? "Maximum Passengers Reached"
                : "+ Add Passenger";
    }

    /* =====================================
       ADD PASSENGER
    ===================================== */

    function addPassenger() {
        const count = passengerList.querySelectorAll(
            "[data-passenger]"
        ).length;

        if (count >= MAX_PASSENGERS) {
            showMessage(
                `A booking can contain a maximum of ${MAX_PASSENGERS} passengers.`,
                "warning"
            );
            return;
        }

        passengerList.appendChild(
            createPassengerCard()
        );

        updatePassengerNumbers();
    }

    /* =====================================
       COLLECT PASSENGERS
    ===================================== */

    function collectPassengers() {
        const cards = passengerList.querySelectorAll(
            "[data-passenger]"
        );

        return Array.from(cards).map(card => ({
            full_name:
                card.querySelector(
                    '[name="full_name"]'
                )?.value.trim() || "",

            passport_number:
                card.querySelector(
                    '[name="passport_number"]'
                )?.value.trim() || null,

            date_of_birth:
                card.querySelector(
                    '[name="date_of_birth"]'
                )?.value || null,

            passenger_type:
                card.querySelector(
                    '[name="passenger_type"]'
                )?.value || "adult"
        }));
    }

    /* =====================================
       VALIDATE FORM
    ===================================== */

    function validateForm(passengers) {
        const bookingDate = bookingDateInput.value;
        const travelDate = travelDateInput.value;

        const origin =
            document.getElementById("origin")
                ?.value.trim() || "";

        const destination =
            document.getElementById("destination")
                ?.value.trim() || "";

        const notes =
            document.getElementById("booking-notes")
                ?.value || "";

        const quotedAmount =
            quotedAmountInput.value.trim();

        if (!customerSelect.value) {
            showMessage(
                "Please select a customer.",
                "warning"
            );

            customerSelect.focus();
            return false;
        }

        if (!bookingDate) {
            showMessage(
                "Please select a booking date.",
                "warning"
            );

            bookingDateInput.focus();
            return false;
        }

        if (
            travelDate &&
            travelDate < bookingDate
        ) {
            showMessage(
                "Travel date cannot be earlier than booking date.",
                "warning"
            );

            travelDateInput.focus();
            return false;
        }

        if (!origin || !destination) {
            showMessage(
                "Please enter both origin and destination.",
                "warning"
            );

            return false;
        }

        if (
            origin.toLowerCase() ===
            destination.toLowerCase()
        ) {
            showMessage(
                "Origin and destination cannot be the same.",
                "warning"
            );

            return false;
        }

        if (
            origin.length > 150 ||
            destination.length > 150
        ) {
            showMessage(
                "Origin and destination must not exceed 150 characters.",
                "warning"
            );

            return false;
        }

        if (
            quotedAmount === "" ||
            !Number.isFinite(Number(quotedAmount)) ||
            Number(quotedAmount) < 0 ||
            Number(quotedAmount) > MAX_AMOUNT
        ) {
            showMessage(
                "Please enter a valid quoted amount.",
                "warning"
            );

            quotedAmountInput.focus();
            return false;
        }

        if (
            !passengers.length ||
            passengers.length > MAX_PASSENGERS
        ) {
            showMessage(
                "Please check passenger information.",
                "warning"
            );

            return false;
        }

        if (
            passengers.some(
                passenger => !passenger.full_name
            )
        ) {
            showMessage(
                "Every passenger must have a full name.",
                "warning"
            );

            return false;
        }

        if (
            passengers.some(
                passenger =>
                    passenger.full_name.length > 150
            )
        ) {
            showMessage(
                "Passenger names must not exceed 150 characters.",
                "warning"
            );

            return false;
        }

        if (notes.length > MAX_NOTES_LENGTH) {
            showMessage(
                "Notes are too long.",
                "warning"
            );

            return false;
        }

        return true;
    }

    /* =====================================
       RESET PASSENGERS
    ===================================== */

    function resetPassengers() {
        passengerList.replaceChildren();

        passengerList.appendChild(
            createPassengerCard()
        );

        updatePassengerNumbers();
    }

    /* =====================================
       SAVE BOOKING
       Edge Function: create-booking
    ===================================== */

    async function submitBooking(event) {
        event.preventDefault();

        if (isSaving) return;

        hideMessage();

        const client = getSupabase();

        if (!client) {
            showMessage(
                "Supabase connection is unavailable.",
                "error"
            );

            return;
        }

        const passengers = collectPassengers();

        if (!validateForm(passengers)) {
            return;
        }

        const quotedAmount =
            Number(quotedAmountInput.value);

        isSaving = true;

        saveButton.disabled = true;
        saveButton.textContent = "Saving Booking...";

        try {
            const {
                data: sessionData,
                error: sessionError
            } = await client.auth.getSession();

            if (sessionError) {
                throw sessionError;
            }

            if (!sessionData?.session) {
                window.location.href = "login.html";
                return;
            }

            const payload = {
                customer_id: customerSelect.value,

                agency_id:
                    agencySelect.value || null,

                booking_date:
                    bookingDateInput.value,

                travel_date:
                    travelDateInput.value || null,

                quoted_amount: quotedAmount,

                origin:
                    document.getElementById("origin")
                        .value.trim(),

                destination:
                    document.getElementById("destination")
                        .value.trim(),

                notes:
                    document.getElementById("booking-notes")
                        ?.value.trim() || null,

                passengers
            };

            const {
                data,
                error
            } = await client.functions.invoke(
                "create-booking",
                {
                    body: payload
                }
            );

            if (error) {
                console.error(
                    "Booking function error:",
                    error
                );

                throw new Error(
                    "Booking could not be saved. Please check the backend function and try again."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.error ||
                    data?.message ||
                    "Booking could not be saved."
                );
            }

            showMessage(
                "Booking created successfully.",
                "success"
            );

            form.reset();

            setTodayAsBookingDate();

            quotedAmountInput.value = "0";

            resetPassengers();

            customerSelect.value = "";
            agencySelect.value = "";

            setTimeout(() => {
                window.location.href = "bookings.html";
            }, 1200);

        } catch (error) {
            console.error(
                "Create booking error:",
                error
            );

            showMessage(
                error.message ||
                "An unexpected error occurred.",
                "error"
            );

        } finally {
            isSaving = false;

            saveButton.disabled = false;
            saveButton.textContent = "Save Booking";
        }
    }

    /* =====================================
       EVENTS
    ===================================== */

    addPassengerButton.addEventListener(
        "click",
        addPassenger
    );

    passengerList.addEventListener(
        "click",
        event => {
            const removeButton =
                event.target.closest(
                    ".remove-passenger-button"
                );

            if (!removeButton) return;

            const card = removeButton.closest(
                "[data-passenger]"
            );

            if (card) {
                card.remove();
                updatePassengerNumbers();
            }
        }
    );

    form.addEventListener(
        "submit",
        submitBooking
    );

    /* =====================================
       INITIALIZE
    ===================================== */

    setTodayAsBookingDate();

    quotedAmountInput.value =
        quotedAmountInput.value || "0";

    updatePassengerNumbers();

    loadCustomers();
    loadAgencies();

});
