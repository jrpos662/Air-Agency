
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const client = window.supabaseClient;
    const MAX_PASSENGERS = 20;

    const form = document.getElementById("new-ticket-sale-form");
    const passengerList = document.getElementById("sale-passenger-list");

    const elements = {
        customer: document.getElementById("customer-id"),
        customerPhone: document.getElementById("customer-phone"),
        customerEmail: document.getElementById("customer-email"),
        saleDate: document.getElementById("sale-date"),
        agency: document.getElementById("agency-id"),
        pnr: document.getElementById("pnr"),
        origin: document.getElementById("origin"),
        destination: document.getElementById("destination"),
        travelDate: document.getElementById("travel-date"),
        airline: document.getElementById("airline"),
        sellingTotal: document.getElementById("selling-total"),
        discount: document.getElementById("discount-amount"),
        initialPayment: document.getElementById("initial-payment"),
        paymentMethod: document.getElementById("payment-method"),
        paymentReference: document.getElementById("payment-reference"),
        notes: document.getElementById("sale-notes"),
        addPassenger: document.getElementById("add-sale-passenger-button"),
        saveButton: document.getElementById("save-ticket-sale-button"),
        message: document.getElementById("new-sale-message")
    };

    let customers = [];
    let passengerCounter = 1;
    let isSubmitting = false;
    let currentRole = "";
    let canViewPurchasePrice = false;

    function showMessage(message, type = "error") {
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.className = `new-sale-message ${type}`;
    }

    function clearMessage() {
        if (!elements.message) return;

        elements.message.textContent = "";
        elements.message.className = "new-sale-message";
    }

    function localDate() {
        const date = new Date();

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function setDefaultDate() {
        if (elements.saleDate && !elements.saleDate.value) {
            elements.saleDate.value = localDate();
        }
    }

    function createOption(value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }

    function getNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : NaN;
    }

    async function initializeUser() {
        if (!window.AuthManager) {
            throw new Error("Authentication module is not available.");
        }

        await window.AuthManager.initialize();

        const user = await window.AuthManager.getCurrentUser();

        if (!user) {
            throw new Error("Please sign in again.");
        }

        const { data: profile, error } = await client
            .from("profiles")
            .select("role, is_active")
            .eq("id", user.id)
            .single();

        if (error) throw error;

        if (!profile || profile.is_active !== true) {
            throw new Error("Your account is inactive.");
        }

        currentRole = String(profile.role || "").toLowerCase();

        canViewPurchasePrice = [
            "owner",
            "manager"
        ].includes(currentRole);
    }

    async function loadCustomers() {
        const { data, error } = await client
            .from("customers")
            .select("id, full_name, phone, email")
            .order("full_name", { ascending: true });

        if (error) throw error;

        customers = data || [];

        elements.customer.replaceChildren(
            createOption("", "Select Customer")
        );

        customers.forEach(customer => {
            elements.customer.appendChild(
                createOption(customer.id, customer.full_name)
            );
        });
    }

    async function loadAgencies() {
        const { data, error } = await client
            .from("agencies")
            .select("id, agency_name")
            .eq("is_active", true)
            .order("agency_name", { ascending: true });

        if (error) throw error;

        elements.agency.replaceChildren(
            createOption("", "Select Source Agency")
        );

        (data || []).forEach(agency => {
            elements.agency.appendChild(
                createOption(agency.id, agency.agency_name)
            );
        });
    }

    function updateCustomerInformation() {
        const customer = customers.find(
            item => item.id === elements.customer.value
        );

        if (elements.customerPhone) {
            elements.customerPhone.value = customer?.phone || "";
        }

        if (elements.customerEmail) {
            elements.customerEmail.value = customer?.email || "";
        }
    }

    function addPurchasePriceField(card) {
        if (!canViewPurchasePrice) return;

        const grid = card.querySelector(".form-grid");
        if (!grid || grid.querySelector('[name="purchase_price"]')) return;

        const group = document.createElement("div");
        group.className = "form-group purchase-price-field";

        const label = document.createElement("label");
        label.textContent = "Purchase Price (BDT) *";

        const input = document.createElement("input");
        input.type = "number";
        input.name = "purchase_price";
        input.min = "0";
        input.step = "0.01";
        input.required = true;
        input.placeholder = "Agency cost";

        label.htmlFor = `passenger-${passengerCounter}-purchase-price`;
        input.id = label.htmlFor;

        group.append(label, input);
        grid.appendChild(group);
    }

    function updatePassengerLabels() {
        const cards = [
            ...passengerList.querySelectorAll("[data-passenger]")
        ];

        cards.forEach((card, index) => {
            const heading = card.querySelector(
                ".passenger-card-heading strong"
            );

            const removeButton = card.querySelector(
                ".remove-sale-passenger-button"
            );

            if (heading) {
                heading.textContent = `Passenger ${index + 1}`;
            }

            if (removeButton) {
                removeButton.hidden = cards.length <= 1;
            }
        });
    }

    function attachRemoveButton(card) {
        const removeButton = card.querySelector(
            ".remove-sale-passenger-button"
        );

        if (!removeButton) return;

        removeButton.addEventListener("click", () => {
            if (
                passengerList.querySelectorAll("[data-passenger]").length <= 1
            ) {
                return;
            }

            card.remove();
            updatePassengerLabels();
            clearMessage();
        });
    }

    function prepareExistingPassenger() {
        const firstCard = passengerList.querySelector("[data-passenger]");

        if (!firstCard) return;

        attachRemoveButton(firstCard);
        addPurchasePriceField(firstCard);
        updatePassengerLabels();
    }

    function createPassengerCard() {
        const card = document.createElement("div");

        card.className = "sale-passenger-card";
        card.dataset.passenger = "";

        const heading = document.createElement("div");
        heading.className = "passenger-card-heading";

        const title = document.createElement("strong");
        title.textContent = "Passenger";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-sale-passenger-button";
        removeButton.textContent = "Remove";

        heading.append(title, removeButton);

        const grid = document.createElement("div");
        grid.className = "form-grid";

        const fields = [
            {
                label: "Full Name *",
                name: "full_name",
                type: "text",
                required: true,
                maxLength: 150,
                placeholder: "Passenger full name"
            },
            {
                label: "Passport Number",
                name: "passport_number",
                type: "text",
                required: false,
                maxLength: 30
            },
            {
                label: "Date of Birth",
                name: "date_of_birth",
                type: "date",
                required: false
            },
            {
                label: "Passenger Type *",
                name: "passenger_type",
                type: "select",
                required: true
            },
            {
                label: "Ticket Number",
                name: "ticket_number",
                type: "text",
                required: false,
                maxLength: 50
            }
        ];

        fields.forEach(field => {
            const group = document.createElement("div");
            group.className = "form-group";

            const label = document.createElement("label");
            label.textContent = field.label;

            let input;

            if (field.type === "select") {
                input = document.createElement("select");

                input.append(
                    createOption("adult", "Adult"),
                    createOption("child", "Child"),
                    createOption("infant", "Infant")
                );
            } else {
                input = document.createElement("input");
                input.type = field.type;
                input.placeholder = field.placeholder || "";
                input.maxLength = field.maxLength || 100;
            }

            input.name = field.name;
            input.required = field.required;

            label.htmlFor =
                `passenger-${passengerCounter}-${field.name}`;

            input.id = label.htmlFor;

            group.append(label, input);
            grid.appendChild(group);
        });

        card.append(heading, grid);

        addPurchasePriceField(card);

        passengerCounter++;

        attachRemoveButton(card);

        return card;
    }

    function addPassenger() {
        const count = passengerList.querySelectorAll(
            "[data-passenger]"
        ).length;

        if (count >= MAX_PASSENGERS) {
            showMessage(
                `A maximum of ${MAX_PASSENGERS} passengers is allowed.`
            );
            return;
        }

        passengerList.appendChild(createPassengerCard());

        updatePassengerLabels();
        clearMessage();
    }

    function collectPassengers() {
        const cards = [
            ...passengerList.querySelectorAll("[data-passenger]")
        ];

        return cards.map(card => {
            const getValue = name => {
                return (
                    card.querySelector(`[name="${name}"]`)
                        ?.value.trim() || ""
                );
            };

            const purchaseInput = card.querySelector(
                '[name="purchase_price"]'
            );

            return {
                full_name: getValue("full_name"),
                passport_number: getValue("passport_number") || null,
                date_of_birth: getValue("date_of_birth") || null,
                passenger_type: getValue("passenger_type"),
                ticket_number: getValue("ticket_number") || null,

                purchase_price: canViewPurchasePrice
                    ? getNumber(purchaseInput?.value)
                    : null
            };
        });
    }

    function buildPayload() {
        return {
            customer_id: elements.customer.value,
            agency_id: elements.agency.value,

            sale_date: elements.saleDate.value,
            travel_date: elements.travelDate.value,

            origin: elements.origin.value.trim(),
            destination: elements.destination.value.trim(),

            pnr: elements.pnr.value.trim() || null,
            airline: elements.airline.value.trim() || null,

            selling_total: getNumber(elements.sellingTotal.value),
            discount_amount: getNumber(elements.discount.value || 0),

            initial_payment: getNumber(
                elements.initialPayment.value || 0
            ),

            payment_method: elements.paymentMethod.value || null,
            payment_reference:
                elements.paymentReference.value.trim() || null,

            notes: elements.notes.value.trim() || null,

            passengers: collectPassengers()
        };
    }

    function validateSale(payload) {
        if (!payload.customer_id) {
            throw new Error("Please select a customer.");
        }

        if (!payload.agency_id) {
            throw new Error("Please select a source agency.");
        }

        if (!payload.sale_date || !payload.travel_date) {
            throw new Error("Sale date and travel date are required.");
        }

        if (!payload.origin || !payload.destination) {
            throw new Error("Origin and destination are required.");
        }

        if (
            payload.origin.toLowerCase() ===
            payload.destination.toLowerCase()
        ) {
            throw new Error("Origin and destination cannot be the same.");
        }

        if (
            !payload.passengers.length ||
            payload.passengers.length > MAX_PASSENGERS
        ) {
            throw new Error("Invalid passenger count.");
        }

        for (const passenger of payload.passengers) {
            if (!passenger.full_name) {
                throw new Error("Every passenger must have a full name.");
            }

            if (
                !["adult", "child", "infant"].includes(
                    passenger.passenger_type
                )
            ) {
                throw new Error("Invalid passenger type.");
            }

            if (canViewPurchasePrice) {
                if (
                    !Number.isFinite(passenger.purchase_price) ||
                    passenger.purchase_price < 0
                ) {
                    throw new Error(
                        "Enter a valid purchase price for every passenger."
                    );
                }
            }
        }

        const sellingTotal = payload.selling_total;
        const discount = payload.discount_amount;
        const payment = payload.initial_payment;

        if (!Number.isFinite(sellingTotal) || sellingTotal <= 0) {
            throw new Error("Enter a valid selling amount.");
        }

        if (!Number.isFinite(discount) || discount < 0) {
            throw new Error("Enter a valid discount amount.");
        }

        if (discount > sellingTotal) {
            throw new Error("Discount cannot exceed the selling amount.");
        }

        const netSellingAmount = sellingTotal - discount;

        if (!Number.isFinite(payment) || payment < 0) {
            throw new Error("Enter a valid initial payment.");
        }

        if (payment > netSellingAmount) {
            throw new Error(
                "Initial payment cannot exceed the amount after discount."
            );
        }

        if (payment > 0 && !payload.payment_method) {
            throw new Error(
                "Select a payment method for the initial payment."
            );
        }

        if (payment === 0) {
            payload.payment_method = null;
            payload.payment_reference = null;
        }

        if (payment > 0 && payload.payment_method === "bank") {
            throw new Error(
                "Bank payment is not available in this form yet. " +
                "Use the Customer Payments page to select a bank account."
            );
        }

        return true;
    }

    async function submitSale(event) {
        event.preventDefault();

        if (isSubmitting) return;

        clearMessage();

        try {
            if (!client) {
                throw new Error("Supabase connection is not available.");
            }

            const payload = buildPayload();

            validateSale(payload);

            const confirmed = window.confirm(
                "Are you sure you want to create this ticket sale?"
            );

            if (!confirmed) return;

            isSubmitting = true;

            elements.saveButton.disabled = true;
            elements.saveButton.textContent = "Saving...";

            const { data, error } = await client.functions.invoke(
                "create-ticket-sale",
                {
                    body: payload
                }
            );

            if (error) {
                throw error;
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Ticket sale creation failed."
                );
            }

            showMessage(
                "Ticket sale created successfully.",
                "success"
            );

            window.setTimeout(() => {
                window.location.href = "ticket-sales.html";
            }, 1000);

        } catch (error) {
            console.error("Ticket sale creation error:", error);

            showMessage(
                error.message ||
                "Unable to create ticket sale. Please try again.",
                "error"
            );

        } finally {
            isSubmitting = false;

            if (elements.saveButton) {
                elements.saveButton.disabled = false;
                elements.saveButton.textContent = "Save Ticket Sale";
            }
        }
    }

    async function initialize() {
        try {
            if (!client) {
                throw new Error(
                    "Supabase connection is not available. " +
                    "Check Supabase configuration."
                );
            }

            if (!form || !passengerList) {
                throw new Error("Ticket sale form could not be loaded.");
            }

            await initializeUser();

            setDefaultDate();

            prepareExistingPassenger();

            await Promise.all([
                loadCustomers(),
                loadAgencies()
            ]);

            updateCustomerInformation();

        } catch (error) {
            console.error("New ticket sale initialization:", error);

            showMessage(
                error.message ||
                "Unable to initialize the ticket sale form."
            );

            if (elements.saveButton) {
                elements.saveButton.disabled = true;
            }
        }
    }

    elements.customer?.addEventListener(
        "change",
        updateCustomerInformation
    );

    elements.addPassenger?.addEventListener(
        "click",
        addPassenger
    );

    form?.addEventListener("submit", submitSale);

    initialize();
});
