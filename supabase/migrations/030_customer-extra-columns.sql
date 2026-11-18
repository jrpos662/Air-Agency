-- =====================================================
-- MIGRATION 002: CUSTOMER EXTRA COLUMNS
--
-- The customer forms and pages already use these fields, and
-- delete-customer already sets is_active = false, but the columns
-- were missing from schema.sql.
-- Safe to run more than once.
-- =====================================================

alter table public.customers
    add column if not exists gender text,
    add column if not exists nationality text default 'Bangladeshi',
    add column if not exists date_of_birth date,
    add column if not exists passport_expiry date,
    add column if not exists is_active boolean not null default true;
