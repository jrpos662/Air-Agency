
-- =========================================================
-- AIR TICKET AGENCY MANAGEMENT
-- CUSTOMER TICKET REFUND RPC
-- Reconciled with ZIP 4 schema
-- =========================================================

CREATE OR REPLACE FUNCTION public.record_ticket_refund(
    p_sale_passenger_id uuid,
    p_refund_amount numeric,
    p_refund_type text,
    p_reason text,
    p_reference text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_is_active boolean;

    v_refund_id uuid;
    v_sale_id uuid;
    v_selling_price numeric(14,2);
    v_previous_refunds numeric(14,2);
    v_total_refunds numeric(14,2);

    v_account_id uuid;
    v_ticket_status text;
    v_sale_status text;

    v_ticket_count integer;
    v_fully_refunded_count integer;
    v_any_refund_count integer;
BEGIN

    -- =====================================================
    -- 1. AUTHENTICATION
    -- =====================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT p.role, p.is_active
    INTO v_role, v_is_active
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF NOT FOUND OR v_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Active account required.';
    END IF;

    IF v_role NOT IN (
        'owner',
        'manager',
        'ticket_staff'
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;


    -- =====================================================
    -- 2. INPUT VALIDATION
    -- =====================================================

    IF p_refund_amount IS NULL
       OR p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid refund amount.';
    END IF;

    IF p_refund_type IS DISTINCT FROM 'customer' THEN
        RAISE EXCEPTION
            'Only customer refunds are currently supported.';
    END IF;

    IF p_reason IS NULL
       OR length(trim(p_reason)) < 3
       OR length(trim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'A valid refund reason is required.';
    END IF;

    IF p_reference IS NOT NULL
       AND length(trim(p_reference)) > 100 THEN
        RAISE EXCEPTION 'Invalid refund reference.';
    END IF;

    IF p_notes IS NOT NULL
       AND length(p_notes) > 2000 THEN
        RAISE EXCEPTION 'Refund notes are too long.';
    END IF;

    IF p_account_id IS NULL THEN
        RAISE EXCEPTION
            'Please select a cash or bank account.';
    END IF;


    -- =====================================================
    -- 3. LOCK AND VERIFY TICKET
    -- =====================================================

    SELECT
        sp.sale_id,
        sp.selling_price,
        sp.ticket_status
    INTO
        v_sale_id,
        v_selling_price,
        v_ticket_status
    FROM public.sale_passengers sp
    WHERE sp.id = p_sale_passenger_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found.';
    END IF;

    IF v_ticket_status = 'cancelled' THEN
        RAISE EXCEPTION
            'Cancelled tickets cannot be refunded through this operation.';
    END IF;

    IF v_selling_price <= 0 THEN
        RAISE EXCEPTION
            'Ticket has no refundable selling value.';
    END IF;


    -- =====================================================
    -- 4. LOCK SALE
    -- =====================================================

    SELECT ts.sale_status
    INTO v_sale_status
    FROM public.ticket_sales ts
    WHERE ts.id = v_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket sale not found.';
    END IF;

    IF v_sale_status = 'cancelled' THEN
        RAISE EXCEPTION
            'Cancelled sales cannot be refunded through this operation.';
    END IF;


    -- =====================================================
    -- 5. VERIFY ACTIVE CASH/BANK ACCOUNT
    -- =====================================================

    SELECT ca.id
    INTO v_account_id
    FROM public.cash_accounts ca
    WHERE ca.id = p_account_id
      AND ca.is_active = true
    FOR UPDATE;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION
            'Selected cash/bank account is unavailable.';
    END IF;


    -- =====================================================
    -- 6. CHECK PREVIOUS CUSTOMER REFUNDS
    -- =====================================================

    SELECT COALESCE(SUM(r.refund_amount), 0)
    INTO v_previous_refunds
    FROM public.refunds r
    WHERE r.sale_passenger_id = p_sale_passenger_id
      AND r.refund_type = 'customer';

    IF v_previous_refunds + p_refund_amount > v_selling_price THEN
        RAISE EXCEPTION
            'Refund exceeds the remaining refundable amount.';
    END IF;


    -- =====================================================
    -- 7. CREATE REFUND RECORD
    -- =====================================================

    INSERT INTO public.refunds (
        sale_id,
        sale_passenger_id,
        refund_reference,
        refund_amount,
        refund_date,
        refund_type,
        reason,
        notes,
        processed_by
    )
    VALUES (
        v_sale_id,
        p_sale_passenger_id,
        NULLIF(trim(p_reference), ''),
        p_refund_amount,
        now(),
        'customer',
        trim(p_reason),
        NULLIF(trim(p_notes), ''),
        v_user_id
    )
    RETURNING id INTO v_refund_id;


    -- =====================================================
    -- 8. RECORD CASH/BANK OUTFLOW
    -- =====================================================

    INSERT INTO public.cash_transactions (
        account_id,
        transaction_type,
        amount,
        transaction_date,
        reference_type,
        reference_id,
        description,
        recorded_by
    )
    VALUES (
        v_account_id,
        'out',
        p_refund_amount,
        now(),
        'ticket_refund',
        v_refund_id,
        'Customer ticket refund - ' || trim(p_reason),
        v_user_id
    );


    -- =====================================================
    -- 9. UPDATE TICKET STATUS
    -- =====================================================

    SELECT COALESCE(SUM(r.refund_amount), 0)
    INTO v_total_refunds
    FROM public.refunds r
    WHERE r.sale_passenger_id = p_sale_passenger_id
      AND r.refund_type = 'customer';

    UPDATE public.sale_passengers
    SET
        ticket_status = CASE
            WHEN v_total_refunds >= v_selling_price
                THEN 'refunded'
            ELSE ticket_status
        END,
        updated_at = now()
    WHERE id = p_sale_passenger_id;


    -- =====================================================
    -- 10. RECALCULATE SALE STATUS
    -- =====================================================

    SELECT
        COUNT(*),

        COUNT(*) FILTER (
            WHERE sp.ticket_status = 'refunded'
        ),

        COUNT(*) FILTER (
            WHERE EXISTS (
                SELECT 1
                FROM public.refunds r
                WHERE r.sale_passenger_id = sp.id
                  AND r.refund_type = 'customer'
            )
        )

    INTO
        v_ticket_count,
        v_fully_refunded_count,
        v_any_refund_count

    FROM public.sale_passengers sp
    WHERE sp.sale_id = v_sale_id;


    UPDATE public.ticket_sales
    SET
        sale_status = CASE

            WHEN v_ticket_count > 0
                 AND v_fully_refunded_count = v_ticket_count
                THEN 'refunded'

            WHEN v_any_refund_count > 0
                THEN 'partially_refunded'

            ELSE sale_status

        END,
        updated_at = now()
    WHERE id = v_sale_id;


    -- =====================================================
    -- 11. AUDIT LOG
    -- =====================================================

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        new_data,
        created_at
    )
    VALUES (
        v_user_id,
        'ticket_refund_recorded',
        'refunds',
        v_refund_id,
        jsonb_build_object(
            'sale_id', v_sale_id,
            'sale_passenger_id', p_sale_passenger_id,
            'refund_amount', p_refund_amount,
            'refund_type', 'customer',
            'account_id', v_account_id,
            'reason', trim(p_reason)
        ),
        now()
    );


    -- =====================================================
    -- 12. RETURN
    -- =====================================================

    RETURN v_refund_id;

END;
$$;


-- =========================================================
-- FUNCTION PERMISSIONS
-- =========================================================

REVOKE ALL ON FUNCTION public.record_ticket_refund(
    uuid,
    numeric,
    text,
    text,
    text,
    text,
    uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_ticket_refund(
    uuid,
    numeric,
    text,
    text,
    text,
    text,
    uuid
) TO authenticated;


-- =========================================================
-- END
-- =========================================================
