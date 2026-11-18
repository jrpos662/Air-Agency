-- =====================================================
-- MIGRATION 003: ADDITIONAL READ-ONLY POLICIES
--
-- RLS was enabled on these tables without any policy, so browser
-- reads returned nothing. Only SELECT is granted; all writes still
-- go through SQL functions / Edge Functions.
-- Safe to run more than once.
-- =====================================================

-- Cash transactions: used to find the account of a customer payment.
drop policy if exists "Finance staff can view cash transactions"
    on public.cash_transactions;

create policy "Finance staff can view cash transactions"
on public.cash_transactions
for select
to authenticated
using (
    public.current_user_role() in ('owner', 'manager', 'accounts_staff')
);

-- Account transfers
drop policy if exists "Finance staff can view account transfers"
    on public.account_transfers;

create policy "Finance staff can view account transfers"
on public.account_transfers
for select
to authenticated
using (
    public.current_user_role() in ('owner', 'manager', 'accounts_staff')
);

-- Ticket changes (reissue, date change, name correction)
drop policy if exists "Staff can view ticket changes"
    on public.ticket_changes;

create policy "Staff can view ticket changes"
on public.ticket_changes
for select
to authenticated
using (
    public.current_user_role() in (
        'owner', 'manager', 'ticket_staff', 'accounts_staff'
    )
);

-- Booking and ticket documents (metadata only)
drop policy if exists "Staff can view booking documents"
    on public.booking_documents;

create policy "Staff can view booking documents"
on public.booking_documents
for select
to authenticated
using (
    public.current_user_role() in (
        'owner', 'manager', 'ticket_staff', 'accounts_staff'
    )
);

drop policy if exists "Staff can view ticket documents"
    on public.ticket_documents;

create policy "Staff can view ticket documents"
on public.ticket_documents
for select
to authenticated
using (
    public.current_user_role() in (
        'owner', 'manager', 'ticket_staff', 'accounts_staff'
    )
);
