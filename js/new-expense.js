
/* ========================================
   New Expense
   Air Ticket Agency Management
======================================== */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {

    const form = document.getElementById("new-expense-form");
    if (!form) return;

    const message = document.getElementById("new-expense-message");

    const expenseDate = document.getElementById("expense-date");
    const expenseCategory = document.getElementById("expense-category");
    const expenseDescription = document.getElementById("expense-description");
    const expenseNotes = document.getElementById("expense-notes");

    const expenseAmount = document.getElementById("expense-amount");
    const paymentMethod = document.getElementById("expense-payment-method");
    const expenseAccount = document.getElementById("expense-account");
    const paymentReference = document.getElementById("expense-payment-reference");

    const totalDisplay = document.getElementById("expense-total-display");

    const saveButton = document.getElementById("save-expense-button");
    const resetButton = document.getElementById("reset-expense-form");

    let supabase = null;
    let categories = [];
    let accounts = [];

    /* ========================================
       Helpers
    ======================================== */

    function showMessage(text, type = "info") {
        if (!message) return;

        message.textContent = text;
        message.className = `new-expense-message ${type}`;
    }

    function clearMessage() {
        if (!message) return;

        message.textContent = "";
        message.className = "new-expense-message";
    }

    function getLocalDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function setLoading(loading) {
        if (!saveButton) return;

        saveButton.disabled = loading;
        saveButton.textContent = loading
            ? "Saving..."
            : "Save Expense";
    }

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

    /* ========================================
       Authentication
    ======================================== */

    async function checkAuthentication() {
        supabase = await getClient();

        if (!supabase || typeof supabase.auth?.getSession !== "function") {
            showMessage(
                "Supabase connection is not configured.",
                "error"
            );
            return false;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
            window.location.href = "login.html";
            return false;
        }

        return true;
    }

    /* ========================================
       Load Expense Categories
    ======================================== */

    async function loadCategories() {

        expenseCategory.innerHTML =
            '<option value="">Loading categories...</option>';

        const { data, error } = await supabase
            .from("expense_categories")
            .select("id, name:category_name")
            .eq("is_active", true)
            .order("category_name", { ascending: true });

        if (error) {
            console.error("Category loading error:", error);

            expenseCategory.innerHTML =
                '<option value="">Unable to load categories</option>';

            showMessage(
                "Unable to load expense categories.",
                "error"
            );

            return;
        }

        categories = data || [];

        expenseCategory.innerHTML =
            '<option value="">Select Category</option>';

        categories.forEach(category => {

            const option = document.createElement("option");

            option.value = category.id;
            option.textContent = category.name;

            expenseCategory.appendChild(option);
        });

        if (!categories.length) {
            expenseCategory.innerHTML =
                '<option value="">No active categories found</option>';

            showMessage(
                "No active expense categories found. Please create a category first.",
                "info"
            );
        }
    }

    /* ========================================
       Load Payment Accounts
    ======================================== */

    async function loadAccounts() {

        expenseAccount.disabled = true;

        expenseAccount.innerHTML =
            '<option value="">Loading accounts...</option>';

        const { data, error } = await supabase
            .from("cash_accounts")
            .select("id, account_name, account_type, is_active")
            .eq("is_active", true)
            .order("account_name", { ascending: true });

        if (error) {
            console.error("Account loading error:", error);

            expenseAccount.innerHTML =
                '<option value="">Unable to load accounts</option>';

            showMessage(
                "Unable to load payment accounts.",
                "error"
            );

            return;
        }

        accounts = data || [];

        updateAccountOptions();
    }

    /* ========================================
       Filter Accounts By Payment Method
    ======================================== */

    function getAccountType(method) {

        if (method === "cash") {
            return ["cash"];
        }

        if (method === "bank") {
            return ["bank"];
        }

        if (method === "mobile_banking") {
            return ["mobile_banking"];
        }

        return [];
    }

    function updateAccountOptions() {

        const method = paymentMethod.value;

        expenseAccount.innerHTML = "";

        if (!method) {

            expenseAccount.disabled = true;

            expenseAccount.innerHTML =
                '<option value="">Select payment method first</option>';

            return;
        }

        const allowedTypes = getAccountType(method);

        const filteredAccounts = accounts.filter(account =>
            allowedTypes.includes(account.account_type)
        );

        expenseAccount.disabled = false;

        const defaultOption = document.createElement("option");

        defaultOption.value = "";
        defaultOption.textContent = "Select Payment Account";

        expenseAccount.appendChild(defaultOption);

        filteredAccounts.forEach(account => {

            const option = document.createElement("option");

            option.value = account.id;
            option.textContent = account.account_name;

            expenseAccount.appendChild(option);
        });

        if (!filteredAccounts.length) {

            expenseAccount.disabled = true;

            expenseAccount.innerHTML =
                '<option value="">No matching active account found</option>';

            showMessage(
                "No active account is available for this payment method.",
                "error"
            );
        } else {
            clearMessage();
        }
    }

    /* ========================================
       Amount Summary
    ======================================== */

    function updateExpenseTotal() {

        const amount = Number(expenseAmount.value) || 0;

        totalDisplay.textContent = formatMoney(amount);
    }

    /* ========================================
       Validation
    ======================================== */

    function validateForm() {

        const date = expenseDate.value;
        const categoryId = expenseCategory.value;
        const description = expenseDescription.value.trim();

        const amount = Number(expenseAmount.value);
        const method = paymentMethod.value;
        const accountId = expenseAccount.value;

        if (!date) {
            showMessage("Please select an expense date.", "error");
            expenseDate.focus();
            return false;
        }

        if (date > getLocalDate()) {
            showMessage(
                "Expense date cannot be in the future.",
                "error"
            );
            expenseDate.focus();
            return false;
        }

        if (!categoryId) {
            showMessage(
                "Please select an expense category.",
                "error"
            );
            expenseCategory.focus();
            return false;
        }

        if (!description) {
            showMessage(
                "Please enter an expense description.",
                "error"
            );
            expenseDescription.focus();
            return false;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            showMessage(
                "Please enter a valid expense amount.",
                "error"
            );
            expenseAmount.focus();
            return false;
        }

        if (Math.round(amount * 100) !== amount * 100) {
            showMessage(
                "Expense amount can have a maximum of two decimal places.",
                "error"
            );
            expenseAmount.focus();
            return false;
        }

        if (!method) {
            showMessage(
                "Please select a payment method.",
                "error"
            );
            paymentMethod.focus();
            return false;
        }

        if (!accountId) {
            showMessage(
                "Please select a payment account.",
                "error"
            );
            expenseAccount.focus();
            return false;
        }

        const selectedAccount = accounts.find(
            account => account.id === accountId
        );

        if (
            !selectedAccount ||
            !getAccountType(method).includes(selectedAccount.account_type)
        ) {
            showMessage(
                "The selected account does not match the payment method.",
                "error"
            );
            expenseAccount.focus();
            return false;
        }

        return true;
    }

    /* ========================================
       Save Expense
    ======================================== */

    async function saveExpense(event) {

        event.preventDefault();

        clearMessage();

        if (!validateForm()) return;

        const payload = {
            expense_date: expenseDate.value,
            category_id: expenseCategory.value,
            description: expenseDescription.value.trim(),
            notes: expenseNotes.value.trim() || null,
            amount: Number(expenseAmount.value),
            payment_method: paymentMethod.value,
            account_id: expenseAccount.value,
            payment_reference: paymentReference.value.trim() || null
        };

        setLoading(true);

        showMessage("Saving expense...", "info");

        try {

            const { data, error } = await supabase.functions.invoke(
                "record-expense",
                {
                    body: payload
                }
            );

            if (error) {
                console.error("Expense recording error:", error);
                throw new Error(
                    error.message || "Unable to save expense."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Expense could not be saved."
                );
            }

            showMessage(
                "Expense recorded successfully.",
                "success"
            );

            form.reset();

            expenseDate.value = getLocalDate();

            updateAccountOptions();
            updateExpenseTotal();

            setTimeout(() => {
                window.location.href = "expenses.html";
            }, 1200);

        } catch (error) {

            console.error("Save expense error:", error);

            showMessage(
                error.message || "Something went wrong while saving expense.",
                "error"
            );

        } finally {
            setLoading(false);
        }
    }

    /* ========================================
       Reset Form
    ======================================== */

    function resetForm() {

        setTimeout(() => {

            clearMessage();

            expenseDate.value = getLocalDate();

            updateAccountOptions();
            updateExpenseTotal();

        }, 0);
    }

    /* ========================================
       Event Listeners
    ======================================== */

    paymentMethod.addEventListener("change", () => {
        clearMessage();
        updateAccountOptions();
    });

    expenseAmount.addEventListener("input", updateExpenseTotal);

    form.addEventListener("submit", saveExpense);

    if (resetButton) {
        resetButton.addEventListener("click", resetForm);
    }

    /* ========================================
       Initialize
    ======================================== */

    expenseDate.max = getLocalDate();
    expenseDate.value = getLocalDate();

    updateExpenseTotal();

    const authenticated = await checkAuthentication();

    if (!authenticated) return;

    await Promise.all([
        loadCategories(),
        loadAccounts()
    ]);

});
