
-- =========================================================
-- AIR TICKET AGENCY MANAGEMENT
-- CREATE TICKET SALE - TRANSACTIONAL DATABASE FUNCTION
-- Source schema: Air Agency Management Software 3.zip
-- =========================================================

-- Ticket Staff may create a sale without seeing purchase price.
-- The Owner/Manager must later confirm the actual purchase price
-- before the cost is included in profit calculations.

alter table public.ticket_financials
add column if not exists purchase_price_confirmed boolean
not null default false;


-- =========================================================
-- 1. CREATE TICKET SALE
-- =========================================================

create or replace function public.create_ticket_sale(
    p_sale jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_role text;

    v_customer_id uuid;
    v_agency_id uuid;

    v_sale_id uuid;
    v_sale_reference text;

    v_sale_date date;
    v_travel_date date;

    v_selling_total numeric(14,2);
    v_discount numeric(14,2);
    v_net_total numeric(14,2);

    v_initial_payment numeric(14,2);
    v_payment_method text;
    v_payment_reference text;

    v_account_id uuid;
    v_account_count integer;

    v_passengers jsonb;
    v_passenger jsonb;
    v_passenger_count integer;
    v_passenger_index integer;

    v_passenger_id uuid;
    v_purchase_price numeric(14,2);
    v_passenger_selling_price numeric(14,2);

    v_origin text;
    v_destination text;
    v_pnr text;
    v_airline text;
    v_notes text;

    v_payment_id uuid;
    v_payment_code text;

    v_is_purchase_price_confirmed boolean;
begin

    -- -----------------------------------------------------
    -- A. AUTHENTICATION
    -- -----------------------------------------------------

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required.';
    end if;


    -- -----------------------------------------------------
    -- B. ACTIVE STAFF AND ROLE CHECK
    -- -----------------------------------------------------

    select p.role::text
    into v_role
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true;

    if v_role is null then
        raise exception 'Active staff account not found.';
    end if;

    if v_role not in (
        'owner',
        'manager',
        'ticket_staff'
    ) then
        raise exception 'You do not have permission to create ticket sales.';
    end if;

    v_is_purchase_price_confirmed :=
        v_role in ('owner', 'manager');


    -- -----------------------------------------------------
    -- C. VALIDATE REQUEST
    -- -----------------------------------------------------

    if p_sale is null
       or jsonb_typeof(p_sale) <> 'object' then
        raise exception 'Invalid sale request.';
    end if;

    begin
        v_customer_id := (p_sale ->> 'customer_id')::uuid;
        v_agency_id := (p_sale ->> 'agency_id')::uuid;

        v_sale_date := (p_sale ->> 'sale_date')::date;
        v_travel_date := (p_sale ->> 'travel_date')::date;

        v_selling_total := (p_sale ->> 'selling_total')::numeric;
        v_discount := coalesce(
            (p_sale ->> 'discount_amount')::numeric,
            0
        );

        v_initial_payment := coalesce(
            (p_sale ->> 'initial_payment')::numeric,
            0
        );
    exception
        when others then
            raise exception 'Invalid sale field format.';
    end;

    if v_customer_id is null or v_agency_id is null then
        raise exception 'Customer and agency are required.';
    end if;

    if v_sale_date is null or v_travel_date is null then
        raise exception 'Sale date and travel date are required.';
    end if;

    if v_selling_total is null or v_selling_total <= 0 then
        raise exception 'Selling amount must be greater than zero.';
    end if;

    if v_discount < 0 or v_discount > v_selling_total then
        raise exception 'Invalid discount amount.';
    end if;

    v_net_total := v_selling_total - v_discount;

    if v_initial_payment < 0
       or v_initial_payment > v_net_total then
        raise exception 'Invalid initial payment amount.';
    end if;

    if v_selling_total > 999999999999
       or v_discount > 999999999999
       or v_initial_payment > 999999999999 then
        raise exception 'Sale amount exceeds the permitted limit.';
    end if;


    -- -----------------------------------------------------
    -- D. VALIDATE CUSTOMER
    -- -----------------------------------------------------

    perform 1
    from public.customers c
    where c.id = v_customer_id
    for update;

    if not found then
        raise exception 'Customer not found.';
    end if;


    -- -----------------------------------------------------
    -- E. VALIDATE ACTIVE AGENCY
    -- -----------------------------------------------------

    perform 1
    from public.agencies a
    where a.id = v_agency_id
      and a.is_active = true
    for update;

    if not found then
        raise exception 'Active source agency not found.';
    end if;


    -- -----------------------------------------------------
    -- F. VALIDATE PASSENGERS
    -- -----------------------------------------------------

    v_passengers := p_sale -> 'passengers';

    if v_passengers is null
       or jsonb_typeof(v_passengers) <> 'array' then
        raise exception 'Passenger information is required.';
    end if;

    v_passenger_count := jsonb_array_length(v_passengers);

    if v_passenger_count < 1
       or v_passenger_count > 20 then
        raise exception 'Passenger count must be between 1 and 20.';
    end if;

    v_origin := nullif(
        btrim(p_sale ->> 'origin'),
        ''
    );

    v_destination := nullif(
        btrim(p_sale ->> 'destination'),
        ''
    );

    if v_origin is null or v_destination is null then
        raise exception 'Origin and destination are required.';
    end if;

    if lower(v_origin) = lower(v_destination) then
        raise exception 'Origin and destination cannot be the same.';
    end if;

    if length(v_origin) > 100
       or length(v_destination) > 100 then
        raise exception 'Origin or destination is too long.';
    end if;

    v_pnr := nullif(btrim(p_sale ->> 'pnr'), '');
    v_airline := nullif(btrim(p_sale ->> 'airline'), '');
    v_notes := nullif(btrim(p_sale ->> 'notes'), '');

    if v_pnr is not null and length(v_pnr) > 30 then
        raise exception 'PNR is too long.';
    end if;

    if v_airline is not null and length(v_airline) > 100 then
        raise exception 'Airline name is too long.';
    end if;

    if v_notes is not null and length(v_notes) > 2000 then
        raise exception 'Sale notes are too long.';
    end if;


    -- -----------------------------------------------------
    -- G. VALIDATE PAYMENT METHOD
    -- -----------------------------------------------------

    v_payment_method := nullif(
        p_sale ->> 'payment_method',
        ''
    );

    v_payment_reference := nullif(
        btrim(p_sale ->> 'payment_reference'),
        ''
    );

    if v_initial_payment > 0 then

        if v_payment_method not in (
            'cash',
            'mobile_banking'
        ) then
            raise exception 'Unsupported initial payment method.';
        end if;

        if v_payment_reference is not null
           and length(v_payment_reference) > 100 then
            raise exception 'Payment reference is too long.';
        end if;

        -- Do not guess which account should receive the payment.
        -- Exactly one active account must exist for the selected type.

        select count(*), min(ca.id)
        into v_account_count, v_account_id
        from public.cash_accounts ca
        where ca.account_type = v_payment_method
          and ca.is_active = true;

        if v_account_count = 0 then
            raise exception 'No active account exists for this payment method.';
        end if;

        if v_account_count > 1 then
            raise exception
                'Multiple active accounts exist. Record this payment from the Customer Payments page to select the correct account.';
        end if;

    end if;


    -- -----------------------------------------------------
    -- H. VALIDATE EACH PASSENGER
    -- -----------------------------------------------------

    for v_passenger in
        select value
        from jsonb_array_elements(v_passengers)
    loop

        if jsonb_typeof(v_passenger) <> 'object' then
            raise exception 'Invalid passenger information.';
        end if;

        if nullif(
            btrim(v_passenger ->> 'full_name'),
            ''
        ) is null then
            raise exception 'Every passenger must have a name.';
        end if;

        if length(v_passenger ->> 'full_name') > 150 then
            raise exception 'Passenger name is too long.';
        end if;

        if coalesce(
            v_passenger ->> 'passenger_type',
            'adult'
        ) not in ('adult', 'child', 'infant') then
            raise exception 'Invalid passenger type.';
        end if;

        if v_passenger ->> 'passport_number' is not null
           and length(v_passenger ->> 'passport_number') > 30 then
            raise exception 'Passport number is too long.';
        end if;

        if v_passenger ->> 'ticket_number' is not null
           and length(v_passenger ->> 'ticket_number') > 50 then
            raise exception 'Ticket number is too long.';
        end if;

        if v_is_purchase_price_confirmed then

            if coalesce(
                v_passenger ->> 'purchase_price',
                ''
            ) = '' then
                raise exception
                    'Purchase price is required for every passenger.';
            end if;

            begin
                v_purchase_price :=
                    (v_passenger ->> 'purchase_price')::numeric;
            exception
                when others then
                    raise exception 'Invalid passenger purchase price.';
            end;

            if v_purchase_price < 0
               or v_purchase_price > 999999999999 then
                raise exception 'Invalid passenger purchase price.';
            end if;

        end if;

    end loop;


    -- -----------------------------------------------------
    -- I. CREATE SALE HEADER
    -- -----------------------------------------------------

    v_sale_reference :=
        'SAL-' ||
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
        '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

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
        v_customer_id,
        null,
        v_sale_date,
        'direct',
        'issued',
        v_selling_total,
        v_discount,
        v_notes,
        v_user_id
    )
    returning id into v_sale_id;


    -- -----------------------------------------------------
    -- J. CREATE PASSENGERS AND FINANCIAL RECORDS
    -- -----------------------------------------------------

    v_passenger_index := 0;

    for v_passenger in
        select value
        from jsonb_array_elements(v_passengers)
    loop

        v_passenger_index := v_passenger_index + 1;

        -- Divide net selling amount across passengers.
        -- The last passenger receives any rounding remainder.

        if v_passenger_index < v_passenger_count then
            v_passenger_selling_price :=
                round(v_net_total / v_passenger_count, 2);
        else
            v_passenger_selling_price :=
                v_net_total -
                (
                    round(v_net_total / v_passenger_count, 2)
                    * (v_passenger_count - 1)
                );
        end if;

        if v_is_purchase_price_confirmed then
            v_purchase_price :=
                (v_passenger ->> 'purchase_price')::numeric;
        else
            -- Placeholder only. Must not be included in profit
            -- until Owner/Manager confirms the real purchase price.
            v_purchase_price := 0;
        end if;

        insert into public.sale_passengers (
            sale_id,
            agency_id,
            passenger_name,
            passenger_type,
            passport_number,
            ticket_number,
            pnr,
            airline,
            origin,
            destination,
            selling_price,
            ticket_status
        )
        values (
            v_sale_id,
            v_agency_id,
            btrim(v_passenger ->> 'full_name'),
            coalesce(
                v_passenger ->> 'passenger_type',
                'adult'
            ),
            nullif(
                btrim(v_passenger ->> 'passport_number'),
                ''
            ),
            nullif(
                btrim(v_passenger ->> 'ticket_number'),
                ''
            ),
            v_pnr,
            v_airline,
            v_origin,
            v_destination,
            v_passenger_selling_price,
            'issued'
        )
        returning id into v_passenger_id;


        -- Restricted financial table.
        insert into public.ticket_financials (
            sale_passenger_id,
            agency_id,
            purchase_price,
            additional_cost,
            purchase_price_confirmed
        )
        values (
            v_passenger_id,
            v_agency_id,
            v_purchase_price,
            0,
            v_is_purchase_price_confirmed
        );


        -- Record agency payable only when actual purchase price
        -- has been confirmed by Owner/Manager.

        if v_is_purchase_price_confirmed
           and v_purchase_price > 0 then

            insert into public.agency_transactions (
                agency_id,
                transaction_reference,
                transaction_type,
                debit_amount,
                credit_amount,
                transaction_date,
                sale_passenger_id,
                description,
                recorded_by
            )
            values (
                v_agency_id,
                'PUR-' ||
                    upper(substr(
                        replace(gen_random_uuid()::text, '-', ''),
                        1,
                        16
                    )),
                'ticket_purchase',
                v_purchase_price,
                0,
                now(),
                v_passenger_id,
                'Ticket purchase for sale ' || v_sale_reference,
                v_user_id
            );

        end if;

    end loop;


    -- -----------------------------------------------------
    -- K. RECORD INITIAL CUSTOMER PAYMENT
    -- -----------------------------------------------------

    if v_initial_payment > 0 then

        v_payment_code :=
            'PAY-' ||
            to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
            '-' ||
            upper(substr(
                replace(gen_random_uuid()::text, '-', ''),
                1,
                6
            ));

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
            v_customer_id,
            v_payment_code,
            now(),
            v_initial_payment,
            v_payment_method,
            v_payment_reference,
            'Initial payment for sale ' || v_sale_reference,
            v_user_id
        )
        returning id into v_payment_id;


        -- Allocate payment to this sale.

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
            v_initial_payment
        );


        -- Record money received in the selected cash/mobile account.

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
            v_account_id,
            'in',
            v_initial_payment,
            now(),
            'customer_payment',
            v_payment_id,
            'Initial customer payment for ' || v_sale_reference,
            v_user_id
        );

    end if;


    -- -----------------------------------------------------
    -- L. AUDIT LOG
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
        'ticket_sales',
        v_sale_id,
        null,
        jsonb_build_object(
            'sale_reference', v_sale_reference,
            'customer_id', v_customer_id,
            'agency_id', v_agency_id,
            'selling_total', v_selling_total,
            'discount_amount', v_discount,
            'passenger_count', v_passenger_count,
            'initial_payment', v_initial_payment,
            'purchase_price_confirmed',
                v_is_purchase_price_confirmed
        ),
        now()
    );


    -- -----------------------------------------------------
    -- M. RETURN RESULT
    -- -----------------------------------------------------

    return jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_reference', v_sale_reference,
        'passenger_count', v_passenger_count,
        'selling_total', v_selling_total,
        'discount_amount', v_discount,
        'initial_payment', v_initial_payment,
        'purchase_price_confirmed',
            v_is_purchase_price_confirmed
    );

end;
$$;


-- =========================================================
-- 2. RESTRICT FUNCTION ACCESS
-- =========================================================

revoke all on function public.create_ticket_sale(jsonb)
from public, anon;

grant execute on function public.create_ticket_sale(jsonb)
to authenticated;


-- =========================================================
-- END
-- =========================================================
