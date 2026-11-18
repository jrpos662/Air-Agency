
-- =====================================================
-- CASH TRANSACTION DETAILS
-- File: supabase/cash-transaction-details.sql
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_cash_transaction_details(
    p_transaction_id uuid
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
    v_tx record;
    v_result jsonb;
BEGIN
    -- 1. Authentication
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_transaction_id IS NULL THEN
        RAISE EXCEPTION 'Transaction ID is required.';
    END IF;

    -- 2. Permission check
    SELECT role, is_active
    INTO v_role, v_is_active
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Active user profile required.';
    END IF;

    IF v_role NOT IN ('owner', 'manager', 'accounts_staff') THEN
        RAISE EXCEPTION 'You do not have permission to view cash transactions.';
    END IF;

    -- 3. First check normal cash transaction
    SELECT
        ct.id,
        ct.account_id,
        ca.account_name,
        ca.account_type,
        ca.bank_name,
        ca.account_number,
        ct.transaction_type,
        ct.amount,
        ct.transaction_date,
        ct.reference_type,
        ct.reference_id,
        ct.description,
        ct.recorded_by,
        ct.created_at
    INTO v_tx
    FROM public.cash_transactions ct
    JOIN public.cash_accounts ca
        ON ca.id = ct.account_id
    WHERE ct.id = p_transaction_id;

    IF FOUND THEN
        v_result := jsonb_build_object(
            'id', v_tx.id,
            'transaction_id', v_tx.id,
            'transaction_type', v_tx.transaction_type,
            'amount', v_tx.amount,
            'transaction_date', v_tx.transaction_date,
            'created_at', v_tx.created_at,

            'account_id', v_tx.account_id,
            'account_name', v_tx.account_name,
            'account_type', v_tx.account_type,
            'bank_name', v_tx.bank_name,
            'account_number', v_tx.account_number,

            'reference_type', v_tx.reference_type,
            'reference_id', v_tx.reference_id,
            'reference_number', NULL,

            'description', v_tx.description,
            'recorded_by', v_tx.recorded_by,
            'recorded_by_name', NULL,

            'transfer_id', NULL,
            'from_account_name', NULL,
            'to_account_name', NULL
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'transaction', v_result
        );
    END IF;

    -- 4. If not found, check account transfer
    SELECT
        at.id,
        at.from_account_id,
        at.to_account_id,
        at.amount,
        at.transfer_date,
        at.reference_number,
        at.notes,
        at.created_by,
        at.created_at,

        fa.account_name AS from_account_name,
        fa.account_type AS from_account_type,
        fa.bank_name AS from_bank_name,
        fa.account_number AS from_account_number,

        ta.account_name AS to_account_name,
        ta.account_type AS to_account_type,
        ta.bank_name AS to_bank_name,
        ta.account_number AS to_account_number

    INTO v_tx
    FROM public.account_transfers at
    JOIN public.cash_accounts fa
        ON fa.id = at.from_account_id
    JOIN public.cash_accounts ta
        ON ta.id = at.to_account_id
    WHERE at.id = p_transaction_id;

    IF FOUND THEN
        v_result := jsonb_build_object(
            'id', v_tx.id,
            'transaction_id', v_tx.id,
            'transaction_type', 'transfer',
            'amount', v_tx.amount,
            'transaction_date', v_tx.transfer_date,
            'created_at', v_tx.created_at,

            'account_id', v_tx.from_account_id,
            'account_name',
                v_tx.from_account_name || ' → ' || v_tx.to_account_name,
            'account_type', v_tx.from_account_type,
            'bank_name', v_tx.from_bank_name,
            'account_number', v_tx.from_account_number,

            'reference_type', 'transfer',
            'reference_id', v_tx.id,
            'reference_number', v_tx.reference_number,

            'description', v_tx.notes,
            'recorded_by', v_tx.created_by,
            'recorded_by_name', NULL,

            'transfer_id', v_tx.id,
            'from_account_name', v_tx.from_account_name,
            'to_account_name', v_tx.to_account_name,

            'from_account', jsonb_build_object(
                'id', v_tx.from_account_id,
                'account_name', v_tx.from_account_name,
                'account_type', v_tx.from_account_type,
                'bank_name', v_tx.from_bank_name,
                'account_number', v_tx.from_account_number
            ),

            'to_account', jsonb_build_object(
                'id', v_tx.to_account_id,
                'account_name', v_tx.to_account_name,
                'account_type', v_tx.to_account_type,
                'bank_name', v_tx.to_bank_name,
                'account_number', v_tx.to_account_number
            )
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'transaction', v_result
        );
    END IF;

    -- 5. Not found
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Transaction not found.'
    );
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION
public.get_cash_transaction_details(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.get_cash_transaction_details(uuid)
TO authenticated;

-- =====================================================
-- END
-- =====================================================
