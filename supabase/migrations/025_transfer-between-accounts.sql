
-- Cash & Bank Account Transfer RPC
-- DRAFT: Verify table columns and transaction_type values
-- before running this SQL.

CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount NUMERIC,
    p_transfer_date DATE,
    p_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_from_account RECORD;
    v_to_account RECORD;
    v_transfer_id UUID;
    v_debit_id UUID;
    v_credit_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
        RAISE EXCEPTION 'User identity mismatch.';
    END IF;

    SELECT role::TEXT
    INTO v_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_role IS NULL OR v_role NOT IN (
        'owner',
        'manager',
        'accounts_staff'
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    IF p_from_account_id IS NULL
       OR p_to_account_id IS NULL
       OR p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Invalid transfer accounts.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be greater than zero.';
    END IF;

    IF p_transfer_date IS NULL THEN
        RAISE EXCEPTION 'Transfer date is required.';
    END IF;

    -- Lock accounts in consistent order to reduce deadlocks.
    IF p_from_account_id < p_to_account_id THEN

        SELECT *
        INTO v_from_account
        FROM public.cash_accounts
        WHERE id = p_from_account_id
        FOR UPDATE;

        SELECT *
        INTO v_to_account
        FROM public.cash_accounts
        WHERE id = p_to_account_id
        FOR UPDATE;

    ELSE

        SELECT *
        INTO v_to_account
        FROM public.cash_accounts
        WHERE id = p_to_account_id
        FOR UPDATE;

        SELECT *
        INTO v_from_account
        FROM public.cash_accounts
        WHERE id = p_from_account_id
        FOR UPDATE;

    END IF;

    IF v_from_account.id IS NULL
       OR v_to_account.id IS NULL THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;

    IF NOT v_from_account.is_active
       OR NOT v_to_account.is_active THEN
        RAISE EXCEPTION 'Both accounts must be active.';
    END IF;

    IF v_from_account.current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient account balance.';
    END IF;

    -- Create transfer record.
    INSERT INTO public.account_transfers (
        from_account_id,
        to_account_id,
        amount,
        transfer_date,
        reference,
        notes,
        created_by,
        created_at
    )
    VALUES (
        p_from_account_id,
        p_to_account_id,
        p_amount,
        p_transfer_date,
        NULLIF(trim(p_reference), ''),
        NULLIF(trim(p_notes), ''),
        v_user_id,
        now()
    )
    RETURNING id INTO v_transfer_id;

    -- Source account debit.
    INSERT INTO public.cash_transactions (
        account_id,
        transaction_type,
        amount,
        transaction_date,
        description,
        reference,
        recorded_by,
        created_at
    )
    VALUES (
        p_from_account_id,
        'transfer_out',
        p_amount,
        p_transfer_date,
        'Transfer to another account',
        v_transfer_id::TEXT,
        v_user_id,
        now()
    )
    RETURNING id INTO v_debit_id;

    -- Destination account credit.
    INSERT INTO public.cash_transactions (
        account_id,
        transaction_type,
        amount,
        transaction_date,
        description,
        reference,
        recorded_by,
        created_at
    )
    VALUES (
        p_to_account_id,
        'transfer_in',
        p_amount,
        p_transfer_date,
        'Transfer from another account',
        v_transfer_id::TEXT,
        v_user_id,
        now()
    )
    RETURNING id INTO v_credit_id;

    -- Update account balances.
    UPDATE public.cash_accounts
    SET current_balance = current_balance - p_amount,
        updated_at = now()
    WHERE id = p_from_account_id;

    UPDATE public.cash_accounts
    SET current_balance = current_balance + p_amount,
        updated_at = now()
    WHERE id = p_to_account_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', v_transfer_id,
        'debit_transaction_id', v_debit_id,
        'credit_transaction_id', v_credit_id,
        'amount', p_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_between_accounts(
    UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(
    UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID
) TO authenticated;
