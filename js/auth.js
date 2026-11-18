
/* =========================================
   AIR TICKET AGENCY MANAGEMENT
   CENTRAL AUTHENTICATION CONTROLLER
========================================= */

(function () {
    "use strict";

    let supabaseClient = null;
    let loginFormInitialized = false;

    /* =====================================
       SUPABASE INITIALIZATION
    ===================================== */

    function initialize() {
        if (supabaseClient) {
            return supabaseClient;
        }

        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            throw new Error("Supabase library is not loaded.");
        }

        const config = window.APP_CONFIG || {};

        // Support the actual project config and legacy uppercase keys.
        const supabaseUrl =
            config.supabaseUrl || config.SUPABASE_URL;

        const supabaseKey =
            config.supabaseAnonKey || config.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Supabase URL or public key is missing.");
        }

        if (
            supabaseUrl === "YOUR_SUPABASE_PROJECT_URL" ||
            supabaseKey === "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
        ) {
            throw new Error("Supabase configuration has not been completed.");
        }

        supabaseClient = window.supabase.createClient(
            supabaseUrl,
            supabaseKey,
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            }
        );

        // Shared client for all application modules.
        window.supabaseClient = supabaseClient;

        return supabaseClient;
    }

    /* =====================================
       ROUTE HELPERS
    ===================================== */

    function getCurrentPage() {
        return window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();
    }

    function isPagesDirectory() {
        return window.location.pathname
            .replace(/\\/g, "/")
            .toLowerCase()
            .includes("/pages/");
    }

    function getLoginPath() {
        return isPagesDirectory() ? "login.html" : "pages/login.html";
    }

    function getDashboardPath() {
        return isPagesDirectory()
            ? "dashboard.html"
            : "pages/dashboard.html";
    }

    function redirectToLogin() {
        window.location.replace(getLoginPath());
    }

    function redirectToDashboard() {
        window.location.replace(getDashboardPath());
    }

    /* =====================================
       SESSION
    ===================================== */

    async function getSession() {
        const client = initialize();

        const { data, error } = await client.auth.getSession();

        if (error) {
            throw error;
        }

        return data.session || null;
    }

    /* =====================================
       CURRENT USER
    ===================================== */

    async function getCurrentUser() {
        const session = await getSession();

        if (!session) {
            return null;
        }

        const client = initialize();
        const { data, error } = await client.auth.getUser();

        if (error) {
            throw error;
        }

        return data.user || null;
    }

    /* =====================================
       PROTECTED PAGE SESSION CHECK
    ===================================== */

    async function checkSession() {
        const page = getCurrentPage();
        const isLoginPage = page === "login.html";
        const isRootPage = page === "" || page === "index.html";

        const session = await getSession();

        if (!session && !isLoginPage && !isRootPage) {
            redirectToLogin();
            return null;
        }

        if (session && (isLoginPage || isRootPage)) {
            redirectToDashboard();
            return session;
        }

        return session;
    }

    /* =====================================
       LOGIN
    ===================================== */

    async function login(email, password) {
        const client = initialize();

        const cleanEmail = String(email || "").trim().toLowerCase();

        if (!cleanEmail || !password) {
            throw new Error("Email and password are required.");
        }

        const { data, error } = await client.auth.signInWithPassword({
            email: cleanEmail,
            password: password
        });

        if (error) {
            throw error;
        }

        if (!data.session || !data.user) {
            throw new Error("Login session could not be created.");
        }

        redirectToDashboard();

        return data;
    }

    /* =====================================
       LOGOUT
    ===================================== */

    async function logout() {
        const client = initialize();

        const { error } = await client.auth.signOut();

        if (error) {
            throw error;
        }

        redirectToLogin();
    }

    /* =====================================
       LOGIN ERROR MESSAGE
    ===================================== */

    function getLoginErrorMessage(error) {
        const message = String(error?.message || "").toLowerCase();

        if (message.includes("invalid login credentials")) {
            return "Incorrect email address or password.";
        }

        if (message.includes("email not confirmed")) {
            return "Email confirmation is required for this account.";
        }

        if (message.includes("network")) {
            return "Network error. Please check your internet connection.";
        }

        if (
            message.includes("supabase configuration") ||
            message.includes("supabase library")
        ) {
            return "Authentication service is not configured correctly.";
        }

        return error?.message || "Login failed. Please try again.";
    }

    /* =====================================
       LOGIN STATUS
    ===================================== */

    function showLoginStatus(message, type) {
        const statusElement = document.getElementById("login-status");

        if (!statusElement) {
            return;
        }

        statusElement.textContent = message;
        statusElement.className = "login-status" + (type ? " " + type : "");
        statusElement.hidden = false;
    }

    /* =====================================
       LOGIN FORM
    ===================================== */

    function initializeLoginForm() {
        if (loginFormInitialized) {
            return;
        }

        const form = document.getElementById("login-form");

        if (!form) {
            return;
        }

        loginFormInitialized = true;

        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const submitButton = form.querySelector('[type="submit"]');

        form.addEventListener("submit", async function (event) {
            event.preventDefault();

            const email = emailInput?.value.trim();
            const password = passwordInput?.value;

            if (!email || !password) {
                showLoginStatus(
                    "Please enter your email address and password.",
                    "error"
                );
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Signing in...";
            }

            try {
                showLoginStatus("Signing in securely...", "info");
                await login(email, password);

            } catch (error) {
                console.error("Login error:", error);

                showLoginStatus(
                    getLoginErrorMessage(error),
                    "error"
                );

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = "Sign In";
                }
            }
        });
    }

    /* =====================================
       PUBLIC AUTH MANAGER
    ===================================== */

    window.AuthManager = Object.freeze({
        initialize,
        getSession,
        getCurrentUser,
        checkSession,
        login,
        logout,
        initializeLoginForm
    });

    /* =====================================
       PAGE INITIALIZATION
    ===================================== */

    document.addEventListener("DOMContentLoaded", function () {
        try {
            initialize();
            initializeLoginForm();

        } catch (error) {
            console.error("Authentication initialization error:", error);

            showLoginStatus(
                error.message || "Authentication service is unavailable.",
                "error"
            );
        }
    });

})();
