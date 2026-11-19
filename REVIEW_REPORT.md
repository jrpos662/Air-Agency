# Review & Fix Report — Air Agency Management System

## Fixes applied
- Sidebar now resolves the signed-in profile role on every page instead of relying only on Dashboard to set `body.dataset.userRole`.
- If role lookup fails, navigation links remain visible for discoverability; authorization must still be enforced by page code and Supabase policies/functions.
- Staff Management and Settings are Owner-only in the sidebar; Audit Logs remains Owner/Manager.
- Active navigation positioning now scrolls only the sidebar navigation, not the document.
- Sidebar uses viewport-height sizing, `min-height: 0`, contained scrolling, and mobile momentum scrolling so long menus can be scrolled.
- Removed 33 accidental duplicate HTML files from the `css/` directory; actual page files remain in `pages/`.

## Offline validation
- JavaScript syntax check: passed (`node --check` for all JS files).
- Local HTML asset references: passed (no missing local assets detected).
- Page inventory: 33 HTML pages in `pages/`.

## Items requiring live Supabase verification
Offline review cannot confirm database grants, RLS behavior, deployed Edge Functions, secrets, or the production user's role. Before launch, test Owner, Manager, Ticket Staff, and Accounts Staff accounts. If a live error says `permission denied for table ...`, record the exact table/function and confirm both SQL privileges (`GRANT`) and RLS policies. RLS policies alone do not grant table privileges.

## Recommended live test order
1. Owner: login, Sidebar, Staff, Settings, Audit Logs, all CRUD.
2. Manager: permitted management/report screens; verify Owner-only Settings/Staff actions are blocked.
3. Ticket Staff: bookings/ticket sales and related screens.
4. Accounts Staff: payments, expenses, cash/bank, transfers and receipts.
5. Mobile: open/close sidebar, scroll to bottom, tap each link, close via overlay and Escape.
6. Check browser console/network for 401/403, missing assets, RPC errors and Edge Function errors.
