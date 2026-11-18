# PROJECT_PROGRESS

Last review: 2026-11-18 (static code review; nothing has been run against a live Supabase project yet)

## Fixed in this round
- Added missing Edge Function `manage-staff` (actions: list, create, update).
- Added missing Edge Functions `get-agency-details` and `get-agency-account-statement`,
  backed by new SQL function `get_agency_account_statement` (`supabase/agency-statement.sql`).
- Added RLS policies for tables that had RLS but no policy
  (`supabase/migrations/001_missing_rls_policies.sql`, `003_additional_read_policies.sql`).
- Added missing customer columns (`supabase/migrations/002_customer_extra_columns.sql`);
  `create-customer` now stores gender, nationality, date of birth, passport expiry, status.
- Fixed UI queries that used column names not in the schema
  (agencies, expense_categories, expenses, customer_payments, allocations,
  customer details, new customer payment). Sale status filter now uses real values.
- `enable_signup` set to false in `supabase/config.toml`.

## Round 9 changes
- Sidebar rewritten: one shared `js/sidebar.js` builds the same menu on every page.
  Root cause of the bug: JS toggled `.active` but CSS used `.open`, so the mobile drawer never opened.
  Also fixed: menus differed page to page (11-16 links), active link highlight, overlay + Esc close,
  desktop collapse button, sticky sidebar, Staff/Settings/Audit Logs hidden for non owner/manager (UI only).
- All SQL moved into `supabase/migrations/` with timestamp names (run order = file name order).
- Removed invalid "reversal" filter (not allowed by agency_transactions CHECK).

## Run order for the database (automatic via GitHub Actions, see GITHUB_SETUP.md)
`supabase db push` (or run the files in `supabase/migrations/` top to bottom in the SQL Editor),
then deploy Edge Functions (`supabase functions deploy <name>`).

## Known gaps (not done yet)
- No file upload UI or Storage bucket for Booking/Ticket documents.
- No UI that calls: record-agency-payment, record-ticket-change, generate-receipt.
- Edge Functions not called by any page: create/update/delete-staff (replaced by manage-staff),
  update-customer, update-agency, update-booking, deactivate-agency, delete-customer, list-*.
- CORS is `*` in most Edge Functions; restrict to the production domain before launch.
- Supabase URL/Key in `js/supabase-config.js` are still placeholders.
- PDF, Thermal print, WhatsApp share and Backup are unverified.
- Android (Capacitor) not started.
- No automated or manual test results yet.
