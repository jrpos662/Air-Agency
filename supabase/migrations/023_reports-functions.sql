
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   BUSINESS REPORTS
   Secure Supabase RPC
========================================================= */

create or replace function public.get_business_reports(
    p_date_from date default null,
    p_date_to date default null,
    p_report_type text default 'all',
    p_page integer default 1,
    p_page_size integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$

declare
    v_user_id uuid;
    v_role text;
    v_can_view_profit boolean;

    v_page integer;
    v_page_size integer;
    v_offset integer;
    v_cutoff date;

    v_total_count bigint := 0;
    v_total_pages integer := 1;

    v_rows jsonb := '[]'::jsonb;
    v_columns jsonb := '[]'::jsonb;
    v_summary jsonb := '{}'::jsonb;

    v_title text := 'Business Report';
    v_subtitle text := '';

    v_sales numeric(14,2) := 0;
    v_received numeric(14,2) := 0;
    v_customer_due numeric(14,2) := 0;
    v_agency_payable numeric(14,2) := 0;

    v_gross_profit numeric(14,2) := 0;
    v_total_expenses numeric(14,2) := 0;

begin

    /* =====================================================
       1. AUTHENTICATION AND ROLE
    ===================================================== */

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
        'ticket_staff',
        'accounts_staff'
    ) then
        raise exception 'You are not authorized to view reports.';
    end if;

    v_can_view_profit :=
        v_role in ('owner', 'manager');

    /* =====================================================
       2. INPUT VALIDATION
    ===================================================== */

    if p_report_type is null
       or p_report_type not in (
            'all',
            'sales',
            'bookings',
            'customer_due',
            'agency_payable',
            'expenses',
            'cash_bank',
            'profit_loss'
       ) then
        raise exception 'Invalid report type.';
    end if;

    if p_date_from is not null
       and p_date_to is not null
       and p_date_from > p_date_to then
        raise exception 'Invalid date range.';
    end if;

    if p_page is null or p_page < 1 then
        raise exception 'Invalid page number.';
    end if;

    if p_page_size is null
       or p_page_size < 1
       or p_page_size > 100 then
        raise exception 'Invalid page size.';
    end if;

    if p_report_type = 'profit_loss'
       and not v_can_view_profit then
        raise exception 'Profit and Loss access denied.';
    end if;

    v_page := p_page;
    v_page_size := p_page_size;

    v_offset := (v_page - 1) * v_page_size;

    v_cutoff := coalesce(p_date_to, current_date);


    /* =====================================================
       3. SALES SUMMARY
       Cancelled and refunded sales excluded.
       Customer refunds reduce realized sales.
    ===================================================== */

    select coalesce(
        sum(
            s.selling_total
            - s.discount_amount
            - coalesce(r.refund_amount, 0)
        ),
        0
    )
    into v_sales
    from public.ticket_sales s
    left join lateral (
        select sum(rf.refund_amount) as refund_amount
        from public.refunds rf
        where rf.sale_id = s.id
          and rf.refund_type = 'customer'
          and rf.refund_date < (
              coalesce(p_date_to, current_date) + 1
          )::timestamp
    ) r on true
    where s.sale_status not in ('cancelled', 'refunded')
      and (p_date_from is null or s.sale_date >= p_date_from)
      and (p_date_to is null or s.sale_date <= p_date_to);


    /* =====================================================
       4. CUSTOMER RECEIPTS
       Based on actual received payment records.
    ===================================================== */

    select coalesce(sum(p.amount), 0)
    into v_received
    from public.customer_payments p
    where (p_date_from is null
           or p.payment_date >= p_date_from::timestamp)
      and (p_date_to is null
           or p.payment_date < (p_date_to + 1)::timestamp);


    /* =====================================================
       5. CUSTOMER DUE
       Outstanding balance as of the selected end date.
    ===================================================== */

    with sale_balances as (

        select
            greatest(
                s.selling_total
                - s.discount_amount
                - coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.sale_id = s.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0)
                - coalesce((
                    select sum(rf.refund_amount)
                    from public.refunds rf
                    where rf.sale_id = s.id
                      and rf.refund_type = 'customer'
                      and rf.refund_date <
                          (v_cutoff + 1)::timestamp
                ), 0),
                0
            ) as due_amount

        from public.ticket_sales s
        where s.sale_status not in ('cancelled', 'refunded')
          and s.sale_date <= v_cutoff

    ),

    booking_balances as (

        select
            greatest(
                b.quoted_amount
                - coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.booking_id = b.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0),
                0
            ) as due_amount

        from public.bookings b
        where b.converted_sale_id is null
          and b.booking_status not in ('cancelled', 'expired')
          and b.booking_date <= v_cutoff

    )

    select
        coalesce((select sum(due_amount) from sale_balances), 0)
        +
        coalesce((select sum(due_amount) from booking_balances), 0)

    into v_customer_due;


    /* =====================================================
       6. AGENCY PAYABLE
       Opening balance + ledger movements up to cutoff.
       Opening balance transactions are not double-counted.
    ===================================================== */

    select coalesce(
        sum(
            a.opening_balance
            +
            coalesce((
                select sum(
                    t.debit_amount - t.credit_amount
                )
                from public.agency_transactions t
                where t.agency_id = a.id
                  and t.transaction_type <> 'opening_balance'
                  and t.transaction_date <
                      (v_cutoff + 1)::timestamp
            ), 0)
        ),
        0
    )
    into v_agency_payable
    from public.agencies a;


    /* =====================================================
       7. BASE SUMMARY
    ===================================================== */

    v_summary := jsonb_build_object(
        'total_sales', v_sales,
        'total_received', v_received,
        'customer_due', v_customer_due,
        'agency_payable', v_agency_payable
    );


    /* =====================================================
       8. TICKET SALES REPORT
    ===================================================== */

    if p_report_type in ('all', 'sales') then

        v_title := 'Ticket Sales Report';
        v_subtitle := 'Ticket sales within selected date range';

        v_columns := jsonb_build_array(
            jsonb_build_object(
                'key', 'sale_reference',
                'label', 'Sale Reference'
            ),
            jsonb_build_object(
                'key', 'sale_date',
                'label', 'Sale Date',
                'type', 'date'
            ),
            jsonb_build_object(
                'key', 'customer_name',
                'label', 'Customer'
            ),
            jsonb_build_object(
                'key', 'selling_total',
                'label', 'Selling Total',
                'type', 'currency'
            ),
            jsonb_build_object(
                'key', 'discount_amount',
                'label', 'Discount',
                'type', 'currency'
            ),
            jsonb_build_object(
                'key', 'customer_refund',
                'label', 'Customer Refund',
                'type', 'currency'
            ),
            jsonb_build_object(
                'key', 'net_total',
                'label', 'Net Total',
                'type', 'currency'
            ),
            jsonb_build_object(
                'key', 'sale_status',
                'label', 'Status'
            )
        );

        select count(*)
        into v_total_count
        from public.ticket_sales s
        where s.sale_status not in ('cancelled', 'refunded')
          and (p_date_from is null or s.sale_date >= p_date_from)
          and (p_date_to is null or s.sale_date <= p_date_to);

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'sale_reference', s.sale_reference,
                'sale_date', s.sale_date,
                'customer_name', c.full_name,
                'selling_total', s.selling_total,
                'discount_amount', s.discount_amount,
                'customer_refund', coalesce(r.refund_amount, 0),
                'net_total',
                    s.selling_total
                    - s.discount_amount
                    - coalesce(r.refund_amount, 0),
                'sale_status', s.sale_status
            ) as item

            from public.ticket_sales s

            join public.customers c
              on c.id = s.customer_id

            left join lateral (
                select sum(rf.refund_amount) as refund_amount
                from public.refunds rf
                where rf.sale_id = s.id
                  and rf.refund_type = 'customer'
                  and rf.refund_date <
                      (v_cutoff + 1)::timestamp
            ) r on true

            where s.sale_status not in ('cancelled', 'refunded')
              and (p_date_from is null or s.sale_date >= p_date_from)
              and (p_date_to is null or s.sale_date <= p_date_to)

            order by s.sale_date desc, s.created_at desc
            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       9. BOOKINGS REPORT
    ===================================================== */

    elsif p_report_type = 'bookings' then

        v_title := 'Bookings Report';
        v_subtitle := 'Booking records within selected date range';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'booking_reference', 'label', 'Booking Reference'),
            jsonb_build_object('key', 'booking_date', 'label', 'Booking Date', 'type', 'date'),
            jsonb_build_object('key', 'customer_name', 'label', 'Customer'),
            jsonb_build_object('key', 'origin', 'label', 'Origin'),
            jsonb_build_object('key', 'destination', 'label', 'Destination'),
            jsonb_build_object('key', 'quoted_amount', 'label', 'Quoted Amount', 'type', 'currency'),
            jsonb_build_object('key', 'advance_amount', 'label', 'Advance Amount', 'type', 'currency'),
            jsonb_build_object('key', 'booking_status', 'label', 'Status')
        );

        select count(*)
        into v_total_count
        from public.bookings b
        where (p_date_from is null or b.booking_date >= p_date_from)
          and (p_date_to is null or b.booking_date <= p_date_to);

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'booking_reference', b.booking_reference,
                'booking_date', b.booking_date,
                'customer_name', c.full_name,
                'origin', b.origin,
                'destination', b.destination,
                'quoted_amount', b.quoted_amount,
                'advance_amount', b.advance_amount,
                'booking_status', b.booking_status
            ) as item

            from public.bookings b

            join public.customers c
              on c.id = b.customer_id

            where (p_date_from is null or b.booking_date >= p_date_from)
              and (p_date_to is null or b.booking_date <= p_date_to)

            order by b.booking_date desc, b.created_at desc
            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       10. CUSTOMER DUE REPORT
    ===================================================== */

    elsif p_report_type = 'customer_due' then

        v_title := 'Customer Due Report';
        v_subtitle := 'Outstanding customer balances as of selected end date';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'customer_name', 'label', 'Customer'),
            jsonb_build_object('key', 'phone', 'label', 'Phone'),
            jsonb_build_object('key', 'reference', 'label', 'Reference'),
            jsonb_build_object('key', 'record_type', 'label', 'Record Type'),
            jsonb_build_object('key', 'total_amount', 'label', 'Total Amount', 'type', 'currency'),
            jsonb_build_object('key', 'paid_amount', 'label', 'Paid', 'type', 'currency'),
            jsonb_build_object('key', 'due_amount', 'label', 'Due', 'type', 'currency')
        );

        with due_records as (

            select
                c.full_name as customer_name,
                c.phone,
                s.sale_reference as reference,
                'Ticket Sale'::text as record_type,

                s.selling_total - s.discount_amount as total_amount,

                coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.sale_id = s.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0) as paid_amount,

                coalesce((
                    select sum(rf.refund_amount)
                    from public.refunds rf
                    where rf.sale_id = s.id
                      and rf.refund_type = 'customer'
                      and rf.refund_date <
                          (v_cutoff + 1)::timestamp
                ), 0) as refund_amount,

                s.sale_date as record_date,
                s.created_at

            from public.ticket_sales s

            join public.customers c
              on c.id = s.customer_id

            where s.sale_status not in ('cancelled', 'refunded')
              and s.sale_date <= v_cutoff
              and (p_date_from is null or s.sale_date >= p_date_from)
              and (p_date_to is null or s.sale_date <= p_date_to)

            union all

            select
                c.full_name,
                c.phone,
                b.booking_reference,
                'Booking'::text,
                b.quoted_amount,

                coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.booking_id = b.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0),

                0::numeric,

                b.booking_date,
                b.created_at

            from public.bookings b

            join public.customers c
              on c.id = b.customer_id

            where b.converted_sale_id is null
              and b.booking_status not in ('cancelled', 'expired')
              and b.booking_date <= v_cutoff
              and (p_date_from is null or b.booking_date >= p_date_from)
              and (p_date_to is null or b.booking_date <= p_date_to)
        )

        select count(*)
        into v_total_count
        from due_records
        where greatest(
            total_amount - paid_amount - refund_amount,
            0
        ) > 0;

        with due_records as (

            select
                c.full_name as customer_name,
                c.phone,
                s.sale_reference as reference,
                'Ticket Sale'::text as record_type,

                s.selling_total - s.discount_amount as total_amount,

                coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.sale_id = s.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0) as paid_amount,

                coalesce((
                    select sum(rf.refund_amount)
                    from public.refunds rf
                    where rf.sale_id = s.id
                      and rf.refund_type = 'customer'
                      and rf.refund_date <
                          (v_cutoff + 1)::timestamp
                ), 0) as refund_amount,

                s.sale_date as record_date,
                s.created_at

            from public.ticket_sales s

            join public.customers c
              on c.id = s.customer_id

            where s.sale_status not in ('cancelled', 'refunded')
              and s.sale_date <= v_cutoff
              and (p_date_from is null or s.sale_date >= p_date_from)
              and (p_date_to is null or s.sale_date <= p_date_to)

            union all

            select
                c.full_name,
                c.phone,
                b.booking_reference,
                'Booking'::text,
                b.quoted_amount,

                coalesce((
                    select sum(a.allocated_amount)
                    from public.customer_payment_allocations a
                    join public.customer_payments cp
                      on cp.id = a.payment_id
                    where a.booking_id = b.id
                      and cp.payment_date <
                          (v_cutoff + 1)::timestamp
                ), 0),

                0::numeric,

                b.booking_date,
                b.created_at

            from public.bookings b

            join public.customers c
              on c.id = b.customer_id

            where b.converted_sale_id is null
              and b.booking_status not in ('cancelled', 'expired')
              and b.booking_date <= v_cutoff
              and (p_date_from is null or b.booking_date >= p_date_from)
              and (p_date_to is null or b.booking_date <= p_date_to)
        )

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'customer_name', customer_name,
                'phone', phone,
                'reference', reference,
                'record_type', record_type,
                'total_amount', total_amount,
                'paid_amount', paid_amount,
                'due_amount',
                    greatest(
                        total_amount - paid_amount - refund_amount,
                        0
                    )
            ) as item

            from due_records

            where greatest(
                total_amount - paid_amount - refund_amount,
                0
            ) > 0

            order by record_date desc, created_at desc
            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       11. AGENCY PAYABLE REPORT
    ===================================================== */

    elsif p_report_type = 'agency_payable' then

        v_title := 'Agency Payable Report';
        v_subtitle := 'Agency ledger balances as of selected end date';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'agency_name', 'label', 'Agency'),
            jsonb_build_object('key', 'transaction_count', 'label', 'Transactions'),
            jsonb_build_object('key', 'total_debit', 'label', 'Debit', 'type', 'currency'),
            jsonb_build_object('key', 'total_credit', 'label', 'Credit', 'type', 'currency'),
            jsonb_build_object('key', 'opening_balance', 'label', 'Opening Balance', 'type', 'currency'),
            jsonb_build_object('key', 'payable', 'label', 'Payable', 'type', 'currency')
        );

        select count(*)
        into v_total_count
        from public.agencies a
        where a.opening_balance <> 0
           or exists (
                select 1
                from public.agency_transactions t
                where t.agency_id = a.id
                  and t.transaction_type <> 'opening_balance'
                  and t.transaction_date <
                      (v_cutoff + 1)::timestamp
           );

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'agency_name', a.agency_name,

                'transaction_count',
                    count(t.id),

                'total_debit',
                    coalesce(sum(t.debit_amount), 0),

                'total_credit',
                    coalesce(sum(t.credit_amount), 0),

                'opening_balance',
                    a.opening_balance,

                'payable',
                    a.opening_balance
                    +
                    coalesce((
                        select sum(
                            atx.debit_amount - atx.credit_amount
                        )
                        from public.agency_transactions atx
                        where atx.agency_id = a.id
                          and atx.transaction_type <> 'opening_balance'
                          and atx.transaction_date <
                              (v_cutoff + 1)::timestamp
                    ), 0)
            ) as item

            from public.agencies a

            left join public.agency_transactions t
              on t.agency_id = a.id
             and t.transaction_type <> 'opening_balance'
             and (p_date_from is null
                  or t.transaction_date >= p_date_from::timestamp)
             and (p_date_to is null
                  or t.transaction_date < (p_date_to + 1)::timestamp)

            where a.opening_balance <> 0
               or exists (
                    select 1
                    from public.agency_transactions atx
                    where atx.agency_id = a.id
                      and atx.transaction_type <> 'opening_balance'
                      and atx.transaction_date <
                          (v_cutoff + 1)::timestamp
               )

            group by a.id, a.agency_name, a.opening_balance

            order by (
                a.opening_balance
                +
                coalesce((
                    select sum(
                        atx.debit_amount - atx.credit_amount
                    )
                    from public.agency_transactions atx
                    where atx.agency_id = a.id
                      and atx.transaction_type <> 'opening_balance'
                      and atx.transaction_date <
                          (v_cutoff + 1)::timestamp
                ), 0)
            ) desc

            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       12. EXPENSE REPORT
    ===================================================== */

    elsif p_report_type = 'expenses' then

        v_title := 'Expense Report';
        v_subtitle := 'Business expenses within selected date range';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'expense_reference', 'label', 'Reference'),
            jsonb_build_object('key', 'expense_date', 'label', 'Date', 'type', 'date'),
            jsonb_build_object('key', 'category_name', 'label', 'Category'),
            jsonb_build_object('key', 'expense_title', 'label', 'Description'),
            jsonb_build_object('key', 'payment_method', 'label', 'Payment Method'),
            jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'currency')
        );

        select count(*)
        into v_total_count
        from public.expenses e
        where (p_date_from is null or e.expense_date >= p_date_from)
          and (p_date_to is null or e.expense_date <= p_date_to);

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'expense_reference', e.expense_reference,
                'expense_date', e.expense_date,
                'category_name', ec.category_name,
                'expense_title', e.expense_title,
                'payment_method', e.payment_method,
                'amount', e.amount
            ) as item

            from public.expenses e

            left join public.expense_categories ec
              on ec.id = e.category_id

            where (p_date_from is null or e.expense_date >= p_date_from)
              and (p_date_to is null or e.expense_date <= p_date_to)

            order by e.expense_date desc, e.created_at desc
            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       13. CASH AND BANK REPORT
    ===================================================== */

    elsif p_report_type = 'cash_bank' then

        v_title := 'Cash & Bank Report';
        v_subtitle := 'Cash and account transaction movements';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'account_name', 'label', 'Account'),
            jsonb_build_object('key', 'account_type', 'label', 'Account Type'),
            jsonb_build_object('key', 'transaction_date', 'label', 'Date', 'type', 'date'),
            jsonb_build_object('key', 'transaction_type', 'label', 'Type'),
            jsonb_build_object('key', 'description', 'label', 'Description'),
            jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'currency')
        );

        select count(*)
        into v_total_count
        from public.cash_transactions t
        join public.cash_accounts a
          on a.id = t.account_id
        where (p_date_from is null
               or t.transaction_date >= p_date_from::timestamp)
          and (p_date_to is null
               or t.transaction_date < (p_date_to + 1)::timestamp);

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'account_name', a.account_name,
                'account_type', a.account_type,
                'transaction_date', t.transaction_date,
                'transaction_type', t.transaction_type,
                'description', t.description,
                'amount', t.amount
            ) as item

            from public.cash_transactions t

            join public.cash_accounts a
              on a.id = t.account_id

            where (p_date_from is null
                   or t.transaction_date >= p_date_from::timestamp)
              and (p_date_to is null
                   or t.transaction_date < (p_date_to + 1)::timestamp)

            order by t.transaction_date desc, t.created_at desc
            limit v_page_size offset v_offset
        ) x;


    /* =====================================================
       14. PROFIT AND LOSS
       OWNER / MANAGER ONLY
    ===================================================== */

    elsif p_report_type = 'profit_loss' then

        if not v_can_view_profit then
            raise exception 'Profit and Loss access denied.';
        end if;

        v_title := 'Profit & Loss Report';
        v_subtitle := 'Ticket gross profit and business expenses';

        v_columns := jsonb_build_array(
            jsonb_build_object('key', 'sale_reference', 'label', 'Sale Reference'),
            jsonb_build_object('key', 'passenger_name', 'label', 'Passenger'),
            jsonb_build_object('key', 'selling_price', 'label', 'Selling Price', 'type', 'currency'),
            jsonb_build_object('key', 'customer_refund', 'label', 'Customer Refund', 'type', 'currency'),
            jsonb_build_object('key', 'purchase_price', 'label', 'Purchase Price', 'type', 'currency'),
            jsonb_build_object('key', 'additional_cost', 'label', 'Additional Cost', 'type', 'currency'),
            jsonb_build_object('key', 'gross_profit', 'label', 'Gross Profit', 'type', 'currency')
        );

        select count(*)
        into v_total_count
        from public.sale_passengers sp
        join public.ticket_sales s
          on s.id = sp.sale_id
        join public.ticket_financials tf
          on tf.sale_passenger_id = sp.id
        where s.sale_status not in ('cancelled', 'refunded')
          and sp.ticket_status not in ('cancelled', 'refunded')
          and (p_date_from is null or s.sale_date >= p_date_from)
          and (p_date_to is null or s.sale_date <= p_date_to);

        select coalesce(jsonb_agg(x.item), '[]'::jsonb)
        into v_rows
        from (
            select jsonb_build_object(
                'sale_reference', s.sale_reference,
                'passenger_name', sp.passenger_name,
                'selling_price', sp.selling_price,
                'customer_refund', coalesce(r.refund_amount, 0),
                'purchase_price', tf.purchase_price,
                'additional_cost', tf.additional_cost,
                'gross_profit',
                    sp.selling_price
                    - coalesce(r.refund_amount, 0)
                    - tf.purchase_price
                    - tf.additional_cost
            ) as item

            from public.sale_passengers sp

            join public.ticket_sales s
              on s.id = sp.sale_id

            join public.ticket_financials tf
              on tf.sale_passenger_id = sp.id

            left join lateral (
                select sum(rf.refund_amount) as refund_amount
                from public.refunds rf
                where rf.sale_passenger_id = sp.id
                  and rf.refund_type = 'customer'
                  and rf.refund_date <
                      (v_cutoff + 1)::timestamp
            ) r on true

            where s.sale_status not in ('cancelled', 'refunded')
              and sp.ticket_status not in ('cancelled', 'refunded')
              and (p_date_from is null or s.sale_date >= p_date_from)
              and (p_date_to is null or s.sale_date <= p_date_to)

            order by s.sale_date desc, s.created_at desc
            limit v_page_size offset v_offset
        ) x;


        /* Gross profit */
        select coalesce(
            sum(
                sp.selling_price
                - coalesce(r.refund_amount, 0)
                - tf.purchase_price
                - tf.additional_cost
            ),
            0
        )
        into v_gross_profit

        from public.sale_passengers sp

        join public.ticket_sales s
          on s.id = sp.sale_id

        join public.ticket_financials tf
          on tf.sale_passenger_id = sp.id

        left join lateral (
            select sum(rf.refund_amount) as refund_amount
            from public.refunds rf
            where rf.sale_passenger_id = sp.id
              and rf.refund_type = 'customer'
              and rf.refund_date <
                  (v_cutoff + 1)::timestamp
        ) r on true

        where s.sale_status not in ('cancelled', 'refunded')
          and sp.ticket_status not in ('cancelled', 'refunded')
          and (p_date_from is null or s.sale_date >= p_date_from)
          and (p_date_to is null or s.sale_date <= p_date_to);


        /* Business expenses */
        select coalesce(sum(e.amount), 0)
        into v_total_expenses
        from public.expenses e
        where (p_date_from is null or e.expense_date >= p_date_from)
          and (p_date_to is null or e.expense_date <= p_date_to);


        v_summary := v_summary || jsonb_build_object(
            'gross_profit', v_gross_profit,
            'total_expenses', v_total_expenses,
            'net_profit', v_gross_profit - v_total_expenses
        );

    end if;


    /* =====================================================
       15. PAGINATION
    ===================================================== */

    v_total_pages := greatest(
        1,
        ceil(v_total_count::numeric / v_page_size)::integer
    );


    /* =====================================================
       16. RESPONSE
    ===================================================== */

    return jsonb_build_object(
        'success', true,
        'role', v_role,

        'summary', v_summary,

        'report', jsonb_build_object(
            'title', v_title,
            'subtitle', v_subtitle,
            'columns', v_columns,
            'rows', v_rows
        ),

        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );

end;
$function$;


/* =========================================================
   17. FUNCTION PERMISSIONS
========================================================= */

revoke all on function public.get_business_reports(
    date,
    date,
    text,
    integer,
    integer
) from public, anon;

grant execute on function public.get_business_reports(
    date,
    date,
    text,
    integer,
    integer
) to authenticated;


/* =========================================================
   END
========================================================= */
