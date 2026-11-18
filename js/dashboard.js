
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   DASHBOARD CONTROLLER
========================================= */

(function () {
    "use strict";

    let currentProfile = null;

    document.addEventListener("DOMContentLoaded", async function () {
        initializeLogout();

        await initializeDashboard();
    });

    /* =====================================
       DASHBOARD INITIALIZATION
    ===================================== */

    async function initializeDashboard() {
        try {
            if (!window.AuthManager) {
                throw new Error("Authentication controller is unavailable.");
            }

            await window.AuthManager.initialize();

            const session = await window.AuthManager.checkSession();

            if (!session) {
                return;
            }

            await loadUserProfile(session);

            updateDashboardDate();

            // Other dashboard modules can use this profile.
            window.currentUserProfile = currentProfile;

        } catch (error) {
            console.error("Dashboard initialization error:", error);

            showDashboardError(
                "Unable to load dashboard. Please refresh the page or sign in again."
            );
        }
    }

    /* =====================================
       LOAD USER PROFILE
    ===================================== */

    async function loadUserProfile(session) {
        const client = window.supabaseClient;

        if (!client) {
            throw new Error("Supabase client is unavailable.");
        }

        const user = session.user;

        if (!user) {
            await window.AuthManager.logout();
            return;
        }

        const { data: profile, error } = await client
            .from("profiles")
            .select("id, full_name, email, role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!profile) {
            throw new Error(
                "Your staff profile was not found. Please contact the Owner."
            );
        }

        if (profile.is_active !== true) {
            await window.AuthManager.logout();
            return;
        }

        currentProfile = profile;

        const displayName =
            profile.full_name ||
            user.user_metadata?.full_name ||
            user.email ||
            "User";

        updateUserInformation(displayName, profile.role);

        applyRoleBasedDashboard(profile.role);
    }

    /* =====================================
       UPDATE USER INFORMATION
    ===================================== */

    function updateUserInformation(name, role) {
        const nameElement = document.getElementById("user-name");
        const roleElement = document.getElementById("user-role");
        const avatarElement = document.getElementById("user-avatar");

        if (nameElement) {
            nameElement.textContent = name;
        }

        if (roleElement) {
            roleElement.textContent = formatRole(role);
        }

        if (avatarElement) {
            avatarElement.textContent = getInitials(name);
        }
    }

    /* =====================================
       ROLE-BASED DASHBOARD VISIBILITY
    ===================================== */

    function applyRoleBasedDashboard(role) {
        const normalizedRole = String(role || "").toLowerCase();

        const canViewFinancialSummary = [
            "owner",
            "manager"
        ].includes(normalizedRole);

        const financialGrid = document.querySelector(".financial-grid");

        if (financialGrid) {
            financialGrid.hidden = !canViewFinancialSummary;

            const heading = financialGrid.previousElementSibling;

            if (
                heading &&
                heading.classList.contains("section-heading")
            ) {
                heading.hidden = !canViewFinancialSummary;
            }
        }

        // Store role information for other UI modules.
        document.body.dataset.userRole = normalizedRole;
    }

    /* =====================================
       LOGOUT
    ===================================== */

    function initializeLogout() {
        const logoutButton = document.getElementById("logout-button");

        if (!logoutButton) {
            return;
        }

        logoutButton.addEventListener("click", async function () {
            if (!window.AuthManager) {
                alert("Authentication service is unavailable.");
                return;
            }

            logoutButton.disabled = true;
            logoutButton.textContent = "Signing out...";

            try {
                await window.AuthManager.logout();

            } catch (error) {
                console.error("Logout error:", error);

                logoutButton.disabled = false;
                logoutButton.textContent = "Logout";

                alert("Unable to sign out. Please try again.");
            }
        });
    }

    /* =====================================
       DASHBOARD DATE
    ===================================== */

    function updateDashboardDate() {
        const dateElement = document.getElementById("dashboard-date");

        if (!dateElement) {
            return;
        }

        dateElement.textContent = new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            weekday: "long"
        }).format(new Date());
    }

    /* =====================================
       ROLE LABEL
    ===================================== */

    function formatRole(role) {
        const roles = {
            owner: "Owner",
            manager: "Manager",
            ticket_staff: "Ticket Staff",
            accounts_staff: "Accounts Staff"
        };

        return roles[String(role || "").toLowerCase()] || "Staff";
    }

    /* =====================================
       USER INITIALS
    ===================================== */

    function getInitials(name) {
        return String(name || "User")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(function (part) {
                return part.charAt(0).toUpperCase();
            })
            .join("");
    }

    /* =====================================
       DASHBOARD ERROR
    ===================================== */

    function showDashboardError(message) {
        const nameElement = document.getElementById("user-name");
        const roleElement = document.getElementById("user-role");

        if (nameElement) {
            nameElement.textContent = "Unable to load";
        }

        if (roleElement) {
            roleElement.textContent = "Please try again";
        }

        const content = document.querySelector(".dashboard-content");

        if (content) {
            const errorElement = document.createElement("div");

            errorElement.className = "dashboard-error";
            errorElement.setAttribute("role", "alert");
            errorElement.textContent = message;

            content.prepend(errorElement);
        }
    }

})();
