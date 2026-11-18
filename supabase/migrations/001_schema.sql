-- Air Ticket Agency Management
-- Database schema will be designed and reviewed before applying to production.

-- =====================================================
-- AIR TICKET AGENCY MANAGEMENT
-- MAIN DATABASE SCHEMA
-- Supabase / PostgreSQL
-- =====================================================

create extension if not exists pgcrypto;


-- =====================================================
-- 1. STAFF PROFILES
-- =====================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete restrict,
    full_name text,
    phone text,
    email text,
    role text not null default 'ticket_staff'
        check (role in (
            'owner',
            'manager',
            'ticket_staff',
            'accounts_staff'
        )),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- =====================================================
-- 2. AGENCIES
-- =====================================================

create table if not exists public.agencies (
    id uuid primary key default gen_random_uuid(),
    agency_name text not null,
    contact_person text,
    mobile text,
    whatsapp text,
    email text,
    address text,
    account_reference text,
    opening_balance numeric(14,2) not null default 0,
    notes text,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- =====================================================
-- 3. CUSTOMERS
-- =====================================================

create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),
    customer_code text unique,
    full_name text not null,
    phone text not null,
    whatsapp text,
    email text,
    address text,
    passport_number text,
    notes text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- =====================================================
-- 4. BOOKINGS
-- =====================================================

create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    booking_reference text not null unique,

    customer_id uuid not null
        references public.customers(id) on delete restrict,

    agency_id uuid
        references public.agencies(id) on delete restrict,

    booking_status text not null default 'pending'
        check (booking_status in (
            'pending',
            'submitted',
            'confirmed',
            'ticketed',
            'cancelled',
            'expired'
        )),

    booking_date date not null default current_date,
    travel_date date,
    return_date date,

    origin text,
    destination text,
    trip_type text default 'one_way'
        check (trip_type in ('one_way', 'round_trip', 'multi_city')),

    pnr text,
    airline text,

    passenger_count integer not null default 1
        check (passenger_count > 0),

    quoted_amount numeric(14,2) not null default 0,
    advance_amount numeric(14,2) not null default 0,
    notes text,

    converted_sale_id uuid,

    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    check (quoted_amount >= 0),
    check (advance_amount >= 0),
    check (advance_amount <= quoted_amount)
);


-- =====================================================
-- 5. BOOKING PASSENGERS
-- =====================================================

create table if not exists public.booking_passengers (
    id uuid primary key default gen_random_uuid(),

    booking_id uuid not null
        references public.bookings(id) on delete restrict,

    passenger_name text not null,
    passenger_type text default 'adult'
        check (passenger_type in ('adult', 'child', 'infant')),

    passport_number text,
    date_of_birth date,
    gender text,
    nationality text,

    created_at timestamptz not null default now()
);


-- =====================================================
-- 6. TICKET SALES
-- =====================================================

create table if not exists public.ticket_sales (
    id uuid primary key default gen_random_uuid(),
    sale_reference text not null unique,

    customer_id uuid not null
        references public.customers(id) on delete restrict,

    booking_id uuid unique
        references public.bookings(id) on delete restrict,

    sale_date date not null default current_date,

    sale_type text not null default 'direct'
        check (sale_type in ('direct', 'booking_converted')),

    sale_status text not null default 'issued'
        check (sale_status in (
            'issued',
            'partially_refunded',
            'refunded',
            'cancelled'
        )),

    selling_total numeric(14,2) not null default 0,
    discount_amount numeric(14,2) not null default 0,

    notes text,

    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    check (selling_total >= 0),
    check (discount_amount >= 0),
    check (discount_amount <= selling_total),

    check (
        (sale_type = 'direct' and booking_id is null)
        or
        (sale_type = 'booking_converted' and booking_id is not null)
    )
);


-- =====================================================
-- 7. SALE PASSENGERS / TICKETS
-- =====================================================

