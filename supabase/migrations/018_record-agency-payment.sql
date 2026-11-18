
-- =========================================================
-- AIR TICKET AGENCY MANAGEMENT
-- RECORD AGENCY PAYMENT
-- ZIP 5 SCHEMA-COMPATIBLE VERSION
-- =========================================================

-- Remove the previous RPC signature.
drop function if exists public.record_agency_payment(
    uuid,
    numeric,
    text,
    text,
    text,
    uuid
);

create or replace function public.record_agency_payment(
    p_agency_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_account_id uuid,
    p_payment_date date,
    p_payment_reference text default null,
    p_transaction_reference text default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_role text;

    v_agency_name text;
    v_account public.cash_accounts%rowtype;

    v_payment_id uuid;
    v_payment_reference text;
    v_payment_timestamp timestamptz;

    v_method text;
    v_required_account_type text;
begin

    -- -----------------------------------------------------
    -- 1. AUTHENTICATION
    -- -----------------------------------------------------

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required.';
    end if;

    select lower(p.role)
    into v_role
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true;

    if v_role is null then
        raise exception 'Active staff profile not found.';
    end if;

    if v_role not in (
        'owner',
        'manager',
        'accounts_staff'
    ) then
        raise exception 'You cannot record agency payments.';
    end if;


    -- -----------------------------------------------------
    -- 2. INPUT VALIDATION
    -- -----------------------------------------------------

    if p_agency_id is null then
        raise exception 'Agency is required.';
    end if;

    if p_amount is null
       or p_amount <= 0
       or p_amount > 999999999999.99 then
        raise exception 'Invalid payment amount.';
    end if;

    if p_amount <> round(p_amount, 2) then
        raise exception 'Payment amount supports up to two decimal places.';
    end if;

    v_method := lower(trim(coalesce(p_payment_method, '')));

    if v_method not in (
        'cash',
        'bank',
        'mobile_banking',
        'card'
    ) then
        raise exception 'Invalid payment method.';
    end if;

    if p_account_id is null then
        raise exception 'Select a payment account.';
    end if;

    if p_payment_date is null then
        raise exception 'Payment date is required.';
    end if;

    if p_payment_date > (
        now() at time zone 'Asia/Dhaka'
    )::date then
        raise exception 'Payment date cannot be in the future.';
    end if;

    if p_payment_reference is not null
       and length(trim(p_payment_reference)) > 100 then
        raise exception 'Payment reference is too long.';
    end if;

    if p_transaction_reference is not null
       and length(trim(p_transaction_reference)) > 150 then
        raise exception 'Transaction reference is too long.';
    end if;

    if p_notes is not null
       and length(p_notes) > 2000 then
        raise exception 'Payment notes are too long.';
    end if;


    -- -----------------------------------------------------
    -- 3. VERIFY AND LOCK AGENCY
    -- -----------------------------------------------------

    select a.agency_name
    into v_agency_name
    from public.agencies a
    where a.id = p_agency_id
    for update;

    if not found then
        raise exception 'Agency not found.';
    end if;


    -- -----------------------------------------------------
    -- 4. VERIFY PAYMENT ACCOUNT
    -- -----------------------------------------------------

    select *
    into v_account
    from public.cash_accounts ca
    where ca.id = p_account_id
      and ca.is_active = true
    for update;

    if not found then
        raise exception 'Payment account not found or inactive.';
    end if;

    -- Card payments are recorded through a bank account.
    v_required_account_type :=
        case
            when v_method = 'card' then 'bank'
            else v_method
        end;

    if v_account.account_type <> v_required_account_type then
        raise exception
            'The selected account does not match the payment method.';
    end if;


    -- -----------------------------------------------------
    -- 5. PAYMENT DATE AND REFERENCE
    -- -----------------------------------------------------

    v_payment_timestamp :=
        p_payment_date::timestamp
        at time zone 'Asia/Dhaka';

    v_payment_reference :=
        coalesce(
            nullif(trim(p_payment_reference), ''),
            'AGPAY-' ||
            to_char(p_payment_date, 'YYYYMMDD') ||
            '-' ||
            upper(substr(
                replace(gen_random_uuid()::text, '-', ''),
                1,
                8
            ))
        );


    -- -----------------------------------------------------
    -- 6. CREATE AGENCY PAYMENT
    -- -----------------------------------------------------

    insert into public.agency_payments (
        agency_id,
        payment_reference,
        payment_date,
        amount,
        payment_method,
        transaction_reference,
        notes,
        paid_by
    )
    values (
        p_agency_id,
        v_payment_reference,
        v_payment_timestamp,
        p_amount,
        v_method,
        nullif(trim(coalesce(p_transaction_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        v_user_id
    )
    returning id into v_payment_id;


    -- -----------------------------------------------------
    -- 7. AGENCY LEDGER
    --
    -- Ticket Purchase = Debit (increases payable)
    -- Agency Payment  = Credit (reduces payable)
    -- -----------------------------------------------------

    insert into public.agency_transactions (
        agency_id,
        transaction_reference,
        transaction_type,
        debit_amount,
        credit_amount,
        transaction_date,
        agency_payment_id,
        description,
        notes,
        recorded_by
    )
    values (
        p_agency_id,
        'AGPAY-' || v_payment_id::text,
        'payment',
        0,
        p_amount,
        v_payment_timestamp,
        v_payment_id,
        'Payment made to agency: ' || v_agency_name,
        nullif(trim(coalesce(p_notes, '')), ''),
        v_user_id
    );


    -- -----------------------------------------------------
    -- 8. CASH/BANK OUTFLOW
    -- -----------------------------------------------------

    insert into public.cash_transactions (
        account_id,
        transaction_type,
        amount,
        transaction_date,
        reference_type,
        reference_id,
        description,
        recorded_by
    )
    values (
        p_account_id,
        'out',
        p_amount,
        v_payment_timestamp,
        'agency_payment',
        v_payment_id,
        'Payment made to agency: ' || v_agency_name,
        v_user_id
    );


    -- -----------------------------------------------------
    -- 9. AUDIT LOG
    -- -----------------------------------------------------

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        created_at
    )
    values (
        v_user_id,
        'CREATE',
        'agency_payments',
        v_payment_id,
        null,
        jsonb_build_object(
            'agency_id', p_agency_id,
            'agency_name', v_agency_name,
            'payment_reference', v_payment_reference,
            'amount', p_amount,
            'payment_method', v_method,
            'account_id', p_account_id,
            'payment_date', p_payment_date,
            'transaction_reference', p_transaction_reference
        ),
        now()
    );


    -- -----------------------------------------------------
    -- 10. RETURN
    -- -----------------------------------------------------

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_reference', v_payment_reference,
        'agency_id', p_agency_id,
        'amount', p_amount,
        'payment_method', v_method,
        'payment_date', p_payment_date,
        'message', 'Agency payment recorded successfully.'
    );

end;
$$;


-- ---------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------

revoke all on function public.record_agency_payment(
    uuid,
    numeric,
    text,
    uuid,
    date,
    text,
    text,
    text
) from public, anon;

grant execute on function public.record_agency_payment(
    uuid,
    numeric,
    text,
    uuid,
    date,
    text,
    text,
    text
) to authenticated;


-- =========================================================
-- END
-- =========================================================
