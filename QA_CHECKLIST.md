# Pre-release / live validation checklist

## Offline checks (run locally before upload)
- [ ] Run `python3 tools/validate-project.py` (Node.js required for JS syntax checks).
- [ ] Confirm GitHub repository secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.
- [ ] Confirm the Supabase project reference matches the URL in `js/supabase-config.js`.

## Live checks (must be performed against the intended Supabase project)
- [ ] Sign in / sign out and password recovery flow.
- [ ] Owner and non-owner permissions, staff permissions, disabled account handling.
- [ ] CRUD workflows: agencies, customers, bookings, passengers, ticket sales.
- [ ] Payments, refunds, ticket changes, transfers, expenses and account balances.
- [ ] Reports, audit logs and settings.
- [ ] Document storage/upload and permissions (if enabled).
- [ ] Receipt generation, print/PDF and backup/restore.
- [ ] Verify CORS allowlist is configured for the production site domain.
- [ ] Confirm migrations and Edge Functions deploy successfully from GitHub Actions.

Offline checks do not prove live backend behavior; complete the live checklist before production use.
