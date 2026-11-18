
-- =====================================================
-- ATOMIC BOOKING TO TICKET SALE CONVERSION
-- Schema aligned with Air Agency Management Software
-- =====================================================

create or replace function public.convert_booking_to_sale(
    p_booking_id uuid,
    p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_booking public.bookings%rowtype;
    v_sale_id uuid;
    v_user_id uuid;
    v_role text;
    v_passenger record;
    v_count integer := 0;
    v_index integer := 0;
    v_base_price numeric(14,2);
    v_allocated numeric(14,2) := 0;
    v_passenger_price numeric(14,2);
    v_sale_reference text;
    v_allocation_total numeric(14,2) := 0;
begin
    -- 1. Authentication
    v_user_id := auth.uid();

    if v_user_id is null or v_user_id <> p_user_id then
        raise exception 'Unauthorized request.';
    end if;

    -- 2. Active profile and role
    select p.role
    into v_role
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true;

    if v_role is null or v_role not in (
        'owner', 'manager', 'ticket_staff'
    ) then
        raise exception 'Permission denied.';
    end if;

    -- 3. Lock booking
    select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

    if not found then
        raise exception 'Booking not found.';
    end if;

    if v_booking.converted_sale_id is not null then
        raise exception 'This booking has already been converted.';
    end if;

    if v_booking.booking_status <> 'ticketed' then
        raise exception 'Only ticketed bookings can be converted.';
    end if;

    if v_booking.quoted_amount < 0 then
        raise exception 'Invalid booking amount.';
    end if;

    -- 4. Count passengers
    select count(*)
    into v_count
    from public.booking_passengers
    where booking_id = p_booking_id;

    if v_count < 1 then
        raise exception 'No passengers found in this booking.';
    end if;

    if v_count <> v_booking.passenger_count then
        raise exception 'Passenger count does not match booking records.';
    end if;

    -- 5. Validate existing booking payment allocations
    select coalesce(sum(a.allocated_amount), 0)
    into v_allocation_total
    from public.customer_payment_allocations a
    join public.customer_payments cp
      on cp.id = a.payment_id
    where a.booking_id = p_booking_id
      and cp.customer_id = v_booking.customer_id;

    if exists (
        select 1
        from public.customer_payment_allocations a
        join public.customer_payments cp
          on cp.id = a.payment_id
        where a.booking_id = p_booking_id
          and cp.customer_id <> v_booking.customer_id
    ) then
        raise exception 'A booking payment belongs to a different customer.';
    end if;

    if v_allocation_total > v_booking.quoted_amount then
        raise exception 'Booking payment allocations exceed the booking amount.';
    end if;

    -- 6. Generate unique sale reference
    v_sale_reference :=
        'SAL-' ||
        to_char(current_date, 'YYYYMMDD') ||
        '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    -- 7. Create sale
    insert into public.ticket_sales (
        sale_reference,
        customer_id,
        booking_id,
        sale_date,
        sale_type,
        sale_status,
        selling_total,
        discount_amount,
        notes,
        created_by
    )
    values (
        v_sale_reference,
        v_booking.customer_id,
        v_booking.id,
        current_date,
        'booking_converted',
        'issued',
        v_booking.quoted_amount,
        0,
        'Converted from booking ' || v_booking.booking_reference,
        v_user_id
    )
    returning id into v_sale_id;

    -- 8. Copy passengers and distribute selling amount
    v_base_price := round(
        v_booking.quoted_amount / v_count,
        2
    );

    for v_passenger in
        select *
        from public.booking_passengers
        where booking_id = p_booking_id
        order by created_at, id
    loop
        v_index := v_index + 1;

        if v_index = v_count then
            v_passenger_price :=
                v_booking.quoted_amount - v_allocated;
        else
            v_passenger_price := v_base_price;
            v_allocated := v_allocated + v_passenger_price;
        end if;

        insert into public.sale_passengers (
            sale_id,
            booking_passenger_id,
            agency_id,
            passenger_name,
            passenger_type,
            passport_number,
            pnr,
            airline,
            origin,
            destination,
            selling_price,
            ticket_status
        )
        values (
            v_sale_id,
            v_passenger.id,
            v_booking.agency_id,
            v_passenger.passenger_name,
            v_passenger.passenger_type,
            v_passenger.passport_number,
            v_booking.pnr,
            v_booking.airline,
            v_booking.origin,
            v_booking.destination,
            v_passenger_price,
            'issued'
        );
    end loop;

    -- 9. Transfer existing booking payment allocations to sale
    -- No new payment is created; this prevents double counting.
    update public.customer_payment_allocations
    set
        sale_id = v_sale_id,
        booking_id = null
    where booking_id = p_booking_id;

    -- 10. Mark booking converted
    update public.bookings
    set
        converted_sale_id = v_sale_id,
        updated_at = now()
    where id = p_booking_id;

    -- 11. Audit log
    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        new_data,
        created_at
    )
    values (
        v_user_id,
        'convert_booking_to_sale',
        'ticket_sales',
        v_sale_id,
        jsonb_build_object(
            'booking_id', p_booking_id,
            'booking_reference', v_booking.booking_reference,
            'sale_reference', v_sale_reference,
            'selling_total', v_booking.quoted_amount,
            'passenger_count', v_count,
            'transferred_allocations', v_allocation_total
        ),
        now()
    );

    return v_sale_id;
end;
$$;

revoke all on function public.convert_booking_to_sale(uuid, uuid)
from public, anon;

grant execute on function public.convert_booking_to_sale(uuid, uuid)
to authenticated;

-- =====================================================
-- END
-- =====================================================
