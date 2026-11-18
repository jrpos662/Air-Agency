
-- =====================================================
-- ACCOUNT BALANCE FUNCTION
-- Calculate current balance for one account
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_cash_account_balance(
    p_account_id uuid
)
RETURNS numeric(14,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_active boolean;
    v_opening_balance numeric(14,2);
    v_total_in numeric(14,2);
    v_total_out numeric(14,2);
BEGIN
    -- Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Staff access verification
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

    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'Account ID is required';
    END IF;

    -- Get opening balance
    SELECT opening_balance
    INTO v_opening_balance
    FROM public.cash_accounts
    WHERE id = p_account_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found or inactive';
    END IF;

    -- Calculate incoming and outgoing transactions
    SELECT
        COALESCE(
            SUM(amount) FILTER (WHERE transaction_type = 'in'),
            0
        ),
        COALESCE(
            SUM(amount) FILTER (WHERE transaction_type = 'out'),
            0
        )
    INTO v_total_in, v_total_out
    FROM public.cash_transactions
    WHERE account_id = p_account_id;

    RETURN (
        v_opening_balance +
        v_total_in -
        v_total_out
    )::numeric(14,2);
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION public.get_cash_account_balance(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_cash_account_balance(uuid)
TO authenticated;
