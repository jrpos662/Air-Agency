
-- =====================================================
-- ACCOUNT TRANSFER HISTORY
-- Paginated transfer records
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_account_transfer_history(
    p_search text DEFAULT '',
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 10
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

    v_total_count bigint;
    v_total_pages integer;
    v_page integer := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100);

    v_records jsonb;
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

    -- Validate filters
    IF p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Invalid date range';
    END IF;

    IF LENGTH(COALESCE(p_search, '')) > 100 THEN
        RAISE EXCEPTION 'Search text is too long';
    END IF;

    -- Count records
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.account_transfers t
    JOIN public.cash_accounts source
        ON source.id = t.from_account_id
    JOIN public.cash_accounts destination
        ON destination.id = t.to_account_id
    WHERE
        (p_date_from IS NULL OR t.transfer_date::date >= p_date_from)
        AND (p_date_to IS NULL OR t.transfer_date::date <= p_date_to)
        AND (
            COALESCE(TRIM(p_search), '') = ''
            OR source.account_name ILIKE '%' || TRIM(p_search) || '%'
            OR destination.account_name ILIKE '%' || TRIM(p_search) || '%'
            OR COALESCE(t.reference_number, '') ILIKE '%' || TRIM(p_search) || '%'
            OR COALESCE(t.notes, '') ILIKE '%' || TRIM(p_search) || '%'
        );

    v_total_pages := CASE
        WHEN v_total_count = 0 THEN 0
        ELSE CEIL(v_total_count::numeric / v_page_size)::integer
    END;

    -- Transfer records
    SELECT COALESCE(
        jsonb_agg(record_data ORDER BY transfer_date DESC),
        '[]'::jsonb
    )
    INTO v_records
    FROM (
        SELECT
            jsonb_build_object(
                'id', t.id,
                'from_account_id', t.from_account_id,
                'from_account_name', source.account_name,
                'to_account_id', t.to_account_id,
                'to_account_name', destination.account_name,
                'amount', t.amount,
                'transfer_date', t.transfer_date,
                'reference_number', t.reference_number,
                'notes', t.notes,
                'created_by', t.created_by,
                'created_at', t.created_at
            ) AS record_data,
            t.transfer_date
        FROM public.account_transfers t
        JOIN public.cash_accounts source
            ON source.id = t.from_account_id
        JOIN public.cash_accounts destination
            ON destination.id = t.to_account_id
        WHERE
            (p_date_from IS NULL OR t.transfer_date::date >= p_date_from)
            AND (p_date_to IS NULL OR t.transfer_date::date <= p_date_to)
            AND (
                COALESCE(TRIM(p_search), '') = ''
                OR source.account_name ILIKE '%' || TRIM(p_search) || '%'
                OR destination.account_name ILIKE '%' || TRIM(p_search) || '%'
                OR COALESCE(t.reference_number, '') ILIKE '%' || TRIM(p_search) || '%'
                OR COALESCE(t.notes, '') ILIKE '%' || TRIM(p_search) || '%'
            )
        ORDER BY t.transfer_date DESC, t.created_at DESC
        LIMIT v_page_size
        OFFSET (v_page - 1) * v_page_size
    ) transfers;

    RETURN jsonb_build_object(
        'success', true,
        'transfers', v_records,
        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );
END;
$$;

-- =====================================================
-- SECURITY
-- =====================================================

REVOKE ALL ON FUNCTION public.get_account_transfer_history(
    text, date, date, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_account_transfer_history(
    text, date, date, integer, integer
) TO authenticated;
