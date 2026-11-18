/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   SHARED SIDEBAR (single source of truth)
   - Builds the same menu on every page
   - Highlights the current page (detail/new pages highlight their parent)
   - Mobile: slide-in drawer with overlay, Esc to close
   - Desktop: the ☰ button collapses / expands the sidebar
========================================= */

(function () {
    "use strict";

    var MENU = [
        { heading: "MAIN MENU", items: [
            { href: "dashboard.html",         icon: "▦", label: "Dashboard" },
            { href: "bookings.html",          icon: "▤", label: "Bookings" },
            { href: "ticket-sales.html",      icon: "✈", label: "Ticket Sales" },
            { href: "customers.html",         icon: "♙", label: "Customers" }
        ]},
        { heading: "ACCOUNTS", items: [
            { href: "customer-payments.html", icon: "৳", label: "Customer Payments" },
            { href: "agencies.html",          icon: "▣", label: "Agencies" },
            { href: "agency-accounts.html",   icon: "▤", label: "Agency Accounts" },
            { href: "expenses.html",          icon: "↘", label: "Expenses" },
            { href: "expense-categories.html",icon: "☰", label: "Expense Categories" },
            { href: "cash-bank.html",         icon: "▥", label: "Cash & Bank" },
            { href: "cash-transactions.html", icon: "⇄", label: "Cash Transactions" },
            { href: "account-transfer.html",  icon: "⇆", label: "Account Transfer" },
            { href: "account-transfer-history.html", icon: "◷", label: "Transfer History" }
        ]},
        { heading: "MANAGEMENT", items: [
            { href: "refunds.html",           icon: "↩", label: "Refunds & Changes" },
            { href: "reports.html",           icon: "▧", label: "Reports" },
            { href: "receipts.html",          icon: "▤", label: "Receipts & Invoices" },
            { href: "staff.html",             icon: "♧", label: "Staff Management", roles: ["owner", "manager"] },
            { href: "settings.html",          icon: "⚙", label: "Settings",         roles: ["owner", "manager"] },
            { href: "audit-logs.html",        icon: "◷", label: "Audit Logs",       roles: ["owner", "manager"] }
        ]}
    ];

    // Pages that belong under another menu item.
    var PARENT = {
        "new-booking.html": "bookings.html",
        "booking-details.html": "bookings.html",
        "new-ticket-sale.html": "ticket-sales.html",
        "sale-details.html": "ticket-sales.html",
        "new-customer.html": "customers.html",
        "customer-details.html": "customers.html",
        "new-customer-payment.html": "customer-payments.html",
        "customer-payment-details.html": "customer-payments.html",
        "new-agency.html": "agencies.html",
        "agency-details.html": "agencies.html",
        "new-expense.html": "expenses.html",
        "cash-transaction-details.html": "cash-transactions.html",
        "account-transfer-details.html": "account-transfer-history.html"
    };

    function currentPage() {
        var p = window.location.pathname.split("/").pop().toLowerCase();
        return PARENT[p] || p;
    }

    function esc(t) {
        return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function buildNav(active) {
        return MENU.map(function (g) {
            var links = g.items.map(function (i) {
                var cls = "nav-link" + (i.href === active ? " active" : "");
                var roles = i.roles ? ' data-roles="' + i.roles.join(",") + '" hidden' : "";
                return '<a href="' + i.href + '" class="' + cls + '"' + roles +
                    (i.href === active ? ' aria-current="page"' : "") + '>' +
                    '<span aria-hidden="true">' + i.icon + '</span> ' + esc(i.label) + '</a>';
            }).join("");
            return '<span class="nav-heading">' + g.heading + '</span>' + links;
        }).join("");
    }

    function buildSidebar(sidebar) {
        sidebar.innerHTML =
            '<div class="sidebar-brand">' +
                '<div class="brand-logo">AT</div>' +
                '<div><h2>Air Agency</h2><span>Management System</span></div>' +
            '</div>' +
            '<nav class="sidebar-nav" aria-label="Main navigation">' + buildNav(currentPage()) + '</nav>' +
            '<div class="sidebar-footer"><p>Air Ticket Agency Management</p><small>Version 1.0</small></div>';

        // Keep the active link visible in a long menu.
        var activeLink = sidebar.querySelector(".nav-link.active");
        if (activeLink && activeLink.scrollIntoView) {
            activeLink.scrollIntoView({ block: "center" });
        }
    }

    // Hide admin-only links for roles that should not see them.
    // (Display only - real protection is Supabase RLS / Edge Functions.)
    function applyRole(role) {
        role = String(role || "").toLowerCase();
        document.querySelectorAll(".sidebar [data-roles]").forEach(function (a) {
            a.hidden = a.dataset.roles.split(",").indexOf(role) === -1;
        });
    }

    function init() {
        var sidebar = document.getElementById("sidebar");
        var toggle = document.getElementById("sidebar-toggle");
        if (!sidebar) { return; }

        buildSidebar(sidebar);

        var overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        document.body.appendChild(overlay);

        function isMobile() { return window.innerWidth <= 768; }
        function open()  { sidebar.classList.add("open");    overlay.classList.add("show");    document.body.classList.add("sidebar-lock"); }
        function close() { sidebar.classList.remove("open"); overlay.classList.remove("show"); document.body.classList.remove("sidebar-lock"); }

        if (toggle) {
            toggle.setAttribute("aria-controls", "sidebar");
            toggle.addEventListener("click", function () {
                if (isMobile()) {
                    sidebar.classList.contains("open") ? close() : open();
                } else {
                    document.body.classList.toggle("sidebar-collapsed");
                }
            });
        }

        overlay.addEventListener("click", close);
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") { close(); } });
        sidebar.addEventListener("click", function (e) {
            if (isMobile() && e.target.closest("a.nav-link")) { close(); }
        });
        window.addEventListener("resize", function () { if (!isMobile()) { close(); } });

        // Apply role visibility as soon as the profile is known.
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            var role = document.body.dataset.userRole;
            if (role) { applyRole(role); clearInterval(timer); }
            else if (tries > 50) { clearInterval(timer); }
        }, 200);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
