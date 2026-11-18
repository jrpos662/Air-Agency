
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    initializeAccountTransfer();
});

let transferClient = null;
let transferAccounts = [];

const transferElements = {
    form: document.getElementById("account-transfer-form"),
    fromAccount: document.getElementById("from-account-id"),
    toAccount: document.getElementById("to-account-id"),
    amount: document.getElementById("transfer-amount"),
    date: document.getElementById("transfer-date"),
    reference: document.getElementById("reference-number"),
    notes: document.getElementById("transfer-notes"),
    message: document.getElementById("transfer-message"),
    sourceBalance: document.getElementById("source-account-balance"),
    destinationBalance: document.getElementById("destination-account-balance"),
    summaryFrom: document.getElementById("summary-from-account"),
    summaryTo: document.getElementById("summary-to-account"),
    summaryAmount: document.getElementById("summary-transfer-amount"),
    submit: document.getElementById("save-transfer-button"),
    reset: document.getElementById("reset-transfer-form")
};

async function initializeAccountTransfer() {
    try {
        if (!window.supabaseClient) {
            if (
                window.AuthManager &&
                typeof window.AuthManager.initialize === "function"
            ) {
                await window.AuthManager.initialize();
            }
        }

        transferClient = window.supabaseClient;

        if (!transferClient) {
            throw new Error("Supabase connection is unavailable.");
        }

        const { data: sessionData, error: sessionError } =
            await transferClient.auth.getSession();

        if (sessionError || !sessionData.session) {
            window.location.href = "login.html";
            return;
        }

        const { data: profile, error: profileError } =
            await transferClient
                .from("profiles")
                .select("full_name, role, is_active")
                .eq("id", sessionData.session.user.id)
                .maybeSingle();

        if (profileError) throw profileError;

        if (
            !profile ||
            profile.is_active !== true ||
            !["owner", "manager", "accounts_staff"].includes(profile.role)
        ) {
            showTransferMessage(
                "You do not have permission to access Account Transfer.",
                "error"
            );

            if (transferElements.submit) {
                transferElements.submit.disabled = true;
            }

            return;
        }

        setDefaultTransferDate();
        await loadTransferAccounts();
        bindTransferEvents();

    } catch (error) {
        console.error("Account Transfer initialization:", error);

        showTransferMessage(
            error.message || "Unable to initialize Account Transfer.",
            "error"
        );
    }
}

/* ========================================
   Load Accounts
======================================== */

async function loadTransferAccounts() {
    const { data, error } = await transferClient
        .from("cash_accounts")
        .select(`
            id,
            account_name,
            account_type,
            bank_name,
            account_number,
            opening_balance,
            is_active
        `)
        .eq("is_active", true)
        .order("account_name", { ascending: true });

    if (error) throw error;

    transferAccounts = [];

    for (const account of data || []) {
        const { data: balance, error: balanceError } =
            await transferClient.rpc("get_cash_account_balance", {
                p_account_id: account.id
            });

        if (balanceError) {
            console.error("Account balance error:", balanceError.message);
            continue;
        }

        transferAccounts.push({
            ...account,
            current_balance: Number(balance || 0)
        });
    }

    populateAccountOptions();
    updateTransferSummary();
}

/* ========================================
   Populate Account Dropdowns
======================================== */

function populateAccountOptions() {
    const options = transferAccounts.map(account => {
        const name = escapeTransferHTML(account.account_name);
        const type = formatAccountType(account.account_type);

        return `
            <option value="${account.id}">
                ${name} (${type})
            </option>
        `;
    }).join("");

    if (transferElements.fromAccount) {
        transferElements.fromAccount.innerHTML =
            `<option value="">Select source account</option>${options}`;
    }

    if (transferElements.toAccount) {
        transferElements.toAccount.innerHTML =
            `<option value="">Select destination account</option>${options}`;
    }
}

/* ========================================
   Event Listeners
======================================== */

function bindTransferEvents() {
    transferElements.fromAccount?.addEventListener("change", () => {
        updateTransferSummary();
    });

    transferElements.toAccount?.addEventListener("change", () => {
        updateTransferSummary();
    });

    transferElements.amount?.addEventListener("input", () => {
        updateTransferSummary();
    });

    transferElements.form?.addEventListener("submit", handleTransferSubmit);

    transferElements.reset?.addEventListener("click", () => {
        setTimeout(() => {
            setDefaultTransferDate();
            clearTransferMessage();
            updateTransferSummary();
        }, 0);
    });
}

/* ========================================
   Transfer Summary
======================================== */

