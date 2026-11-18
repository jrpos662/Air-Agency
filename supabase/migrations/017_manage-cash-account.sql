
-- Cash & Bank Account Management RPC
-- DRAFT: Verify cash_accounts and cash_transactions columns
-- before running this SQL.

CREATE OR REPLACE FUNCTION public.manage_cash_account(
    p_action TEXT,
    p_account_id UUID,
    p_account_name TEXT,
    p_account_type TEXT,
    p_account_number TEXT DEFAULT NULL,
    p_bank_name TEXT DEFAULT NULL,
    p_branch_name TEXT DEFAULT NULL,
    p_opening_balance NUMERIC DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
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
    v_account_id UUID;
    v_account RECORD;
    v_transaction_id UUID;
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

    IF p_action NOT IN ('create', 'update') THEN
        RAISE EXCEPTION 'Invalid action.';
    END IF;

    IF p_account_name IS NULL
       OR length(trim(p_account_name)) < 2
       OR length(p_account_name) > 100 THEN
        RAISE EXCEPTION 'Invalid account name.';
    END IF;

    IF p_account_type NOT IN (
        'cash',
        'bank',
        'mobile_banking'
    ) THEN
        RAISE EXCEPTION 'Invalid account type.';
    END IF;

    IF p_action = 'create' THEN

        IF p_opening_balance IS NULL
           OR p_opening_balance < 0 THEN
            RAISE EXCEPTION 'Invalid opening balance.';
        END IF;

        INSERT INTO public.cash_accounts (
            account_name,
            account_type,
            account_number,
            bank_name,
            branch_name,
            opening_balance,
            current_balance,
            is_active,
            created_by,
            created_at
        )
        VALUES (
            trim(p_account_name),
            p_account_type,
            NULLIF(trim(p_account_number), ''),
            NULLIF(trim(p_bank_name), ''),
            NULLIF(trim(p_branch_name), ''),
            p_opening_balance,
            p_opening_balance,
            TRUE,
            v_user_id,
            now()
        )
        RETURNING id INTO v_account_id;

        -- Opening balance must also be represented
        -- in the cash/bank transaction ledger.
        IF p_opening_balance > 0 THEN

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
                v_account_id,
                'opening_balance',
                p_opening_balance,
                CURRENT_DATE,
                'Opening balance',
                'OPENING-' || v_account_id::TEXT,
                v_user_id,
                now()
            )
            RETURNING id INTO v_transaction_id;

        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'created',
            'account_id', v_account_id,
            'opening_transaction_id', v_transaction_id
        );

    ELSE

        IF p_account_id IS NULL THEN
            RAISE EXCEPTION 'Account ID is required.';
        END IF;

        SELECT *
        INTO v_account
        FROM public.cash_accounts
        WHERE id = p_account_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Account not found.';
        END IF;

        -- Do not allow changing account type after
        -- transactions have been recorded.
        IF v_account.account_type::TEXT <> p_account_type
           AND EXISTS (
               SELECT 1
               FROM public.cash_transactions
               WHERE account_id = p_account_id
           ) THEN
            RAISE EXCEPTION
                'Account type cannot be changed after transactions exist.';
        END IF;

        UPDATE public.cash_accounts
        SET
            account_name = trim(p_account_name),
            account_type = p_account_type,
            account_number = NULLIF(trim(p_account_number), ''),
            bank_name = NULLIF(trim(p_bank_name), ''),
            branch_name = NULLIF(trim(p_branch_name), ''),
            is_active = COALESCE(p_is_active, TRUE),
            updated_at = now()
        WHERE id = p_account_id;

        v_account_id := p_account_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'updated',
            'account_id', v_account_id
        );

    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_cash_account(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
    NUMERIC, BOOLEAN, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.manage_cash_account(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
    NUMERIC, BOOLEAN, UUID
) TO authenticated;
