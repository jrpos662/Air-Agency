
-- =========================================================
-- AIR TICKET AGENCY MANAGEMENT
-- CUSTOMER PAYMENT RPC
-- Schema: Air Agency Management Software 5.zip
--
-- Handles:
-- 1. Customer payment
-- 2. Payment date and receiving account
-- 3. Multiple sale allocations
-- 4. Outstanding balance validation
-- 5. Cash/bank income transaction
-- 6. Audit log
--
-- All operations are atomic.
-- =========================================================

create or replace function public.record_customer_payment(
    p_customer_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_account_id uuid,
    p_payment_date date,
    p_payment_reference text default null,
    p_notes text default null,
    p_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_role text;

    v_payment_id uuid;
    v_payment_reference text;

    v_account public.cash_accounts%rowtype;

    v_allocation jsonb;
    v_sale_id uuid;
    v_allocation_amount numeric(14,2);
    v_sale_total numeric(14,2);
    v_already_allocated numeric(14,2);
    v_customer_refunds numeric(14,2);

    v_total_allocated numeric(14,2) := 0;
    v_allocation_count integer := 0;

    v_method text;
    v_payment_timestamp timestamptz;
begin

    -- -----------------------------------------------------
    -- 1. AUTHENTICATION AND ACTIVE ROLE
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
        raise exception 'You cannot record customer payments.';
    end if;


    -- -----------------------------------------------------
    -- 2. INPUT VALIDATION
    -- -----------------------------------------------------

    if p_customer_id is null then
        raise exception 'Customer is required.';
    end if;

    if p_amount is null
       or p_amount <= 0
       or p_amount > 999999999999 then
        raise exception 'Invalid payment amount.';
    end if;

    v_method := lower(trim(coalesce(p_payment_method, '')));

    if v_method not in (
        'cash',
        'bank',
        'mobile_banking',
        'card',
        'other'
    ) then
        raise exception 'Invalid payment method.';
    end if;

    if p_account_id is null then
        raise exception 'Receiving account is required.';
    end if;

    if p_payment_date is null then
        raise exception 'Payment date is required.';
    end if;

    if p_payment_date > (
        now() at time zone 'Asia/Dhaka'
    )::date then
        raise exception 'Payment date cannot be in the future.';
    end if;

    if p_allocations is null
       or jsonb_typeof(p_allocations) <> 'array' then
        raise exception 'Invalid payment allocations.';
    end if;

    v_allocation_count := jsonb_array_length(p_allocations);

    if v_allocation_count > 20 then
        raise exception 'Maximum 20 allocations are allowed.';
    end if;

    if p_payment_reference is not null
       and length(trim(p_payment_reference)) > 100 then
        raise exception 'Payment reference is too long.';
    end if;

    if p_notes is not null
       and length(p_notes) > 2000 then
        raise exception 'Payment notes are too long.';
    end if;


    -- -----------------------------------------------------
    -- 3. VERIFY CUSTOMER
    -- -----------------------------------------------------

    perform 1
    from public.customers c
    where c.id = p_customer_id
    for update;

    if not found then
        raise exception 'Customer not found.';
    end if;


    -- -----------------------------------------------------
    -- 4. VERIFY RECEIVING ACCOUNT
    -- -----------------------------------------------------

    select *
    into v_account
    from public.cash_accounts ca
    where ca.id = p_account_id
      and ca.is_active = true
    for update;

    if not found then
        raise exception 'Receiving account not found or inactive.';
    end if;

    if v_method = 'cash'
       and v_account.account_type <> 'cash' then
        raise exception 'Select a cash account for cash payment.';
    end if;

    if v_method = 'bank'
       and v_account.account_type not in (
           'bank',
           'mobile_banking'
       ) then
        raise exception 'Select a bank or mobile banking account.';
    end if;

    if v_method = 'mobile_banking'
       and v_account.account_type <> 'mobile_banking' then
        raise exception 'Select a mobile banking account.';
    end if;


    -- -----------------------------------------------------
    -- 5. VALIDATE ALLOCATIONS BEFORE INSERT
    -- -----------------------------------------------------

    for v_allocation in
        select value
        from jsonb_array_elements(p_allocations)
    loop

        begin
            v_sale_id :=
                (v_allocation ->> 'sale_id')::uuid;

            v_allocation_amount :=
                (v_allocation ->> 'amount')::numeric;
        exception
            when others then
                raise exception 'Invalid allocation data.';
        end;

        if v_sale_id is null
           or v_allocation_amount is null
           or v_allocation_amount <= 0 then
            raise exception 'Every allocation must have a sale and positive amount.';
        end if;

        v_total_allocated :=
            v_total_allocated + v_allocation_amount;

        if v_total_allocated > p_amount then
            raise exception 'Allocated amount cannot exceed payment amount.';
        end if;

        -- Lock sale row to prevent concurrent over-allocation.
        perform 1
        from public.ticket_sales s
        where s.id = v_sale_id
          and s.customer_id = p_customer_id
          and s.sale_status not in ('cancelled', 'refunded')
        for update;

        if not found then
            raise exception 'A selected ticket sale is invalid.';
        end if;

        -- Reject duplicate sale allocations.
        if (
            select count(*)
            from jsonb_array_elements(p_allocations) x
            where x.value ->> 'sale_id' =
                  v_sale_id::text
        ) > 1 then
            raise exception 'The same ticket sale cannot be allocated more than once.';
        end if;

        select
            greatest(
                s.selling_total - s.discount_amount,
                0
            )
        into v_sale_total
        from public.ticket_sales s
        where s.id = v_sale_id;

        select coalesce(sum(a.allocated_amount), 0)
        into v_already_allocated
        from public.customer_payment_allocations a
        where a.sale_id = v_sale_id;

        select coalesce(sum(r.refund_amount), 0)
        into v_customer_refunds
        from public.refunds r
        where r.sale_id = v_sale_id
          and r.refund_type = 'customer';

        if v_allocation_amount >
           greatest(
               v_sale_total
               - v_already_allocated
               - v_customer_refunds,
               0
           ) then
            raise exception
                'Allocation exceeds the outstanding balance of a selected sale.';
        end if;

    end loop;


    -- -----------------------------------------------------
    -- 6. PAYMENT DATE AND REFERENCE
    -- -----------------------------------------------------

    v_payment_timestamp :=
        p_payment_date::timestamp
        at time zone 'Asia/Dhaka';

    v_payment_reference :=
        coalesce(
            nullif(trim(p_payment_reference), ''),
            'CP-' ||
            to_char(p_payment_date, 'YYYYMMDD') ||
            '-' ||
            upper(substr(
                replace(gen_random_uuid()::text, '-', ''),
                1,
                8
            ))
        );


    -- -----------------------------------------------------
    -- 7. CREATE CUSTOMER PAYMENT
    -- -----------------------------------------------------

    insert into public.customer_payments (
        customer_id,
        payment_reference,
        payment_date,
        amount,
        payment_method,
        transaction_reference,
        notes,
        received_by
    )
    values (
        p_customer_id,
        v_payment_reference,
        v_payment_timestamp,
        p_amount,
        v_method,
        nullif(trim(coalesce(p_payment_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        v_user_id
    )
    returning id into v_payment_id;


    -- -----------------------------------------------------
    -- 8. CREATE PAYMENT ALLOCATIONS
    -- -----------------------------------------------------

    for v_allocation in
        select value
        from jsonb_array_elements(p_allocations)
    loop

        v_sale_id :=
            (v_allocation ->> 'sale_id')::uuid;

        v_allocation_amount :=
            (v_allocation ->> 'amount')::numeric;

        insert into public.customer_payment_allocations (
            payment_id,
            sale_id,
            booking_id,
            allocated_amount
        )
        values (
            v_payment_id,
            v_sale_id,
            null,
            v_allocation_amount
        );

    end loop;


    -- -----------------------------------------------------
    -- 9. RECORD CASH/BANK INFLOW
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
        'in',
        p_amount,
        v_payment_timestamp,
        'customer_payment',
        v_payment_id,
        'Customer payment received - ' ||
            v_payment_reference,
        v_user_id
    );


    -- -----------------------------------------------------
    -- 10. AUDIT LOG
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
        'customer_payments',
        v_payment_id,
        null,
        jsonb_build_object(
            'payment_reference', v_payment_reference,
            'customer_id', p_customer_id,
            'amount', p_amount,
            'payment_method', v_method,
            'account_id', p_account_id,
            'payment_date', p_payment_date,
            'allocated_amount', v_total_allocated,
            'unallocated_amount',
                p_amount - v_total_allocated
        ),
        now()
    );


    -- -----------------------------------------------------
    -- 11. RETURN RESULT
    -- -----------------------------------------------------

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_reference', v_payment_reference,
        'amount', p_amount,
        'allocated_amount', v_total_allocated,
        'unallocated_amount',
            p_amount - v_total_allocated,
        'message', 'Customer payment recorded successfully.'
    );

end;
$$;


-- ---------------------------------------------------------
-- FUNCTION PERMISSIONS
-- ---------------------------------------------------------

revoke all on function public.record_customer_payment(
    uuid,
    numeric,
    text,
    uuid,
    date,
    text,
    text,
    jsonb
) from public, anon;

grant execute on function public.record_customer_payment(
    uuid,
    numeric,
    text,
    uuid,
    date,
    text,
    text,
    jsonb
) to authenticated;


-- =========================================================
-- END
-- =========================================================
