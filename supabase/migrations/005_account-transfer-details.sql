
-- =====================================================
-- ACCOUNT TRANSFER DETAILS
-- Secure single transfer lookup
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_account_transfer_details(
    p_transfer_id uuid
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
    v_result jsonb;
BEGIN
    -- Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Verify staff account
    SELECT role, is_active
    INTO v_role, v_active
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Active staff account required';
    END IF;

    -- Permission check
    IF v_role NOT IN ('owner', 'manager', 'accounts_staff') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF p_transfer_id IS NULL THEN
        RAISE EXCEPTION 'Transfer ID is required';
    END IF;

    -- Fetch transfer details
    SELECT jsonb_build_object(
        'id', t.id,
        'from_account_id', t.from_account_id,
        'from_account_name', source.account_name,
        'from_account_type', source.account_type,
        'from_account_number', source.account_number,
        'to_account_id', t.to_account_id,
        'to_account_name', destination.account_name,
        'to_account_type', destination.account_type,
        'to_account_number', destination.account_number,
        'amount', t.amount,
        'transfer_date', t.transfer_date,
        'reference_number', t.reference_number,
        'notes', t.notes,
        'created_by', t.created_by,
        'created_at', t.created_at
    )
    INTO v_result
    FROM public.account_transfers t
    JOIN public.cash_accounts source
        ON source.id = t.from_account_id
    JOIN public.cash_accounts destination
        ON destination.id = t.to_account_id
    WHERE t.id = p_transfer_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Transfer record not found';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transfer', v_result
    );
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION public.get_account_transfer_details(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_account_transfer_details(uuid)
TO authenticated;
