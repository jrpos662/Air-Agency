
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("new-customer-form");
    const message = document.getElementById("new-customer-message");
    const saveButton = document.getElementById("save-customer-button");
    const resetButton = document.getElementById("reset-customer-form");

    if (!form || !message || !saveButton) {
        console.error("New Customer form elements are missing.");
        return;
    }

    let isSubmitting = false;

    const getSupabaseClient = () => {
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
    };

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.className = `new-customer-message show ${type}`;
        message.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    function clearMessage() {
        message.textContent = "";
        message.className = "new-customer-message";
    }

    function getValue(name) {
        const field = form.elements.namedItem(name);
        return field ? field.value.trim() : "";
    }

    function isValidBangladeshPhone(phone) {
        const normalized = phone.replace(/[\s-]/g, "");

        return /^(?:\+8801|8801|01)[3-9]\d{8}$/.test(normalized);
    }

    function validateForm() {
        const fullName = getValue("full_name");
        const phone = getValue("phone");
        const email = getValue("email");
        const dob = getValue("date_of_birth");
        const passportExpiry = getValue("passport_expiry");
        const passportNumber = getValue("passport_number");

        if (!fullName) {
            return "Please enter the customer's full name.";
        }

        if (fullName.length < 2) {
            return "Customer name must contain at least 2 characters.";
        }

        if (!phone) {
            return "Please enter the customer's phone number.";
        }

        if (!isValidBangladeshPhone(phone)) {
            return "Please enter a valid Bangladesh mobile number.";
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return "Please enter a valid email address.";
        }

        const today = new Date();
        const todayString = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");

        if (dob && dob > todayString) {
            return "Date of Birth cannot be in the future.";
        }

        if (passportExpiry && passportExpiry < todayString) {
            return "Passport expiry date cannot be in the past.";
        }

        if (passportExpiry && !passportNumber) {
            return "Please enter the passport number.";
        }

        if (passportNumber && !passportExpiry) {
            return "Please enter the passport expiry date.";
        }

        return null;
    }

    function collectCustomerData() {
        const statusValue = getValue("is_active");

        return {
            full_name: getValue("full_name"),
            phone: getValue("phone").replace(/[\s-]/g, ""),
            email: getValue("email") || null,
            gender: getValue("gender") || null,
            address: getValue("address") || null,
            passport_number: getValue("passport_number").toUpperCase() || null,
            passport_expiry: getValue("passport_expiry") || null,
            nationality: getValue("nationality") || "Bangladeshi",
            date_of_birth: getValue("date_of_birth") || null,
            is_active: statusValue === "true",
            notes: getValue("notes") || null
        };
    }

    async function saveCustomer(event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        clearMessage();

        const validationError = validateForm();

        if (validationError) {
            showMessage(validationError);
            return;
        }

        const client = getSupabaseClient();

        if (!client || !client.functions) {
            showMessage(
                "Supabase is not initialized. Please check your configuration and login session."
            );
            return;
        }

        isSubmitting = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const customerData = collectCustomerData();

            const { data, error } = await client.functions.invoke(
                "create-customer",
                {
                    body: customerData
                }
            );

            if (error) {
                console.error("Create customer error:", error);
                throw new Error(
                    error.message || "Unable to create customer."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Customer creation was not confirmed."
                );
            }

            showMessage(
                "Customer created successfully. Redirecting...",
                "success"
            );

            form.reset();

            window.setTimeout(() => {
                window.location.href = "customers.html";
            }, 1200);

        } catch (error) {
            console.error("Customer save failed:", error);

            showMessage(
                error.message || "Something went wrong while saving the customer."
            );

        } finally {
            isSubmitting = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save Customer";
        }
    }

    form.addEventListener("submit", saveCustomer);

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            window.setTimeout(clearMessage, 0);
        });
    }

});
