-- =====================================================
-- MIGRATION 001: MISSING RLS POLICIES
--
-- These tables had Row Level Security enabled but no policy,
-- so every direct read from the browser returned an empty result:
--   cash_accounts, expense_categories, refunds
--
-- Writes to cash_accounts and refunds stay Edge Function / SQL-function
-- only (no INSERT/UPDATE policy on purpose).
-- Safe to run more than once.
-- =====================================================

-- 1. CASH ACCOUNTS (read-only from the browser)

drop policy if exists "Finance staff can view cash accounts"
    on public.cash_accounts;

create policy "Finance staff can view cash accounts"
on public.cash_accounts
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);


-- 2. EXPENSE CATEGORIES

drop policy if exists "Finance staff can view expense categories"
    on public.expense_categories;

create policy "Finance staff can view expense categories"
on public.expense_categories
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);

drop policy if exists "Owner and manager can create expense categories"
    on public.expense_categories;

create policy "Owner and manager can create expense categories"
on public.expense_categories
for insert
to authenticated
with check (
    public.current_user_role() in ('owner', 'manager')
);

drop policy if exists "Owner and manager can update expense categories"
    on public.expense_categories;

create policy "Owner and manager can update expense categories"
on public.expense_categories
for update
to authenticated
using (
    public.current_user_role() in ('owner', 'manager')
)
with check (
    public.current_user_role() in ('owner', 'manager')
);


-- 3. REFUNDS (read-only from the browser; created by record_ticket_refund)

drop policy if exists "Authorized staff can view refunds"
    on public.refunds;

create policy "Authorized staff can view refunds"
on public.refunds
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff',
        'ticket_staff'
    )
);
