
-- =====================================================
-- CASH ACCOUNT MANAGEMENT
-- Create account + opening balance atomically
-- =====================================================

-- Store account notes (the original table did not include this column).
ALTER TABLE public.cash_accounts
ADD COLUMN IF NOT EXISTS notes text;

-- =====================================================
-- CREATE ACCOUNT WITH OPENING BALANCE
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_cash_account_with_opening_balance(
    p_account_name text,
    p_account_type text,
    p_bank_name text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_opening_balance numeric DEFAULT 0,
    p_opening_date date DEFAULT CURRENT_DATE,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_account_id uuid;
    v_transaction_id uuid;
    v_balance numeric(14,2);
BEGIN
    -- Authenticated user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Verify active profile and role
    SELECT role, is_active
    INTO v_role, v_is_active
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_is_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Active staff account required';
    END IF;

    IF v_role NOT IN ('owner', 'manager', 'accounts_staff') THEN
        RAISE EXCEPTION 'You do not have permission to create accounts';
    END IF;

    -- Validate input
    IF NULLIF(TRIM(p_account_name), '') IS NULL THEN
        RAISE EXCEPTION 'Account name is required';
    END IF;

    IF p_account_type NOT IN ('cash', 'bank', 'mobile_banking') THEN
        RAISE EXCEPTION 'Invalid account type';
    END IF;

    v_balance := COALESCE(p_opening_balance, 0);

    IF v_balance < 0 OR v_balance > 999999999999.99 THEN
        RAISE EXCEPTION 'Invalid opening balance';
    END IF;

    IF v_balance <> ROUND(v_balance, 2) THEN
        RAISE EXCEPTION 'Opening balance supports up to 2 decimal places';
    END IF;

    IF p_opening_date IS NULL OR p_opening_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Invalid opening balance date';
    END IF;

    -- Create account
    INSERT INTO public.cash_accounts (
        account_name,
        account_type,
        bank_name,
        account_number,
        opening_balance,
        notes,
        is_active
    )
    VALUES (
        TRIM(p_account_name),
        p_account_type,
        NULLIF(TRIM(p_bank_name), ''),
        NULLIF(TRIM(p_account_number), ''),
        v_balance,
        NULLIF(TRIM(p_notes), ''),
        true
    )
    RETURNING id INTO v_account_id;

    -- Opening balance is a separate ledger transaction.
    IF v_balance > 0 THEN
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
            'in',
            v_balance,
            p_opening_date::timestamptz,
            'opening_balance',
            v_account_id,
            'Opening balance' ||
                CASE
                    WHEN NULLIF(TRIM(p_notes), '') IS NOT NULL
                    THEN ' - ' || TRIM(p_notes)
                    ELSE ''
                END,
            v_user_id
        )
        RETURNING id INTO v_transaction_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'account_id', v_account_id,
        'opening_transaction_id', v_transaction_id,
        'opening_balance', v_balance
    );
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION public.create_cash_account_with_opening_balance(
    text, text, text, text, numeric, date, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_cash_account_with_opening_balance(
    text, text, text, text, numeric, date, text
) TO authenticated;
