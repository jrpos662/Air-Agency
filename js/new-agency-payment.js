"use strict";

/* new-agency-payment.js - Air Ticket Agency Management
   Records a payment made TO a source agency through the
   record-agency-payment Edge Function (never inserted directly). */

(() => {
    let client = null;
    let accounts = [];
    let isSubmitting = false;

    const $ = (id) => document.getElementById(id);

    function esc(v) {
        return String(v ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        })[c]);
    }

    function showMessage(message, type = "error") {
        const el = $("new-agency-message");
        if (!el) return;
        el.textContent = message;
        el.className = `new-agency-message show ${type}`;
    }

    function today() {
        const p = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(new Date());
        return p;
    }

    function setOptions(select, items, placeholder) {
        select.innerHTML = `<option value="">${esc(placeholder)}</option>` +
            items.map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join("");
    }

    async function loadAgencies(preselect) {
        const { data, error } = await client
            .from("agencies")
            .select("id, agency_name")
            .order("agency_name");
        if (error) throw error;
        setOptions($("ap-agency"),
            (data || []).map((a) => ({ value: a.id, label: a.agency_name })),
            "Select Agency");
        if (preselect) $("ap-agency").value = preselect;
    }

    async function loadAccounts() {
        const { data, error } = await client
            .from("cash_accounts")
            .select("id, account_name, account_type, is_active")
            .eq("is_active", true)
            .order("account_name");
        if (error) throw error;
        accounts = data || [];
        refreshAccountOptions();
    }

    // Card payments go through a bank account; others must match the type.
    function refreshAccountOptions() {
        const method = $("ap-method").value;
        const type = method === "card" ? "bank" : method;
        const list = accounts.filter((a) => a.account_type === type);
        setOptions($("ap-account"),
            list.map((a) => ({ value: a.id, label: a.account_name })),
            list.length ? "Select Account" : "No matching account - add one in Cash & Bank");
    }

    function validate() {
        if (!$("ap-agency").value) throw new Error("Please select an agency.");
        const amount = Number($("ap-amount").value);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Please enter a valid amount.");
        }
        if (Math.round(amount * 100) !== amount * 100) {
            throw new Error("Amount supports up to two decimal places.");
        }
        if (!$("ap-account").value) throw new Error("Please select the payment account.");
        if (!$("ap-date").value) throw new Error("Please choose the payment date.");
        if ($("ap-date").value > today()) throw new Error("Payment date cannot be in the future.");
        const sys = window.AppSettings?.get().system || {};
        if (sys.require_payment_reference &&
            $("ap-method").value !== "cash" &&
            !$("ap-transaction-ref").value.trim()) {
            throw new Error("A transaction reference is required for non-cash payments.");
        }
        return amount;
    }

    async function submit(event) {
        event.preventDefault();
        if (isSubmitting) return;
        const button = $("save-agency-payment-button");

        try {
            const amount = validate();
            isSubmitting = true;
            button.disabled = true;
            button.textContent = "Saving...";

            const { data, error } = await client.functions.invoke("record-agency-payment", {
                body: {
                    agency_id: $("ap-agency").value,
                    account_id: $("ap-account").value,
                    amount,
                    payment_method: $("ap-method").value,
                    payment_date: $("ap-date").value,
                    payment_reference: $("ap-payment-ref").value.trim() || null,
                    transaction_reference: $("ap-transaction-ref").value.trim() || null,
                    notes: $("ap-notes").value.trim() || null
                }
            });

            if (error) {
                let detail = error.message;
                try {
                    const body = await error.context?.json?.();
                    if (body?.message) detail = body.message;
                } catch (e) { /* keep default */ }
                throw new Error(detail);
            }
            if (!data || data.success !== true) {
                throw new Error(data?.message || "Payment could not be saved.");
            }

            showMessage(`Payment saved. Reference: ${data.payment_reference || "generated"}`, "success");
            $("agency-payment-form").reset();
            $("ap-date").value = today();
            refreshAccountOptions();
            if (agencyFromUrl()) $("ap-agency").value = agencyFromUrl();
        } catch (e) {
            console.error("Agency payment error:", e);
            showMessage(e.message || "Unable to save the payment.");
        } finally {
            isSubmitting = false;
            button.disabled = false;
            button.textContent = "Save Payment";
        }
    }

    function agencyFromUrl() {
        return new URLSearchParams(window.location.search).get("id") || "";
    }

    async function init() {
        try {
            client = window.supabaseClient ||
                (window.AuthManager ? await window.AuthManager.initialize() : null);
            if (!client) throw new Error("Supabase client is not initialized.");

            const { data } = await client.auth.getSession();
            if (!data.session) { window.location.href = "login.html"; return; }

            $("ap-date").value = today();
            const id = agencyFromUrl();
            const back = $("ap-back-link");
            if (back && id) back.href = `agency-details.html?id=${encodeURIComponent(id)}`;

            $("ap-method").addEventListener("change", refreshAccountOptions);
            $("agency-payment-form").addEventListener("submit", submit);
            $("agency-payment-form").addEventListener("reset", () => {
                setTimeout(() => { refreshAccountOptions(); $("ap-date").value = today(); }, 0);
            });

            await Promise.all([loadAgencies(id), loadAccounts()]);
        } catch (e) {
            console.error("Agency payment init:", e);
            showMessage(e.message || "Unable to load the payment form.");
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();
