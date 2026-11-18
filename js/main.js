
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   MAIN APPLICATION CONTROLLER
========================================= */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", async function () {

        const currentPage = window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

        // Main controller only handles the root entry page.
        const isRootPage =
            currentPage === "" ||
            currentPage === "index.html";

        if (!isRootPage) {
            return;
        }

        const statusElement = document.getElementById("app-status");
        const loginLink = document.getElementById("login-link");

        function showStatus(message) {
            if (statusElement) {
                statusElement.textContent = message;
            }
        }

        function showLoginLink() {
            if (loginLink) {
                loginLink.href = "pages/login.html";
                loginLink.textContent = "Continue to Login";
                loginLink.style.display = "inline-flex";
            }
        }

        function showDashboardRedirect() {
            showStatus("Session found. Opening dashboard...");

            window.location.replace("pages/dashboard.html");
        }

        try {

            showStatus("Checking application configuration...");

            // Check whether Supabase configuration exists.
            if (
                typeof window.isSupabaseConfigured === "function" &&
                !window.isSupabaseConfigured()
            ) {
                showStatus(
                    "Supabase is not configured yet. Complete the setup before signing in."
                );

                showLoginLink();
                return;
            }

            if (!window.AuthManager) {
                throw new Error(
                    "Authentication controller is not available."
                );
            }

            showStatus("Checking your session...");

            // Initialize the shared Supabase client.
            await window.AuthManager.initialize();

            // Read the current authenticated session.
            const session = await window.AuthManager.getSession();

            if (session) {
                showDashboardRedirect();
                return;
            }

            showStatus("Please sign in to continue.");

            showLoginLink();

        } catch (error) {

            console.error("Application startup error:", error);

            showStatus(
                "Unable to initialize the application. Please check the Supabase configuration and internet connection."
            );

            showLoginLink();

        }

    });

})();