function updateTransferSummary() {
    const from = getSelectedAccount(transferElements.fromAccount?.value);
    const to = getSelectedAccount(transferElements.toAccount?.value);

    if (transferElements.sourceBalance) {
        transferElements.sourceBalance.textContent = from
            ? formatMoney(from.current_balance)
            : formatMoney(0);
    }

    if (transferElements.destinationBalance) {
        transferElements.destinationBalance.textContent = to
            ? formatMoney(to.current_balance)
            : formatMoney(0);
    }

    if (transferElements.summaryFrom) {
        transferElements.summaryFrom.textContent =
            from?.account_name || "Not selected";
    }

    if (transferElements.summaryTo) {
        transferElements.summaryTo.textContent =
            to?.account_name || "Not selected";
    }

    const amount = Number(transferElements.amount?.value || 0);

    if (transferElements.summaryAmount) {
        transferElements.summaryAmount.textContent =
            formatMoney(Number.isFinite(amount) ? amount : 0);
    }
}

function getSelectedAccount(accountId) {
    return transferAccounts.find(account => account.id === accountId) || null;
}

/* ========================================
   Submit Transfer
======================================== */

async function handleTransferSubmit(event) {
    event.preventDefault();

    clearTransferMessage();

    const fromAccountId = transferElements.fromAccount.value;
    const toAccountId = transferElements.toAccount.value;
    const amountText = transferElements.amount.value.trim();
    const amount = Number(amountText);
    const transferDate = transferElements.date.value;

    const fromAccount = getSelectedAccount(fromAccountId);
    const toAccount = getSelectedAccount(toAccountId);

    if (!fromAccount || !toAccount) {
        showTransferMessage(
            "Please select both source and destination accounts.",
            "error"
        );
        return;
    }

    if (fromAccountId === toAccountId) {
        showTransferMessage(
            "Source and destination accounts must be different.",
            "error"
        );
        return;
    }

    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amountText) ||
        !Number.isFinite(amount) ||
        amount <= 0) {
        showTransferMessage(
            "Please enter a valid transfer amount.",
            "error"
        );
        return;
    }

    if (amount > fromAccount.current_balance) {
        showTransferMessage(
            "Insufficient source account balance.",
            "error"
        );
        return;
    }

    if (!transferDate) {
        showTransferMessage(
            "Please select the transfer date.",
            "error"
        );
        return;
    }

    if (transferDate > getLocalDateString()) {
        showTransferMessage(
            "Transfer date cannot be in the future.",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        `Confirm transfer of ${formatMoney(amount)}?\n\n` +
        `From: ${fromAccount.account_name}\n` +
        `To: ${toAccount.account_name}`
    );

    if (!confirmed) return;

    await saveAccountTransfer({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        transfer_date: transferDate,
        reference_number: transferElements.reference.value.trim(),
        notes: transferElements.notes.value.trim()
    });
}

/* ========================================
   Save Transfer Through Edge Function
======================================== */

async function saveAccountTransfer(payload) {
    setTransferLoading(true);

    try {
        const { data, error } = await transferClient.functions.invoke(
            "manage-account-transfer",
            { body: payload }
        );

        if (error) {
            throw new Error(
                data?.message ||
                error.message ||
                "Transfer could not be completed."
            );
        }

        if (!data || data.success !== true) {
            throw new Error(
                data?.message || "Transfer could not be completed."
            );
        }

        showTransferMessage(
            "Account transfer completed successfully.",
            "success"
        );

        transferElements.form.reset();
        setDefaultTransferDate();

        await loadTransferAccounts();

        transferElements.reference.value = "";
        transferElements.notes.value = "";
        updateTransferSummary();

    } catch (error) {
        console.error("Account transfer error:", error);

        showTransferMessage(
            error.message || "Transfer failed. Please try again.",
            "error"
        );
    } finally {
        setTransferLoading(false);
    }
}

/* ========================================
   UI Helpers
======================================== */

function setTransferLoading(isLoading) {
    if (!transferElements.submit) return;

    transferElements.submit.disabled = isLoading;
    transferElements.submit.textContent = isLoading
        ? "Processing Transfer..."
        : "Confirm Transfer";
}

function showTransferMessage(message, type) {
    if (!transferElements.message) return;

    transferElements.message.textContent = message;
    transferElements.message.className = `transfer-message ${type}`;
}

function clearTransferMessage() {
    if (!transferElements.message) return;

    transferElements.message.textContent = "";
    transferElements.message.className = "transfer-message";
}

function setDefaultTransferDate() {
    if (transferElements.date) {
        transferElements.date.value = getLocalDateString();
        transferElements.date.max = getLocalDateString();
    }
}

function getLocalDateString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;

    return new Date(now.getTime() - offset)
        .toISOString()
        .slice(0, 10);
}

function formatMoney(amount) {
    return new Intl.NumberFormat("en-BD", {
        style: "currency",
        currency: "BDT",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatAccountType(type) {
    const types = {
        cash: "Cash",
        bank: "Bank",
        mobile_banking: "Mobile Banking"
    };

    return types[type] || type;
}

function escapeTransferHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}
