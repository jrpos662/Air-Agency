
"use strict";

(() => {
    let supabaseClient = null;
    let isSubmitting = false;

    const $ = (id) => document.getElementById(id);

    function showMessage(message, type = "error") {
        const element = $("new-agency-message");

        if (!element) return;

        element.textContent = message;
        element.className = `new-agency-message show ${type}`;
    }

    function clearMessage() {
        const element = $("new-agency-message");

        if (!element) return;

        element.textContent = "";
        element.className = "new-agency-message";
    }

    function getValue(id) {
        return ($(id)?.value || "").trim();
    }

    function normalizePhone(phone) {
        return phone.replace(/[\s()-]/g, "");
    }

    function validatePhone(phone) {
        const normalized = normalizePhone(phone);

        return /^(?:\+?8801|01)[3-9]\d{8}$/.test(normalized);
    }

    function validateEmail(email) {
        if (!email) return true;

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function parseOpeningBalance() {
        const value = getValue("opening-balance");

        if (!value) return 0;

        const amount = Number(value);

        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error("Please enter a valid opening balance.");
        }

        if (Math.round(amount * 100) !== amount * 100) {
            throw new Error(
                "Opening balance cannot have more than two decimal places."
            );
        }

        return amount;
    }

    function validateForm() {
        const name = getValue("agency-name");
        const contactPerson = getValue("contact-person");
        const phone = getValue("agency-phone");
        const email = getValue("agency-email");
        const address = getValue("agency-address");
        const notes = getValue("agency-notes");
        const openingBalanceDate = getValue("opening-balance-date");

        if (!name) {
            throw new Error("Agency name is required.");
        }

        if (name.length < 2) {
            throw new Error("Agency name must contain at least 2 characters.");
        }

        if (!phone) {
            throw new Error("Phone number is required.");
        }

        if (!validatePhone(phone)) {
            throw new Error(
                "Please enter a valid Bangladeshi phone number."
            );
        }

        if (!validateEmail(email)) {
            throw new Error("Please enter a valid email address.");
        }

        const openingBalance = parseOpeningBalance();

        if (openingBalance > 0 && !openingBalanceDate) {
            throw new Error(
                "Please select the opening balance date."
            );
        }

        if (openingBalanceDate) {
            const selectedDate = new Date(
                `${openingBalanceDate}T00:00:00`
            );

            if (Number.isNaN(selectedDate.getTime())) {
                throw new Error("Invalid opening balance date.");
            }

            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (selectedDate > today) {
                throw new Error(
                    "Opening balance date cannot be in the future."
                );
            }
        }

        return {
            name,
            contact_person: contactPerson || null,
            phone: normalizePhone(phone),
            email: email || null,
            address: address || null,
            notes: notes || null,
            is_active: getValue("agency-status") === "true",
            opening_balance: openingBalance,
            opening_balance_date: openingBalance > 0
                ? openingBalanceDate
                : null
        };
    }

    async function initializeSupabase() {
        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            return;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            supabaseClient = await window.AuthManager.initialize();
        }

        if (!supabaseClient) {
            throw new Error("Supabase client is not initialized.");
        }
    }

    async function checkSession() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            window.location.href = "login.html";
            return false;
        }

        return true;
    }

    function setSubmitting(submitting) {
        isSubmitting = submitting;

        const button = $("save-agency-button");

        if (!button) return;

        button.disabled = submitting;

        button.textContent = submitting
            ? "Saving Agency..."
            : "Save Agency";
    }

    async function createAgency(payload) {
        const { data, error } = await supabaseClient.functions.invoke(
            "create-agency",
            {
                body: payload
            }
        );

        if (error) {
            throw new Error(
                error.message || "Unable to connect to the agency service."
            );
        }

        if (!data || data.success !== true) {
            throw new Error(
                data?.error || "Agency could not be created."
            );
        }

        return data;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (isSubmitting) return;

        clearMessage();

        try {
            const payload = validateForm();

            setSubmitting(true);

            const result = await createAgency(payload);

            showMessage(
                result.message || "Agency created successfully.",
                "success"
            );

            const form = $("new-agency-form");

            if (form) form.reset();

            if ($("opening-balance")) {
                $("opening-balance").value = "0";
            }

            setTimeout(() => {
                window.location.href = "agencies.html";
            }, 1200);

        } catch (error) {
            console.error("Create agency error:", error);

            showMessage(
                error.message || "Unable to create agency."
            );

        } finally {
            setSubmitting(false);
        }
    }

    function setupForm() {
        const form = $("new-agency-form");

        if (!form) return;

        form.addEventListener("submit", handleSubmit);

        form.addEventListener("reset", () => {
            clearMessage();

            setTimeout(() => {
                if ($("opening-balance")) {
                    $("opening-balance").value = "0";
                }
            }, 0);
        });

        $("agency-phone")?.addEventListener("blur", () => {
            const phone = getValue("agency-phone");

            if (phone && !validatePhone(phone)) {
                showMessage(
                    "Please check the Bangladeshi phone number format."
                );
            } else {
                clearMessage();
            }
        });

        $("agency-email")?.addEventListener("blur", () => {
            const email = getValue("agency-email");

            if (email && !validateEmail(email)) {
                showMessage("Please enter a valid email address.");
            } else {
                clearMessage();
            }
        });
    }

    async function initializePage() {
        try {
            await initializeSupabase();

            const authenticated = await checkSession();

            if (!authenticated) return;

            setupForm();

        } catch (error) {
            console.error("New agency initialization error:", error);

            showMessage(
                error.message || "Unable to initialize the agency form."
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initializePage);
})();
