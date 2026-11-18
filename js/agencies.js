/* agencies.js - Air Ticket Agency Management */

"use strict";

(() => {
    const PAGE_SIZE = 10;

    let supabaseClient = null;
    let agencies = [];
    let filteredAgencies = [];
    let currentPage = 1;

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
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

    function showMessage(message, type = "error") {
        const element = $("agencies-message");

        if (!element) return;

        element.textContent = message;
        element.className = `agencies-message show ${type}`;
    }

    function clearMessage() {
        const element = $("agencies-message");

        if (!element) return;

        element.textContent = "";
        element.className = "agencies-message";
    }

    async function initializeSupabase() {
        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            return;
        }

        if (
            window.AuthManager &&
            typeof window.AuthManager.initialize === "function"
        ) {
            supabaseClient = await window.AuthManager.initialize();
        }

        if (!supabaseClient) {
            throw new Error("Supabase client is not initialized.");
        }
    }

    async function checkSession() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            window.location.href = "login.html";
            return false;
        }

        return true;
    }

    async function loadAgencies() {
        clearMessage();

        const tbody = $("agencies-table-body");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        Loading agencies...
                    </td>
                </tr>
            `;
        }

        const { data, error } = await supabaseClient
            .from("agencies")
            .select(`
                id,
                name:agency_name,
                contact_person,
                phone:mobile,
                email,
                is_active,
                created_at
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        agencies = data || [];

        updateSummary();
        applyFilters();
    }

    function updateSummary() {
        const total = agencies.length;

        const active = agencies.filter(
            agency => agency.is_active === true
        ).length;

        const inactive = total - active;

        const totalElement = $("total-agencies");
        const activeElement = $("active-agencies");
        const inactiveElement = $("inactive-agencies");

        if (totalElement) totalElement.textContent = total;
        if (activeElement) activeElement.textContent = active;
        if (inactiveElement) inactiveElement.textContent = inactive;
    }

    function applyFilters() {
        const search = ($("agency-search")?.value || "")
            .trim()
            .toLowerCase();

        const status = $("agency-status-filter")?.value || "all";

        filteredAgencies = agencies.filter(agency => {
            const matchesSearch = !search || [
                agency.name,
                agency.contact_person,
                agency.phone,
                agency.email
            ].some(value =>
                String(value || "").toLowerCase().includes(search)
            );

            const matchesStatus =
                status === "all" ||
                (status === "active" && agency.is_active === true) ||
                (status === "inactive" && agency.is_active !== true);

            return matchesSearch && matchesStatus;
        });

        currentPage = 1;

        renderAgencies();
    }

    function renderAgencies() {
        const tbody = $("agencies-table-body");

        if (!tbody) return;

        const total = filteredAgencies.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const startIndex = (currentPage - 1) * PAGE_SIZE;

        const pageItems = filteredAgencies.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        if (!pageItems.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        No agencies found.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = pageItems.map(agency => {
                const statusBadge = agency.is_active
                    ? `<span class="badge badge-success">Active</span>`
                    : `<span class="badge badge-danger">Inactive</span>`;

                return `
                    <tr>
                        <td>
                            <div class="agency-name-cell">
                                ${escapeHTML(agency.name)}
                            </div>
                        </td>

                        <td>
                            <span class="agency-contact-cell">
                                ${escapeHTML(agency.contact_person || "—")}
                            </span>
                        </td>

                        <td>${escapeHTML(agency.phone || "—")}</td>

                        <td>${escapeHTML(agency.email || "—")}</td>

                        <td>${statusBadge}</td>

                        <td>${formatDate(agency.created_at)}</td>

                        <td>
                            <div class="agency-actions">
                                <button
                                    type="button"
                                    class="btn btn-outline"
                                    data-action="details"
                                    data-id="${escapeHTML(agency.id)}"
                                >
                                    View
                                </button>

                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-action="accounts"
                                    data-id="${escapeHTML(agency.id)}"
                                >
                                    Accounts
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        const countElement = $("agency-count");
        const pageInfo = $("agency-page-info");
        const previousButton = $("agency-previous-page");
        const nextButton = $("agency-next-page");

        if (countElement) countElement.textContent = total;

        if (pageInfo) {
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }

        if (previousButton) {
            previousButton.disabled = currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }
    }

    function handleTableActions(event) {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const agencyId = button.dataset.id;
        const action = button.dataset.action;

        if (!agencyId) return;

        if (action === "details") {
            window.location.href =
                `agency-details.html?id=${encodeURIComponent(agencyId)}`;
        }

        if (action === "accounts") {
            window.location.href =
                `agency-accounts.html?agency_id=${encodeURIComponent(agencyId)}`;
        }
    }

    function setupEventListeners() {
        $("agency-search-button")?.addEventListener("click", applyFilters);

        $("agency-search")?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
            }
        });

        $("agency-status-filter")?.addEventListener(
            "change",
            applyFilters
        );

        $("agency-reset-button")?.addEventListener("click", () => {
            if ($("agency-search")) $("agency-search").value = "";

            if ($("agency-status-filter")) {
                $("agency-status-filter").value = "all";
            }

            applyFilters();
            clearMessage();
        });

        $("agency-refresh-button")?.addEventListener("click", async () => {
            try {
                await loadAgencies();
                showMessage("Agency list refreshed successfully.", "success");
            } catch (error) {
                console.error(error);
                showMessage(error.message || "Unable to refresh agencies.");
            }
        });

        $("agency-previous-page")?.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderAgencies();
            }
        });

        $("agency-next-page")?.addEventListener("click", () => {
            const totalPages = Math.max(
                1,
                Math.ceil(filteredAgencies.length / PAGE_SIZE)
            );

            if (currentPage < totalPages) {
                currentPage++;
                renderAgencies();
            }
        });

        $("agencies-table-body")?.addEventListener(
            "click",
            handleTableActions
        );
    }

    async function initializePage() {
        try {
            await initializeSupabase();

            const authenticated = await checkSession();

            if (!authenticated) return;

            setupEventListeners();

            await loadAgencies();

        } catch (error) {
            console.error("Agencies page error:", error);

            showMessage(
                error.message || "Unable to load agencies."
            );
        }
    }

    document.addEventListener("DOMContentLoaded", initializePage);
})();