create table if not exists public.sale_passengers (
    id uuid primary key default gen_random_uuid(),

    sale_id uuid not null
        references public.ticket_sales(id) on delete restrict,

    booking_passenger_id uuid unique
        references public.booking_passengers(id) on delete restrict,

    agency_id uuid
        references public.agencies(id) on delete restrict,

    passenger_name text not null,
    passenger_type text default 'adult'
        check (passenger_type in ('adult', 'child', 'infant')),

    passport_number text,
    ticket_number text,
    pnr text,
    airline text,

    flight_number text,
    origin text,
    destination text,
    departure_at timestamptz,
    arrival_at timestamptz,

    selling_price numeric(14,2) not null default 0,

    ticket_status text not null default 'issued'
        check (ticket_status in (
            'issued',
            'cancelled',
            'refunded',
            'changed'
        )),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    check (selling_price >= 0)
);


-- =====================================================
-- 8. RESTRICTED TICKET FINANCIALS
-- Purchase Price and protected financial information
-- =====================================================

create table if not exists public.ticket_financials (
    sale_passenger_id uuid primary key
        references public.sale_passengers(id) on delete restrict,

    agency_id uuid
        references public.agencies(id) on delete restrict,

    purchase_price numeric(14,2) not null default 0,
    additional_cost numeric(14,2) not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    check (purchase_price >= 0),
    check (additional_cost >= 0)
);


-- =====================================================
-- 9. BOOKING DOCUMENTS
-- =====================================================

create table if not exists public.booking_documents (
    id uuid primary key default gen_random_uuid(),

    booking_id uuid not null
        references public.bookings(id) on delete restrict,

    file_name text not null,
    file_path text not null,
    file_type text,
    uploaded_by uuid references public.profiles(id) on delete set null,

    created_at timestamptz not null default now()
);


-- =====================================================
-- 10. TICKET DOCUMENTS
-- =====================================================

create table if not exists public.ticket_documents (
    id uuid primary key default gen_random_uuid(),

    sale_id uuid not null
        references public.ticket_sales(id) on delete restrict,

    sale_passenger_id uuid
        references public.sale_passengers(id) on delete restrict,

    file_name text not null,
    file_path text not null,
    file_type text,

    uploaded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);


-- =====================================================
-- 11. CUSTOMER PAYMENTS
-- =====================================================

create table if not exists public.customer_payments (
    id uuid primary key default gen_random_uuid(),

    customer_id uuid not null
        references public.customers(id) on delete restrict,

    payment_reference text unique,
    payment_date timestamptz not null default now(),

    amount numeric(14,2) not null,
    payment_method text not null default 'cash'
        check (payment_method in (
            'cash',
            'bank',
            'mobile_banking',
            'card',
            'other'
        )),

    transaction_reference text,
    notes text,

    received_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (amount > 0)
);


-- =====================================================
-- 12. CUSTOMER PAYMENT ALLOCATIONS
-- A payment can be allocated to a booking OR a sale
-- =====================================================

create table if not exists public.customer_payment_allocations (
    id uuid primary key default gen_random_uuid(),

    payment_id uuid not null
        references public.customer_payments(id) on delete restrict,

    sale_id uuid
        references public.ticket_sales(id) on delete restrict,

    booking_id uuid
        references public.bookings(id) on delete restrict,

    allocated_amount numeric(14,2) not null,

    created_at timestamptz not null default now(),

    check (allocated_amount > 0),
    check (
        (sale_id is not null and booking_id is null)
        or
        (sale_id is null and booking_id is not null)
    )
);


-- =====================================================
-- 13. AGENCY PAYMENTS
-- =====================================================

create table if not exists public.agency_payments (
    id uuid primary key default gen_random_uuid(),

    agency_id uuid not null
        references public.agencies(id) on delete restrict,

    payment_reference text unique,
    payment_date timestamptz not null default now(),

    amount numeric(14,2) not null,

    payment_method text not null default 'cash'
        check (payment_method in (
            'cash',
            'bank',
            'mobile_banking',
            'card',
            'other'
        )),

    transaction_reference text,
    notes text,

    paid_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (amount > 0)
);


-- =====================================================
-- 14. AGENCY PAYMENT ALLOCATIONS
-- =====================================================

create table if not exists public.agency_payment_allocations (
    id uuid primary key default gen_random_uuid(),

    payment_id uuid not null
        references public.agency_payments(id) on delete restrict,

    sale_passenger_id uuid
        references public.sale_passengers(id) on delete restrict,

    allocated_amount numeric(14,2) not null,

    created_at timestamptz not null default now(),

    check (allocated_amount > 0)
);


