
-- =====================================================
-- AIR TICKET AGENCY MANAGEMENT
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- IMPORTANT:
-- Apply only after reviewing schema.sql,
-- schema-extra.sql and security-functions.sql.

-- 1. ENABLE RLS

alter table public.profiles enable row level security;
alter table public.agencies enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_passengers enable row level security;
alter table public.ticket_sales enable row level security;
alter table public.sale_passengers enable row level security;
alter table public.ticket_financials enable row level security;
alter table public.booking_documents enable row level security;
alter table public.ticket_documents enable row level security;
alter table public.customer_payments enable row level security;
alter table public.customer_payment_allocations enable row level security;
alter table public.agency_payments enable row level security;
alter table public.agency_payment_allocations enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.account_transfers enable row level security;
alter table public.refunds enable row level security;
alter table public.ticket_changes enable row level security;
alter table public.receipt_sequences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.agency_transactions enable row level security;


-- 2. PROFILES

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "Owner can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_owner());

create policy "Owner can update profiles"
on public.profiles
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());


-- 3. AGENCIES

create policy "Authenticated staff can view agencies"
on public.agencies
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Owner and manager can manage agencies"
on public.agencies
for all
to authenticated
using (public.is_owner_or_manager())
with check (public.is_owner_or_manager());


-- 4. CUSTOMERS

create policy "Staff can view customers"
on public.customers
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Authorized staff can insert customers"
on public.customers
for insert
to authenticated
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Owner manager and ticket staff can update customers"
on public.customers
for update
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);


-- 5. BOOKINGS

create policy "Staff can view bookings"
on public.bookings
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Ticket staff can create bookings"
on public.bookings
for insert
to authenticated
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);

create policy "Authorized staff can update bookings"
on public.bookings
for update
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);


-- 6. BOOKING PASSENGERS

create policy "Staff can view booking passengers"
on public.booking_passengers
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Ticket staff can manage booking passengers"
on public.booking_passengers
for all
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);


-- 7. TICKET SALES

create policy "Staff can view ticket sales"
on public.ticket_sales
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Ticket staff can create ticket sales"
on public.ticket_sales
for insert
to authenticated
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);

create policy "Authorized staff can update ticket sales"
on public.ticket_sales
for update
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);


-- 8. SALE PASSENGERS

create policy "Staff can view sale passengers"
on public.sale_passengers
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff',
        'accounts_staff'
    )
);

create policy "Ticket staff can manage sale passengers"
on public.sale_passengers
for all
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'ticket_staff'
    )
);


-- 9. TICKET FINANCIALS
-- Do not expose purchase price to ticket or accounts staff.
-- Keep table access restricted; use a separately secured
-- Owner/Manager-only backend function for financial data.

revoke all on table public.ticket_financials from anon, authenticated;


-- 10. CUSTOMER PAYMENTS

create policy "Authorized staff can view customer payments"
on public.customer_payments
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);

create policy "Accounts staff can manage customer payments"
on public.customer_payments
for all
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);


-- 11. AGENCY PAYMENTS

create policy "Authorized staff can view agency payments"
on public.agency_payments
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);

create policy "Accounts staff can manage agency payments"
on public.agency_payments
for all
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);


-- 12. EXPENSES

create policy "Accounts staff can view expenses"
on public.expenses
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);

create policy "Accounts staff can manage expenses"
on public.expenses
for all
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
)
with check (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);


-- 13. AGENCY TRANSACTIONS

create policy "Authorized staff can view agency ledger"
on public.agency_transactions
for select
to authenticated
using (
    public.current_user_role() in (
        'owner',
        'manager',
        'accounts_staff'
    )
);


-- 14. STAFF PERMISSIONS

create policy "Owner can manage staff permissions"
on public.staff_permissions
for all
to authenticated
using (public.is_owner())
with check (public.is_owner());


-- 15. AUDIT LOGS

create policy "Owner and manager can view audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_owner_or_manager());


-- =====================================================
-- END OF INITIAL POLICY DRAFT
-- =====================================================
