
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   SETTINGS MODULE
   Supabase RPC Integration
========================================================= */

(function () {
    "use strict";

    let supabase = null;
    let currentProfile = null;
    let currentSettings = null;
    let isSaving = false;

    const $ = id => document.getElementById(id);

    document.addEventListener("DOMContentLoaded", initializeSettings);

    /* =====================================================
       INITIALIZE
    ===================================================== */

    async function initializeSettings() {
        try {
            if (!window.AuthManager) {
                throw new Error("Authentication service is unavailable.");
            }

            await window.AuthManager.initialize();

            const session = await window.AuthManager.checkSession();

            if (!session || !session.user) return;

            supabase = window.supabaseClient;

            if (!supabase) {
                throw new Error("Supabase client is unavailable.");
            }

            await loadCurrentProfile(session.user);

            initializeSettingsTabs();
            initializeSettingsForms();

            await loadSettings();

        } catch (error) {
            console.error("Settings initialization:", error);

            showSettingsMessage(
                error.message || "Unable to initialize Settings.",
                "error"
            );
        }
    }

    /* =====================================================
       PROFILE AND ACCESS
    ===================================================== */

    async function loadCurrentProfile(user) {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data || data.is_active !== true) {
            await window.AuthManager.logout();
            return;
        }

        currentProfile = data;

        const role = String(data.role || "").toLowerCase();

        if (role !== "owner") {
            disableSettingsForms();

            showSettingsMessage(
                "Access denied. Only the active Owner can manage application settings.",
                "error"
            );

            document.querySelectorAll(".settings-nav-item")
                .forEach(button => button.disabled = true);

            return;
        }

        const name =
            data.full_name ||
            user.user_metadata?.full_name ||
            user.email ||
            "User";

        if ($("user-name")) {
            $("user-name").textContent = name;
        }

        if ($("user-role")) {
            $("user-role").textContent = "Owner";
        }

        if ($("user-avatar")) {
            $("user-avatar").textContent = getInitials(name);
        }

        document.body.dataset.userRole = role;
    }

    function disableSettingsForms() {
        document.querySelectorAll(
            ".settings-panels input, .settings-panels select, " +
            ".settings-panels textarea, .settings-panels button"
        ).forEach(element => {
            element.disabled = true;
        });
    }

    function getInitials(name) {
        return String(name || "U")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }

    /* =====================================================
       SETTINGS TABS
    ===================================================== */

    function initializeSettingsTabs() {
        const buttons = document.querySelectorAll(".settings-nav-item");
        const panels = document.querySelectorAll(".settings-panel");

        buttons.forEach(button => {
            button.addEventListener("click", () => {
                const selected = button.dataset.settingsTab;

                if (!selected) return;

                buttons.forEach(item => {
                    const active =
                        item.dataset.settingsTab === selected;

                    item.classList.toggle("active", active);
                    item.setAttribute(
                        "aria-selected",
                        active ? "true" : "false"
                    );
                });

                panels.forEach(panel => {
                    const active =
                        panel.id === `settings-panel-${selected}`;

                    panel.classList.toggle("active", active);
                    panel.hidden = !active;
                });

                hideSettingsMessage();
            });
        });

        buttons.forEach(button => {
            button.setAttribute(
                "aria-selected",
                button.classList.contains("active") ? "true" : "false"
            );
        });
    }

    /* =====================================================
       LOAD SETTINGS FROM DATABASE
    ===================================================== */

    async function loadSettings() {
        showSettingsMessage("Loading application settings...", "info");

        const { data, error } = await supabase.rpc("get_my_settings");

        if (error) throw error;

        if (!data || typeof data !== "object") {
            throw new Error("Invalid settings response.");
        }

        currentSettings = {
            agency: data.agency || {},
            receipt: data.receipt || {},
            regional: data.regional || {},
            system: data.system || {}
        };

        populateSettingsForms(currentSettings);

        showSettingsMessage(
            "Application settings loaded successfully.",
            "success"
        );
    }

    /* =====================================================
       POPULATE FORMS
    ===================================================== */

    function populateSettingsForms(settings) {
        const agency = settings.agency;
        const receipt = settings.receipt;
        const regional = settings.regional;
        const system = settings.system;

        setValue("agency-name", agency.name);
        setValue("agency-phone", agency.phone);
        setValue("agency-email", agency.email);
        setValue("agency-website", agency.website);
        setValue("agency-address", agency.address);

        setValue("receipt-title", receipt.title);
        setValue("receipt-footer", receipt.footer);
        setValue("receipt-paper-size", receipt.paper_size || "a4");
        setValue("receipt-copy-count", receipt.copy_count || "1");

        setValue("currency", regional.currency || "BDT");
        setValue("date-format", regional.date_format || "DD MMM YYYY");
        setValue("time-format", regional.time_format || "12");
        setValue("timezone", regional.timezone || "Asia/Dhaka");

        setChecked("audit-logging", system.audit_logging, true);
        setChecked(
            "require-payment-reference",
            system.require_payment_reference,
            false
        );
        setChecked(
            "financial-confirmation",
            system.financial_confirmation,
            true
        );
    }

    function setValue(id, value) {
        const element = $(id);

        if (element && value !== undefined && value !== null) {
            element.value = String(value);
        }
    }

    function setChecked(id, value, defaultValue) {
        const element = $(id);

        if (!element) return;

        element.checked =
            typeof value === "boolean" ? value : defaultValue;
    }

    /* =====================================================
       FORM SUBMISSIONS
    ===================================================== */

    function initializeSettingsForms() {
        bindForm("agency-settings-form", "agency");
        bindForm("receipt-settings-form", "receipt");
        bindForm("regional-settings-form", "regional");
        bindForm("system-settings-form", "system");
    }

    function bindForm(formId, section) {
        const form = $(formId);

        if (!form) return;

        form.addEventListener("submit", async event => {
            event.preventDefault();

            if (isSaving) return;

            if (!currentProfile || currentProfile.role !== "owner") {
                showSettingsMessage(
                    "Only Owner can save application settings.",
                    "error"
                );
                return;
            }

            if (!form.reportValidity()) return;

            try {
                const updatedSection = collectSection(section);

                await saveSettingsSection(section, updatedSection, form);

            } catch (error) {
                console.error(`Save ${section} settings:`, error);

                showSettingsMessage(
                    error.message || "Unable to save settings.",
                    "error"
                );
            }
        });
    }

    /* =====================================================
       COLLECT FORM DATA
    ===================================================== */

    function collectSection(section) {
        switch (section) {

            case "agency":
                return {
                    name: getInput("agency-name"),
                    phone: getInput("agency-phone"),
                    email: getInput("agency-email"),
                    website: getInput("agency-website"),
                    address: getInput("agency-address")
                };

            case "receipt":
                return {
                    title: getInput("receipt-title"),
                    footer: getInput("receipt-footer"),
                    paper_size: getInput("receipt-paper-size"),
                    copy_count: getInput("receipt-copy-count")
                };

            case "regional":
                return {
                    currency: getInput("currency"),
                    date_format: getInput("date-format"),
                    time_format: getInput("time-format"),
                    timezone: getInput("timezone")
                };

            case "system":
                return {
                    audit_logging: getChecked("audit-logging"),
                    require_payment_reference:
                        getChecked("require-payment-reference"),
                    financial_confirmation:
                        getChecked("financial-confirmation")
                };

            default:
                throw new Error("Unknown settings section.");
        }
    }

    function getInput(id) {
        return $(id)?.value.trim() || "";
    }

    function getChecked(id) {
        return Boolean($(id)?.checked);
    }

    /* =====================================================
       SAVE SETTINGS
    ===================================================== */

    async function saveSettingsSection(section, updatedSection, form) {
        if (!currentSettings) {
            throw new Error("Settings have not loaded yet.");
        }

        validateSection(section, updatedSection);

        const button = form.querySelector(
            'button[type="submit"]'
        );

        const originalText = button?.textContent || "Save";

        isSaving = true;

        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        try {
            const payload = {
                agency: currentSettings.agency,
                receipt: currentSettings.receipt,
                regional: currentSettings.regional,
                system: currentSettings.system
            };

            payload[section] = updatedSection;

            const { data, error } = await supabase.rpc(
                "save_my_settings",
                {
                    p_settings: payload
                }
            );

            if (error) throw error;

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Settings could not be saved."
                );
            }

            currentSettings = payload;

            showSettingsMessage(
                data.message || "Settings saved successfully.",
                "success"
            );

        } finally {
            isSaving = false;

            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }

    /* =====================================================
       VALIDATION
    ===================================================== */

    function validateSection(section, values) {
        if (section === "agency") {
            if (!values.name) {
                throw new Error("Agency Name is required.");
            }

            if (values.email && !isValidEmail(values.email)) {
                throw new Error("Please enter a valid agency email.");
            }

            if (values.website && !isValidWebsite(values.website)) {
                throw new Error("Please enter a valid website URL.");
            }
        }

        if (section === "receipt") {
            if (!["a4", "a5", "thermal_80mm", "thermal_58mm"]
                .includes(values.paper_size)) {
                throw new Error("Invalid receipt paper size.");
            }

            if (!["1", "2"].includes(values.copy_count)) {
                throw new Error("Invalid receipt copy count.");
            }
        }

        if (section === "regional") {
            if (values.currency !== "BDT") {
                throw new Error("Only BDT currency is supported.");
            }

            if (values.timezone !== "Asia/Dhaka") {
                throw new Error("Only Bangladesh Standard Time is supported.");
            }

            if (!["DD MMM YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]
                .includes(values.date_format)) {
                throw new Error("Invalid date format.");
            }

            if (!["12", "24"].includes(values.time_format)) {
                throw new Error("Invalid time format.");
            }
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function isValidWebsite(url) {
        try {
            const parsed = new URL(url);

            return ["http:", "https:"].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    /* =====================================================
       MESSAGES
    ===================================================== */

    function showSettingsMessage(message, type = "info") {
        const box = $("settings-message");

        if (!box) return;

        box.textContent = message;
        box.className = `alert alert-${type}`;
        box.hidden = false;
    }

    function hideSettingsMessage() {
        const box = $("settings-message");

        if (!box) return;

        box.hidden = true;
        box.textContent = "";
    }

})();