-- =====================================================
-- 15. EXPENSE CATEGORIES
-- =====================================================

create table if not exists public.expense_categories (
    id uuid primary key default gen_random_uuid(),

    category_name text not null unique,
    description text,
    is_active boolean not null default true,

    created_at timestamptz not null default now()
);


-- =====================================================
-- 16. EXPENSES
-- =====================================================

create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),

    expense_reference text unique,

    category_id uuid
        references public.expense_categories(id) on delete restrict,

    expense_title text not null,
    amount numeric(14,2) not null,

    expense_date date not null default current_date,

    payment_method text not null default 'cash'
        check (payment_method in (
            'cash',
            'bank',
            'mobile_banking',
            'other'
        )),

    notes text,

    recorded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (amount > 0)
);


-- =====================================================
-- 17. CASH & BANK ACCOUNTS
-- =====================================================

create table if not exists public.cash_accounts (
    id uuid primary key default gen_random_uuid(),

    account_name text not null,
    account_type text not null
        check (account_type in (
            'cash',
            'bank',
            'mobile_banking'
        )),

    bank_name text,
    account_number text,

    opening_balance numeric(14,2) not null default 0,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),

    check (opening_balance >= 0)
);


-- =====================================================
-- 18. CASH TRANSACTIONS
-- =====================================================

create table if not exists public.cash_transactions (
    id uuid primary key default gen_random_uuid(),

    account_id uuid not null
        references public.cash_accounts(id) on delete restrict,

    transaction_type text not null
        check (transaction_type in ('in', 'out')),

    amount numeric(14,2) not null,

    transaction_date timestamptz not null default now(),

    reference_type text,
    reference_id uuid,

    description text,

    recorded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (amount > 0)
);


-- =====================================================
-- 19. ACCOUNT TRANSFERS
-- =====================================================

create table if not exists public.account_transfers (
    id uuid primary key default gen_random_uuid(),

    from_account_id uuid not null
        references public.cash_accounts(id) on delete restrict,

    to_account_id uuid not null
        references public.cash_accounts(id) on delete restrict,

    amount numeric(14,2) not null,

    transfer_date timestamptz not null default now(),
    reference_number text unique,
    notes text,

    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (amount > 0),
    check (from_account_id <> to_account_id)
);


-- =====================================================
-- 20. REFUNDS
-- =====================================================

create table if not exists public.refunds (
    id uuid primary key default gen_random_uuid(),

    sale_id uuid not null
        references public.ticket_sales(id) on delete restrict,

    sale_passenger_id uuid
        references public.sale_passengers(id) on delete restrict,

    refund_reference text unique,

    refund_amount numeric(14,2) not null,
    refund_date timestamptz not null default now(),

    refund_type text not null default 'customer'
        check (refund_type in (
            'customer',
            'agency',
            'other'
        )),

    reason text,
    notes text,

    processed_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (refund_amount > 0)
);


-- =====================================================
-- 21. TICKET CHANGES / REISSUES
-- =====================================================

create table if not exists public.ticket_changes (
    id uuid primary key default gen_random_uuid(),

    sale_passenger_id uuid not null
        references public.sale_passengers(id) on delete restrict,

    change_type text not null
        check (change_type in (
            'reissue',
            'date_change',
            'route_change',
            'name_correction',
            'other'
        )),

    old_ticket_number text,
    new_ticket_number text,

    additional_charge numeric(14,2) not null default 0,
    additional_cost numeric(14,2) not null default 0,

    reason text,
    changed_at timestamptz not null default now(),

    changed_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    check (additional_charge >= 0),
    check (additional_cost >= 0)
);


-- =====================================================
-- 22. RECEIPT SEQUENCES
-- =====================================================

create table if not exists public.receipt_sequences (
    id uuid primary key default gen_random_uuid(),

    sequence_type text not null unique,
    last_number bigint not null default 0,

    updated_at timestamptz not null default now(),

    check (last_number >= 0)
);


