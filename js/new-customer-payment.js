
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("new-customer-payment-form");

    if (!form) return;

    const $ = id => document.getElementById(id);

    const customerSelect = $("customer-id");
    const customerPhone = $("customer-phone");
    const customerEmail = $("customer-email");
    const paymentDate = $("payment-date");
    const paymentAmount = $("payment-amount");
    const paymentMethod = $("payment-method");
    const accountSelect = $("cash-account-id");
    const allocationList = $("allocation-list");
    const addAllocationButton = $("add-allocation-button");
    const message = $("new-payment-message");
    const saveButton = $("save-customer-payment-button");
    const resetButton = $("reset-payment-form");

    const totalPaymentElement = $("allocation-total-payment");
    const totalAllocatedElement = $("allocation-total-allocated");
    const unallocatedElement = $("allocation-unallocated");

    const MAX_ALLOCATIONS = 20;

    let client = window.supabaseClient || null;
    let customers = [];
    let accounts = [];
    let sales = [];
    let saving = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function money(value) {
        return "৳" + Number(value || 0).toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function showMessage(text, type = "error") {
        if (!message) return;

        message.textContent = text;
        message.className = `new-payment-message show ${type}`;
    }

    function clearMessage() {
        if (!message) return;

        message.textContent = "";
        message.className = "new-payment-message";
    }

    function getToday() {
        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
    }

    async function initializeClient() {
        if (client) return client;

        if (window.AuthManager?.initialize) {
            const result = await window.AuthManager.initialize();
            client = result || window.supabaseClient || null;
        }

        if (!client) {
            throw new Error("Supabase connection is unavailable.");
        }

        return client;
    }

    function setSelectOptions(select, options, placeholder) {
        if (!select) return;

        select.innerHTML =
            `<option value="">${escapeHTML(placeholder)}</option>` +
            options.map(item => `
                <option value="${escapeHTML(item.value)}">
                    ${escapeHTML(item.label)}
                </option>
            `).join("");
    }

    async function loadCustomers() {
        const { data, error } = await client
            .from("customers")
            .select("id, full_name, phone, email")
            .eq("is_active", true)
            .order("full_name");

        if (error) throw error;

        customers = data || [];

        setSelectOptions(
            customerSelect,
            customers.map(customer => ({
                value: customer.id,
                label: `${customer.full_name} (${customer.phone || "No phone"})`
            })),
            "Select Customer"
        );
    }

    async function loadAccounts() {
        const { data, error } = await client
            .from("cash_accounts")
            .select("id, account_name, account_type, is_active")
            .eq("is_active", true)
            .order("account_name");

        if (error) throw error;

        accounts = data || [];

        setSelectOptions(
            accountSelect,
            accounts.map(account => ({
                value: account.id,
                label: `${account.account_name} (${account.account_type})`
            })),
            "Select Receiving Account"
        );
    }

    async function loadCustomerSales(customerId) {
        sales = [];

        if (!customerId) {
            updateAllocationSaleOptions();
            return;
        }

        const { data, error } = await client
            .from("ticket_sales")
            .select("id, sale_reference, sale_date, selling_total, discount_amount, status:sale_status")
            .eq("customer_id", customerId)
            .in("sale_status", ["issued", "partially_refunded"])
            .order("sale_date", { ascending: false });

        if (error) throw error;

        /*
         * IMPORTANT:
         * This draft does not calculate outstanding balances.
         * Correct balances must come from payment allocations,
         * booking advance allocations and any credit adjustments.
         * Do not use selling_total as the outstanding due.
         */

        sales = data || [];

        updateAllocationSaleOptions();
    }

    function updateAllocationSaleOptions() {
        const selectedCustomer = customerSelect?.value;

        document.querySelectorAll(".allocation-sale-select")
            .forEach(select => {
                const previousValue = select.value;

                const options = sales.map(sale => ({
                    value: sale.id,
                    label: `${sale.sale_reference || sale.id} - ${sale.sale_date || ""}`
                }));

                setSelectOptions(
                    select,
                    options,
                    selectedCustomer
                        ? "Select Ticket Sale"
                        : "Select Customer First"
                );

                if (options.some(option => option.value === previousValue)) {
                    select.value = previousValue;
                }
            });
    }

    function updateCustomerInformation() {
        const customer = customers.find(
            item => item.id === customerSelect.value
        );

        if (!customer) {
            customerPhone.value = "";
            customerEmail.value = "";
            return;
        }

        customerPhone.value = customer.phone || "";
        customerEmail.value = customer.email || "";
    }

    function getAllocationRows() {
        return [...allocationList.querySelectorAll("[data-allocation]")];
    }

    function getAllocations() {
        return getAllocationRows().map(row => ({
            sale_id: row.querySelector(".allocation-sale-select")?.value || "",
            amount: Number(
                row.querySelector(".allocation-amount-input")?.value || 0
            )
        }));
    }

    function calculateAllocation() {
        const payment = Number(paymentAmount.value || 0);

        const allocations = getAllocations();

        const allocated = allocations.reduce(
            (sum, item) => sum + item.amount,
            0
        );

        const unallocated = payment - allocated;

        totalPaymentElement.textContent = money(payment);
        totalAllocatedElement.textContent = money(allocated);
        unallocatedElement.textContent = money(unallocated);

        unallocatedElement.style.color =
            unallocated < -0.005
                ? "var(--danger)"
                : "var(--primary)";

        return {
            payment,
            allocated,
            unallocated
        };
    }

    function refreshAllocationControls() {
        const rows = getAllocationRows();

        rows.forEach(row => {
            const removeButton = row.querySelector(
                ".remove-allocation-button"
            );

            if (removeButton) {
                removeButton.disabled = rows.length <= 1 || saving;
            }
        });

        addAllocationButton.disabled =
            rows.length >= MAX_ALLOCATIONS || saving;
    }

    function addAllocationRow() {
        const rows = getAllocationRows();

        if (rows.length >= MAX_ALLOCATIONS) {
            showMessage("Maximum 20 allocations are allowed.", "warning");
            return;
        }

        const row = document.createElement("div");

        row.className = "allocation-row";
        row.dataset.allocation = "";

        row.innerHTML = `
            <div class="form-group allocation-sale">
                <label>Ticket Sale</label>

                <select
                    name="sale_id"
                    class="allocation-sale-select"
                    required>
                    <option value="">Select Ticket Sale</option>
                </select>
            </div>

            <div class="form-group allocation-amount">
                <label>Allocated Amount (৳)</label>

                <input
                    type="number"
                    name="allocated_amount"
                    class="allocation-amount-input"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    required>
            </div>

            <button
                type="button"
                class="btn btn-danger btn-sm remove-allocation-button"
                aria-label="Remove allocation">
                Remove
            </button>
        `;

        allocationList.appendChild(row);

        updateAllocationSaleOptions();
        refreshAllocationControls();
        calculateAllocation();
    }

    function validateAllocations() {
        const amount = Number(paymentAmount.value || 0);
        const allocations = getAllocations();

        const selectedSales = allocations
            .filter(item => item.sale_id)
            .map(item => item.sale_id);

        if (new Set(selectedSales).size !== selectedSales.length) {
            return "The same ticket sale cannot be selected more than once.";
        }

        for (const item of allocations) {
            if (!item.sale_id || !Number.isFinite(item.amount) || item.amount <= 0) {
                return "Please complete every payment allocation.";
            }
        }

        const allocated = allocations.reduce(
            (sum, item) => sum + item.amount,
            0
        );

        if (allocated > amount + 0.005) {
            return "Allocated amount cannot exceed total payment.";
        }

        return null;
    }

    function validateForm() {
        if (!customerSelect.value) {
            return "Please select a customer.";
        }

        if (!paymentDate.value) {
            return "Please select payment date.";
        }

        if (paymentDate.value > getToday()) {
            return "Payment date cannot be in the future.";
        }

        if (!Number.isFinite(Number(paymentAmount.value)) ||
            Number(paymentAmount.value) <= 0) {
            return "Please enter a valid payment amount.";
        }

        if (!paymentMethod.value) {
            return "Please select payment method.";
        }

        if (!accountSelect.value) {
            return "Please select receiving account.";
        }

        const account = accounts.find(
            item => item.id === accountSelect.value
        );

        if (!account) {
            return "Invalid receiving account.";
        }

        const method = paymentMethod.value;
        const accountType = String(account.account_type || "").toLowerCase();

        if (method === "cash" && accountType !== "cash") {
            return "Please select a cash account for cash payments.";
        }

        if (
            method === "bank" &&
            !["bank", "mobile_banking"].includes(accountType)
        ) {
            return "Please select a suitable bank account.";
        }

        const allocationError = validateAllocations();

        if (allocationError) return allocationError;

        return null;
    }

    async function savePayment(event) {
        event.preventDefault();

        if (saving) return;

        clearMessage();

        const validationError = validateForm();

        if (validationError) {
            showMessage(validationError);
            return;
        }

        const totals = calculateAllocation();

        const confirmed = window.confirm(
            `Save customer payment of ${money(totals.payment)}?`
        );

        if (!confirmed) return;

        saving = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        refreshAllocationControls();

        try {
            await initializeClient();

            const payload = {
                customer_id: customerSelect.value,
                payment_date: paymentDate.value,
                amount: Number(paymentAmount.value),
                payment_method: paymentMethod.value,
                account_id: accountSelect.value,
                payment_reference:
                    $("payment-reference").value.trim() || null,
                notes: $("payment-notes").value.trim() || null,
                allocations: getAllocations()
                    .filter(item => item.sale_id)
                    .map(item => ({
                        sale_id: item.sale_id,
                        amount: item.amount
                    }))
            };

            /*
             * Backend must atomically:
             * 1. Verify user permissions and customer ownership/access.
             * 2. Verify the selected account and payment method.
             * 3. Lock and verify sale outstanding balances.
             * 4. Prevent over-allocation and duplicate payment submission.
             * 5. Insert customer_payments.
             * 6. Insert customer_payment_allocations.
             * 7. Insert exactly one cash_transactions entry.
             * 8. Write audit log.
             *
             * Never insert these records separately from the browser.
             */

            const { data, error } = await client.functions.invoke(
                "record-customer-payment",
                { body: payload }
            );

            if (error) throw error;

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Payment could not be saved."
                );
            }

            showMessage(
                `Payment saved successfully. Receipt: ${data.receipt_number || "Generated"}`,
                "success"
            );

            form.reset();

            paymentDate.value = getToday();

            customerPhone.value = "";
            customerEmail.value = "";

            allocationList.innerHTML = "";

            addAllocationRow();
            calculateAllocation();

            await loadCustomerSales("");
            await loadAccounts();

            setTimeout(() => {
                window.location.href = "customer-payments.html";
            }, 1500);

        } catch (error) {
            console.error("Customer payment error:", error);

            showMessage(
                error.message || "Unable to save customer payment."
            );

        } finally {
            saving = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save Payment";

            refreshAllocationControls();
        }
    }

    customerSelect.addEventListener("change", async () => {
        clearMessage();
        updateCustomerInformation();

        try {
            await loadCustomerSales(customerSelect.value);
        } catch (error) {
            console.error(error);
            showMessage("Unable to load customer ticket sales.");
        }
    });

    paymentAmount.addEventListener("input", calculateAllocation);

    allocationList.addEventListener("input", event => {
        if (event.target.matches(".allocation-amount-input")) {
            calculateAllocation();
        }
    });

    allocationList.addEventListener("change", event => {
        if (event.target.matches(".allocation-sale-select")) {
            clearMessage();
        }
    });

    allocationList.addEventListener("click", event => {
        const button = event.target.closest(".remove-allocation-button");

        if (!button || saving) return;

        const rows = getAllocationRows();

        if (rows.length <= 1) return;

        button.closest("[data-allocation]").remove();

        refreshAllocationControls();
        calculateAllocation();
    });

    addAllocationButton.addEventListener("click", addAllocationRow);

    paymentMethod.addEventListener("change", () => {
        const method = paymentMethod.value;

        [...accountSelect.options].forEach(option => {
            if (!option.value) return;

            const account = accounts.find(
                item => item.id === option.value
            );

            if (!account) return;

            const type = String(account.account_type || "").toLowerCase();

            option.hidden =
                (method === "cash" && type !== "cash") ||
                (method === "bank" &&
                    !["bank", "mobile_banking"].includes(type));
        });

        if (
            accountSelect.selectedOptions[0]?.hidden
        ) {
            accountSelect.value = "";
        }
    });

    resetButton.addEventListener("click", () => {
        setTimeout(() => {
            clearMessage();
            paymentDate.value = getToday();

            updateCustomerInformation();
            updateAllocationSaleOptions();
            calculateAllocation();
            refreshAllocationControls();
        }, 0);
    });

    form.addEventListener("submit", savePayment);

    try {
        await initializeClient();

        paymentDate.value = getToday();

        await Promise.all([
            loadCustomers(),
            loadAccounts()
        ]);

        addAllocationRow();
        calculateAllocation();

    } catch (error) {
        console.error("Payment form initialization error:", error);

        showMessage(
            error.message || "Unable to initialize payment form."
        );
    }
});
