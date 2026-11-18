
"use strict";

(() => {
    const PAGE_SIZE = 10;

    let supabaseClient = null;
    let currentPage = 1;
    let totalPages = 1;
    let searchTimer = null;

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function showMessage(message, type = "info") {
        const element = $("transfer-history-message");
        if (!element) return;

        element.textContent = message;
        element.className = `transfer-history-message show ${type}`;
    }

    function clearMessage() {
        const element = $("transfer-history-message");
        if (!element) return;

        element.textContent = "";
        element.className = "transfer-history-message";
    }

    function setLoading(button, loading, loadingText = "Loading...") {
        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.textContent;
            button.disabled = true;
            button.textContent = loadingText;
        } else {
            button.disabled = false;

            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    async function getClient() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            const client = await window.AuthManager.initialize();

            if (client) {
                window.supabaseClient = client;
                return client;
            }
        }

        if (
            window.supabase &&
            window.APP_CONFIG &&
            window.isSupabaseConfigured?.()
        ) {
            const client = window.supabase.createClient(
                window.APP_CONFIG.supabaseUrl,
                window.APP_CONFIG.supabaseAnonKey
            );

            window.supabaseClient = client;
            return client;
        }

        throw new Error("Supabase connection is not configured.");
    }

    async function checkAccess() {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return false;
        }

        const { data: profile, error } = await supabaseClient
            .from("profiles")
            .select("role, is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        const allowedRoles = [
            "owner",
            "manager",
            "accounts_staff"
        ];

        if (
            !profile ||
            profile.is_active !== true ||
            !allowedRoles.includes(profile.role)
        ) {
            showMessage(
                "You do not have permission to view transfer history.",
                "error"
            );
            return false;
        }

        return true;
    }

    function getFilters() {
        return {
            search: $("transfer-search")?.value.trim() || "",
            date_from: $("transfer-date-from")?.value || null,
            date_to: $("transfer-date-to")?.value || null
        };
    }

    function validateFilters(filters) {
        if (
            filters.date_from &&
            filters.date_to &&
            filters.date_from > filters.date_to
        ) {
            showMessage(
                "Start date cannot be later than end date.",
                "error"
            );
            return false;
        }

        return true;
    }

    async function loadTransferHistory() {
        clearMessage();

        const refreshButton = $("refresh-transfer-history");
        setLoading(refreshButton, true, "Loading...");

        try {
            const filters = getFilters();

            if (!validateFilters(filters)) return;

            const { data, error } =
                await supabaseClient.functions.invoke(
                    "get-account-transfer-history",
                    {
                        body: {
                            ...filters,
                            page: currentPage,
                            page_size: PAGE_SIZE
                        }
                    }
                );

            if (error) throw error;

            if (!data || data.success !== true) {
                throw new Error(
                    data?.message || "Unable to load transfer history."
                );
            }

            renderTransfers(data.transfers || []);

            const pagination = data.pagination || {};

            totalPages = Math.max(
                1,
                Number(pagination.total_pages || 1)
            );

            updatePagination(
                Number(pagination.total_count || 0)
            );

        } catch (error) {
            console.error("Transfer history error:", error);

            showMessage(
                error.message || "Failed to load transfer history.",
                "error"
            );

            renderEmptyState();
            totalPages = 1;
            updatePagination(0);

        } finally {
            setLoading(refreshButton, false);
        }
    }

    function renderTransfers(transfers) {
        const tbody = $("transfer-history-table-body");
        if (!tbody) return;

        if (!transfers.length) {
            renderEmptyState();
            return;
        }

        tbody.innerHTML = transfers.map(transfer => {
            const id = escapeHTML(transfer.id);
            const fromAccount = escapeHTML(
                transfer.from_account_name || "—"
            );
            const toAccount = escapeHTML(
                transfer.to_account_name || "—"
            );
            const reference = escapeHTML(
                transfer.reference_number || "—"
            );
            const notes = escapeHTML(
                transfer.notes || "—"
            );

            return `
                <tr>
                    <td>${escapeHTML(formatDate(transfer.transfer_date))}</td>
                    <td>
                        <span class="transfer-account-name">
                            ${fromAccount}
                        </span>
                    </td>
                    <td>
                        <span class="transfer-account-name">
                            ${toAccount}
                        </span>
                    </td>
                    <td class="amount-cell">
                        <strong>${escapeHTML(formatMoney(transfer.amount))}</strong>
                    </td>
                    <td>${reference}</td>
                    <td class="transfer-notes-cell">${notes}</td>
                    <td>
                        <a
                            href="account-transfer-details.html?id=${encodeURIComponent(id)}"
                            class="btn btn-sm btn-primary"
                            aria-label="View transfer details"
                        >
                            View Details
                        </a>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderEmptyState() {
        const tbody = $("transfer-history-table-body");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No transfer records found.
                </td>
            </tr>
        `;
    }

    function updatePagination(totalCount) {
        const count = $("transfer-count");
        const pageInfo = $("transfer-page-info");
        const previous = $("transfer-previous-page");
        const next = $("transfer-next-page");

        if (count) {
            count.textContent = `${totalCount} transfer(s) found`;
        }

        if (pageInfo) {
            pageInfo.textContent =
                `Page ${currentPage} of ${totalPages}`;
        }

        if (previous) {
            previous.disabled = currentPage <= 1;
        }

        if (next) {
            next.disabled = currentPage >= totalPages;
        }
    }

    function resetFilters() {
        if ($("transfer-search")) {
            $("transfer-search").value = "";
        }

        if ($("transfer-date-from")) {
            $("transfer-date-from").value = "";
        }

        if ($("transfer-date-to")) {
            $("transfer-date-to").value = "";
        }

        currentPage = 1;
        loadTransferHistory();
    }

    function bindEvents() {
        $("transfer-search-button")?.addEventListener("click", () => {
            currentPage = 1;
            loadTransferHistory();
        });

        $("transfer-reset-button")?.addEventListener(
            "click",
            resetFilters
        );

        $("refresh-transfer-history")?.addEventListener(
            "click",
            () => {
                loadTransferHistory();
            }
        );

        $("transfer-previous-page")?.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                loadTransferHistory();
            }
        });

        $("transfer-next-page")?.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadTransferHistory();
            }
        });

        $("transfer-search")?.addEventListener("input", () => {
            clearTimeout(searchTimer);

            searchTimer = setTimeout(() => {
                currentPage = 1;
                loadTransferHistory();
            }, 500);
        });

        $("transfer-date-from")?.addEventListener("change", () => {
            currentPage = 1;
            loadTransferHistory();
        });

        $("transfer-date-to")?.addEventListener("change", () => {
            currentPage = 1;
            loadTransferHistory();
        });
    }

    async function initialize() {
        try {
            supabaseClient = await getClient();

            const hasAccess = await checkAccess();
            if (!hasAccess) return;

            bindEvents();
            await loadTransferHistory();

        } catch (error) {
            console.error("Transfer history initialization:", error);

            showMessage(
                error.message || "Unable to initialize transfer history.",
                "error"
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
