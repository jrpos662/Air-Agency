/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   APP SETTINGS (shared, loaded on every page)
   - Reads Settings saved by the Owner (agency info, receipt layout,
     date/time format) and applies them across the whole app.
   - Cached in localStorage so pages render with the right format
     immediately; refreshed from the server on every page load.
   - Must be loaded BEFORE page scripts and AFTER auth.js.
========================================= */
(function () {
    "use strict";

    var KEY = "airAgencySettings.v1";
    var DEFAULTS = {
        agency: {},
        system: { audit_logging: true, require_payment_reference: false, financial_confirmation: true },
        receipt: { title: "", footer: "", paper_size: "a4", copy_count: "1" },
        regional: {
            currency: "BDT",
            date_format: "DD MMM YYYY",
            time_format: "12",
            timezone: "Asia/Dhaka"
        }
    };

    function merge(raw) {
        raw = raw || {};
        return {
            agency: Object.assign({}, DEFAULTS.agency, raw.agency),
            system: Object.assign({}, DEFAULTS.system, raw.system),
            receipt: Object.assign({}, DEFAULTS.receipt, raw.receipt),
            regional: Object.assign({}, DEFAULTS.regional, raw.regional)
        };
    }

    function readCache() {
        try {
            return merge(JSON.parse(localStorage.getItem(KEY) || "null"));
        } catch (e) { return merge(null); }
    }

    var current = readCache();

    /* ---------- Date / time formatting (applies everywhere) ---------- */

    var NativeDTF = Intl.DateTimeFormat;
    var DISPLAY_LOCALES = { "en-GB": 1, "en-BD": 1 };

    function pick(parts, type) {
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === type) return parts[i].value;
        }
        return "";
    }

    function PatchedDTF(locale, options) {
        var opts = Object.assign({}, options || {});
        var native = new NativeDTF(locale, opts);
        // Only touch display formatters; leave en-CA (ISO parts) etc. alone.
        if (!DISPLAY_LOCALES[locale]) return native;

        var rg = current.regional;
        var hasDate = !!(opts.day || opts.month || opts.year || opts.dateStyle);
        var hasTime = !!(opts.hour || opts.minute || opts.timeStyle);
        var tz = opts.timeZone || rg.timezone || "Asia/Dhaka";

        var dateFmt = new NativeDTF("en-GB", {
            timeZone: tz, day: "2-digit", month: "short", year: "numeric"
        });
        var dateNum = new NativeDTF("en-GB", {
            timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric"
        });
        var timeFmt = new NativeDTF("en-GB", {
            timeZone: tz, hour: "2-digit", minute: "2-digit",
            hour12: rg.time_format !== "24"
        });

        function formatOne(d) {
            var out = [];
            if (hasDate) {
                var f = rg.date_format;
                if (f === "DD/MM/YYYY") {
                    var n = dateNum.formatToParts(d);
                    out.push(pick(n, "day") + "/" + pick(n, "month") + "/" + pick(n, "year"));
                } else if (f === "YYYY-MM-DD") {
                    var m = dateNum.formatToParts(d);
                    out.push(pick(m, "year") + "-" + pick(m, "month") + "-" + pick(m, "day"));
                } else {
                    var s = dateFmt.formatToParts(d);
                    out.push(pick(s, "day") + " " + pick(s, "month") + " " + pick(s, "year"));
                }
            }
            if (hasTime) {
                out.push(timeFmt.format(d).replace(/\b(am|pm)\b/i, function (x) {
                    return x.toUpperCase();
                }));
            }
            return out.join(", ");
        }

        // Month-only / weekday-only style requests keep native behaviour.
        var simple = hasDate && !opts.day && !opts.year;
        if ((!hasDate && !hasTime) || simple) {
            return new NativeDTF(locale, Object.assign({ timeZone: tz }, opts));
        }

        return {
            format: function (value) {
                var d = value instanceof Date ? value : new Date(value);
                if (isNaN(d.getTime())) return native.format(value);
                return formatOne(d);
            },
            formatToParts: function (v) { return native.formatToParts(v); },
            resolvedOptions: function () { return native.resolvedOptions(); }
        };
    }
    PatchedDTF.prototype = NativeDTF.prototype;
    PatchedDTF.supportedLocalesOf = NativeDTF.supportedLocalesOf;
    Intl.DateTimeFormat = PatchedDTF;

    // The few places that call toLocaleDateString("en-GB") directly.
    var nativeLDS = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function (locale, options) {
        if (DISPLAY_LOCALES[locale] && !options) {
            return new PatchedDTF(locale, { day: "2-digit", month: "short", year: "numeric" }).format(this);
        }
        if (DISPLAY_LOCALES[locale] && options && options.day && options.year) {
            return new PatchedDTF(locale, options).format(this);
        }
        return nativeLDS.call(this, locale, options);
    };

    /* ---------- Public API ---------- */

    var PAPER = {
        a4: { page: "A4", width: "210mm" },
        a5: { page: "A5", width: "148mm" },
        thermal_80mm: { page: "80mm auto", width: "80mm" },
        thermal_58mm: { page: "58mm auto", width: "58mm" }
    };

    function esc(t) {
        return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    var listeners = [];

    var API = {
        get: function () { return current; },
        agencyName: function () {
            return (current.agency.name || "").trim() || "Air Agency";
        },
        paper: function () {
            return PAPER[current.receipt.paper_size] || PAPER.a4;
        },
        copies: function () {
            return current.receipt.copy_count === "2" ? 2 : 1;
        },
        logo: function () { return current.agency.logo || ""; },
        initials: function () {
            var w = API.agencyName().split(/\s+/).filter(Boolean);
            var t = (w.length > 1 ? w[0][0] + w[1][0] : API.agencyName().slice(0, 2));
            return t.toUpperCase();
        },
        // Header block used on receipts / invoices / printed reports.
        headerHtml: function (subtitle) {
            var a = current.agency;
            var lines = [];
            if (a.address) lines.push(esc(a.address));
            var contact = [a.phone, a.email, a.website].filter(Boolean).map(esc).join(" &nbsp;|&nbsp; ");
            if (contact) lines.push(contact);
            var logo = a.logo && /^data:image\//.test(a.logo)
                ? '<img src="' + esc(a.logo) + '" alt="" style="max-height:56px;max-width:140px;margin-bottom:6px">'
                : "";
            return logo + '<h1>' + esc(API.agencyName()) + '</h1>' +
                lines.map(function (l) { return '<p>' + l + '</p>'; }).join("") +
                (subtitle ? '<p>' + esc(subtitle) + '</p>' : "");
        },
        receiptTitle: function (fallback) {
            return (current.receipt.title || "").trim() || fallback;
        },
        footerLines: function (fallbackLines) {
            var f = (current.receipt.footer || "").trim();
            return f ? f.split(/\r?\n/).filter(Boolean) : fallbackLines;
        },
        apply: function () { applyToPage(); },
        onChange: function (fn) { listeners.push(fn); },
        set: function (raw) {
            current = merge(raw);
            try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) {}
            applyToPage();
            listeners.forEach(function (fn) { try { fn(current); } catch (e) {} });
        },
        refresh: async function () {
            var client = window.supabaseClient;
            if (!client) return;
            var res = await client.rpc("get_app_settings");
            if (res.error || !res.data) return;
            var before = JSON.stringify(current);
            API.set(res.data);
            // Formats changed since this page rendered: reload once.
            if (before !== JSON.stringify(current) &&
                !sessionStorage.getItem("settingsReloaded")) {
                sessionStorage.setItem("settingsReloaded", "1");
                location.reload();
            } else {
                sessionStorage.removeItem("settingsReloaded");
            }
        }
    };
    window.AppSettings = API;

    /* ---------- Page-level effects ---------- */

    function applyToPage() {
        // Sidebar brand + browser title follow the agency name.
        var brand = document.querySelector(".sidebar-brand h2");
        if (brand) brand.textContent = API.agencyName();
        var badge = document.querySelector(".sidebar-brand .brand-logo");
        if (badge) {
            var lg = API.logo();
            if (lg && /^data:image\//.test(lg)) {
                badge.textContent = "";
                var img = badge.querySelector("img") || document.createElement("img");
                img.src = lg; img.alt = "";
                img.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:10px";
                if (!img.parentNode) badge.appendChild(img);
                badge.style.background = "#fff";
            } else {
                badge.textContent = API.initials();
                badge.style.background = "";
            }
        }
        var foot = document.querySelector(".sidebar-footer p");
        if (foot) foot.textContent = API.agencyName();
    }

    // Printing any page directly (invoice, statement, reports):
    // add the agency header on top and use the chosen paper size.
    var printStyle = null, printHeader = null;
    window.addEventListener("beforeprint", function () {
        var p = API.paper();
        printStyle = document.createElement("style");
        printStyle.textContent =
            "@page{size:" + p.page + ";margin:10mm}" +
            "@media print{.app-print-header{display:block!important;text-align:center;" +
            "padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid #b91c35}" +
            ".app-print-header h1{margin:0 0 4px;font-size:20px;color:#b91c35}" +
            ".app-print-header p{margin:2px 0;font-size:11px;color:#555}" +
            ".app-print-footer{display:block!important;text-align:center;margin-top:18px;" +
            "font-size:11px;color:#666}}";
        document.head.appendChild(printStyle);

        printHeader = document.createElement("div");
        printHeader.className = "app-print-header";
        printHeader.style.display = "none";
        printHeader.innerHTML = API.headerHtml();
        var main = document.querySelector("main") || document.body;
        main.insertBefore(printHeader, main.firstChild);

        var footLines = API.footerLines([]);
        if (footLines.length) {
            var f = document.createElement("div");
            f.className = "app-print-footer";
            f.style.display = "none";
            f.innerHTML = footLines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("");
            main.appendChild(f);
            printHeader._footer = f;
        }
    });
    window.addEventListener("afterprint", function () {
        if (printHeader) {
            if (printHeader._footer) printHeader._footer.remove();
            printHeader.remove();
        }
        if (printStyle) printStyle.remove();
        printHeader = printStyle = null;
    });

    // Financial confirmation switch: ask before saving money transactions.
    var FINANCIAL_FORMS = {
        "new-customer-payment-form": 1, "new-expense-form": 1,
        "account-transfer-form": 1, "new-ticket-sale-form": 1,
        "refund-form": 1, "agency-payment-form": 1
    };
    document.addEventListener("submit", function (e) {
        var f = e.target;
        if (!f || !FINANCIAL_FORMS[f.id]) return;
        if (current.system.financial_confirmation === false) return;
        if (f.dataset.confirmed === "1") { delete f.dataset.confirmed; return; }
        if (!window.confirm("Please confirm: save this financial transaction? It affects your account balances.")) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    function start() {
        applyToPage();
        // Sidebar is built by sidebar.js after this file; apply again then.
        setTimeout(applyToPage, 0);
        window.addEventListener("load", function () {
            applyToPage();
            if (window.supabaseClient) {
                API.refresh();
            } else {
                var tries = 0;
                var t = setInterval(function () {
                    tries++;
                    if (window.supabaseClient) { clearInterval(t); API.refresh(); }
                    else if (tries > 40) clearInterval(t);
                }, 250);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else { start(); }
})();
