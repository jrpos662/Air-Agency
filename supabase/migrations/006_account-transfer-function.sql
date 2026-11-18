
-- =====================================================
-- ACCOUNT TRANSFER
-- Atomic debit + credit transaction
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_account_transfer(
    p_from_account_id uuid,
    p_to_account_id uuid,
    p_amount numeric,
    p_transfer_date date DEFAULT CURRENT_DATE,
    p_reference_number text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_active boolean;

    v_from_account public.cash_accounts%ROWTYPE;
    v_to_account public.cash_accounts%ROWTYPE;

    v_transfer_id uuid;
    v_debit_id uuid;
    v_credit_id uuid;
    v_balance numeric(14,2);
BEGIN
    -- Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, is_active
    INTO v_role, v_active
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Active staff account required';
    END IF;

    IF v_role NOT IN ('owner', 'manager', 'accounts_staff') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- Input validation
    IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
        RAISE EXCEPTION 'Both accounts are required';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Source and destination accounts must be different';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be greater than zero';
    END IF;

    IF p_amount <> ROUND(p_amount, 2) THEN
        RAISE EXCEPTION 'Transfer amount supports up to 2 decimal places';
    END IF;

    IF p_transfer_date IS NULL OR p_transfer_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Invalid transfer date';
    END IF;

    -- Lock both accounts in a stable order to reduce deadlocks.
    PERFORM 1
    FROM public.cash_accounts
    WHERE id IN (p_from_account_id, p_to_account_id)
    ORDER BY id
    FOR UPDATE;

    SELECT *
    INTO v_from_account
    FROM public.cash_accounts
    WHERE id = p_from_account_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source account not found or inactive';
    END IF;

    SELECT *
    INTO v_to_account
    FROM public.cash_accounts
    WHERE id = p_to_account_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Destination account not found or inactive';
    END IF;

    -- Calculate source balance.
    SELECT
        v_from_account.opening_balance +
        COALESCE(
            SUM(
                CASE
                    WHEN transaction_type = 'in' THEN amount
                    WHEN transaction_type = 'out' THEN -amount
                    ELSE 0
                END
            ), 0
        )
    INTO v_balance
    FROM public.cash_transactions
    WHERE account_id = p_from_account_id;

    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient account balance';
    END IF;

    -- Create transfer record.
    INSERT INTO public.account_transfers (
        from_account_id,
        to_account_id,
        amount,
        transfer_date,
        reference_number,
        notes,
        created_by
    )
    VALUES (
        p_from_account_id,
        p_to_account_id,
        p_amount,
        p_transfer_date::timestamptz,
        NULLIF(TRIM(p_reference_number), ''),
        NULLIF(TRIM(p_notes), ''),
        v_user_id
    )
    RETURNING id INTO v_transfer_id;

    -- Source account debit.
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
        p_from_account_id,
        'out',
        p_amount,
        p_transfer_date::timestamptz,
        'transfer',
        v_transfer_id,
        'Account transfer - Out',
        v_user_id
    )
    RETURNING id INTO v_debit_id;

    -- Destination account credit.
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
        p_to_account_id,
        'in',
        p_amount,
        p_transfer_date::timestamptz,
        'transfer',
        v_transfer_id,
        'Account transfer - In',
        v_user_id
    )
    RETURNING id INTO v_credit_id;

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'debit_transaction_id', v_debit_id,
        'credit_transaction_id', v_credit_id,
        'amount', p_amount
    );
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION public.create_account_transfer(
    uuid, uuid, numeric, date, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_account_transfer(
    uuid, uuid, numeric, date, text, text
) TO authenticated;
