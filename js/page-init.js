
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   SHARED PAGE INITIALIZER
========================================= */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", async function () {
        try {
            if (!window.AuthManager) {
                throw new Error("Authentication service is unavailable.");
            }

            const currentPage = window.location.pathname
                .split("/")
                .pop()
                .toLowerCase();

            // Login page is accessible without an active session.
            if (currentPage === "login.html") {
                const session = await window.AuthManager.getSession();

                if (session) {
                    window.location.replace("dashboard.html");
                }

                return;
            }

            // All protected application pages require authentication.
            const session = await window.AuthManager.getSession();

            if (!session) {
                window.location.replace("login.html");
                return;
            }

        } catch (error) {
            console.error("Page initialization error:", error);

            const message = document.getElementById("page-message");

            if (message) {
                message.textContent =
                    "Unable to verify your session. Please try again.";
            }
        }
    });

})();