-- =====================================================
-- 23. AUDIT LOGS
-- =====================================================

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),

    user_id uuid references public.profiles(id) on delete set null,

    action text not null,
    table_name text,
    record_id uuid,

    old_data jsonb,
    new_data jsonb,

    ip_address text,
    user_agent text,

    created_at timestamptz not null default now()
);


-- =====================================================
-- 24. UPDATED_AT FUNCTION
-- =====================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- =====================================================
-- 25. UPDATED_AT TRIGGERS
-- =====================================================

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'profiles',
        'agencies',
        'customers',
        'bookings',
        'ticket_sales',
        'sale_passengers',
        'ticket_financials'
    ]
    loop
        execute format(
            'drop trigger if exists set_updated_at on public.%I',
            table_name
        );

        execute format(
            'create trigger set_updated_at
             before update on public.%I
             for each row execute function public.set_updated_at()',
            table_name
        );
    end loop;
end;
$$;


-- =====================================================
-- 26. IMPORTANT INDEXES
-- =====================================================

create index if not exists idx_customers_phone
    on public.customers(phone);

create index if not exists idx_bookings_customer
    on public.bookings(customer_id);

create index if not exists idx_bookings_status
    on public.bookings(booking_status);

create index if not exists idx_bookings_date
    on public.bookings(booking_date);

create index if not exists idx_booking_passengers_booking
    on public.booking_passengers(booking_id);

create index if not exists idx_ticket_sales_customer
    on public.ticket_sales(customer_id);

create index if not exists idx_ticket_sales_date
    on public.ticket_sales(sale_date);

create index if not exists idx_sale_passengers_sale
    on public.sale_passengers(sale_id);

create index if not exists idx_sale_passengers_agency
    on public.sale_passengers(agency_id);

create index if not exists idx_customer_payments_customer
    on public.customer_payments(customer_id);

create index if not exists idx_agency_payments_agency
    on public.agency_payments(agency_id);

create index if not exists idx_expenses_date
    on public.expenses(expense_date);

create index if not exists idx_cash_transactions_account
    on public.cash_transactions(account_id);

create index if not exists idx_audit_logs_created
    on public.audit_logs(created_at desc);


-- =====================================================
-- END OF MAIN SCHEMA
-- =====================================================




-- =====================================================
-- AIR TICKET AGENCY MANAGEMENT
-- ADDITIONAL DATABASE TABLES
-- =====================================================

-- 1. STAFF PERMISSIONS

create table if not exists public.staff_permissions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id) on delete cascade,

    permission_key text not null,

    is_allowed boolean not null default false,

    granted_by uuid
        references public.profiles(id) on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (user_id, permission_key)
);


-- 2. AGENCY TRANSACTIONS / LEDGER

create table if not exists public.agency_transactions (
    id uuid primary key default gen_random_uuid(),

    agency_id uuid not null
        references public.agencies(id) on delete restrict,

    transaction_reference text unique,

    transaction_type text not null
        check (transaction_type in (
            'ticket_purchase',
            'payment',
            'refund',
            'adjustment',
            'opening_balance'
        )),

    debit_amount numeric(14,2) not null default 0,
    credit_amount numeric(14,2) not null default 0,

    transaction_date timestamptz not null default now(),

    sale_passenger_id uuid
        references public.sale_passengers(id) on delete restrict,

    agency_payment_id uuid
        references public.agency_payments(id) on delete restrict,

    description text,
    notes text,

    recorded_by uuid
        references public.profiles(id) on delete set null,

    created_at timestamptz not null default now(),

    check (debit_amount >= 0),
    check (credit_amount >= 0),
    check (
        (debit_amount > 0 and credit_amount = 0)
        or
        (credit_amount > 0 and debit_amount = 0)
    )
);


-- 3. INDEXES

create index if not exists idx_staff_permissions_user
    on public.staff_permissions(user_id);

create index if not exists idx_agency_transactions_agency
    on public.agency_transactions(agency_id);

create index if not exists idx_agency_transactions_date
    on public.agency_transactions(transaction_date desc);

create index if not exists idx_agency_transactions_sale
    on public.agency_transactions(sale_passenger_id);


-- 4. ENABLE RLS

alter table public.staff_permissions enable row level security;
alter table public.agency_transactions enable row level security;


-- =====================================================
-- END
-- =====================================================
