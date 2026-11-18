
-- =====================================================
-- ALL CASH & BANK TRANSACTIONS
-- Air Ticket Agency Management
-- Supabase / PostgreSQL
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_all_cash_transactions(
    p_search TEXT DEFAULT '',
    p_account_id UUID DEFAULT NULL,
    p_account_type TEXT DEFAULT 'all',
    p_transaction_type TEXT DEFAULT 'all',
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_is_active BOOLEAN;

    v_total_count BIGINT := 0;
    v_total_pages INTEGER := 1;
    v_offset INTEGER;

    v_total_in NUMERIC(14,2) := 0;
    v_total_out NUMERIC(14,2) := 0;

    v_transactions JSONB := '[]'::JSONB;
BEGIN

    -- -------------------------------------------------
    -- 1. Authentication
    -- -------------------------------------------------

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, is_active
    INTO v_role, v_is_active
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Active staff profile required';
    END IF;

    IF v_role NOT IN ('owner', 'manager', 'accounts_staff') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- -------------------------------------------------
    -- 2. Validate filters
    -- -------------------------------------------------

    IF p_account_type NOT IN (
        'all',
        'cash',
        'bank',
        'mobile_banking'
    ) THEN
        RAISE EXCEPTION 'Invalid account type';
    END IF;

    IF p_transaction_type NOT IN (
        'all',
        'in',
        'out',
        'transfer'
    ) THEN
        RAISE EXCEPTION 'Invalid transaction type';
    END IF;

    IF p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Invalid date range';
    END IF;

    IF p_page < 1 OR p_page_size < 1 OR p_page_size > 100 THEN
        RAISE EXCEPTION 'Invalid pagination';
    END IF;

    IF p_search IS NOT NULL AND LENGTH(p_search) > 200 THEN
        RAISE EXCEPTION 'Search text is too long';
    END IF;

    v_offset := (p_page - 1) * p_page_size;

    -- -------------------------------------------------
    -- 3. Build transaction dataset
    --
    -- Transfer is displayed once from account_transfers.
    -- Its paired cash_transactions rows are excluded.
    -- -------------------------------------------------

    CREATE TEMP TABLE IF NOT EXISTS
        tmp_all_cash_transactions (
            id UUID,
            transaction_date TIMESTAMPTZ,
            account_id UUID,
            account_name TEXT,
            account_type TEXT,
            transaction_type TEXT,
            amount NUMERIC(14,2),
            reference_type TEXT,
            reference_id UUID,
            reference_number TEXT,
            description TEXT
        ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_all_cash_transactions;

    -- Normal cash transactions
    INSERT INTO tmp_all_cash_transactions (
        id,
        transaction_date,
        account_id,
        account_name,
        account_type,
        transaction_type,
        amount,
        reference_type,
        reference_id,
        reference_number,
        description
    )
    SELECT
        ct.id,
        ct.transaction_date,
        ca.id,
        ca.account_name,
        ca.account_type,
        ct.transaction_type,
        ct.amount,
        ct.reference_type,
        ct.reference_id,
        NULL::TEXT,
        ct.description
    FROM public.cash_transactions ct
    JOIN public.cash_accounts ca
        ON ca.id = ct.account_id
    WHERE
        COALESCE(ct.reference_type, '') <> 'transfer'
        AND (
            p_account_id IS NULL
            OR ct.account_id = p_account_id
        )
        AND (
            p_account_type = 'all'
            OR ca.account_type = p_account_type
        );

    -- Transfers: one display row per transfer
    INSERT INTO tmp_all_cash_transactions (
        id,
        transaction_date,
        account_id,
        account_name,
        account_type,
        transaction_type,
        amount,
        reference_type,
        reference_id,
        reference_number,
        description
    )
    SELECT
        t.id,
        t.transfer_date::TIMESTAMPTZ,
        t.from_account_id,
        from_account.account_name,
        from_account.account_type,
        'transfer',
        t.amount,
        'transfer',
        t.id,
        t.reference_number,
        COALESCE(t.notes, 'Account transfer')
    FROM public.account_transfers t
    JOIN public.cash_accounts from_account
        ON from_account.id = t.from_account_id
    JOIN public.cash_accounts to_account
        ON to_account.id = t.to_account_id
    WHERE
        (
            p_account_id IS NULL
            OR t.from_account_id = p_account_id
            OR t.to_account_id = p_account_id
        )
        AND (
            p_account_type = 'all'
            OR from_account.account_type = p_account_type
            OR to_account.account_type = p_account_type
        );

    -- -------------------------------------------------
    -- 4. Summary
    -- -------------------------------------------------

    SELECT
        COALESCE(SUM(
            CASE
                WHEN transaction_type = 'in' THEN amount
                WHEN transaction_type = 'transfer' THEN amount
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN transaction_type = 'out' THEN amount
                WHEN transaction_type = 'transfer' THEN amount
                ELSE 0
            END
        ), 0)
    INTO v_total_in, v_total_out
    FROM tmp_all_cash_transactions
    WHERE
        (
            p_transaction_type = 'all'
            OR transaction_type = p_transaction_type
        )
        AND (
            p_date_from IS NULL
            OR transaction_date >= p_date_from::TIMESTAMPTZ
        )
        AND (
            p_date_to IS NULL
            OR transaction_date < (p_date_to + 1)::TIMESTAMPTZ
        )
        AND (
            COALESCE(p_search, '') = ''
            OR account_name ILIKE '%' || p_search || '%'
            OR COALESCE(reference_number, '') ILIKE '%' || p_search || '%'
            OR COALESCE(description, '') ILIKE '%' || p_search || '%'
        );

    -- -------------------------------------------------
    -- 5. Count
    -- -------------------------------------------------

    SELECT COUNT(*)
    INTO v_total_count
    FROM tmp_all_cash_transactions
    WHERE
        (
            p_transaction_type = 'all'
            OR transaction_type = p_transaction_type
        )
        AND (
            p_date_from IS NULL
            OR transaction_date >= p_date_from::TIMESTAMPTZ
        )
        AND (
            p_date_to IS NULL
            OR transaction_date < (p_date_to + 1)::TIMESTAMPTZ
        )
        AND (
            COALESCE(p_search, '') = ''
            OR account_name ILIKE '%' || p_search || '%'
            OR COALESCE(reference_number, '') ILIKE '%' || p_search || '%'
            OR COALESCE(description, '') ILIKE '%' || p_search || '%'
        );

    v_total_pages := GREATEST(
        1,
        CEIL(v_total_count::NUMERIC / p_page_size)::INTEGER
    );

    -- -------------------------------------------------
    -- 6. Paginated records
    -- -------------------------------------------------

    SELECT COALESCE(
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'id', result.id,
                'transaction_date', result.transaction_date,
                'account_id', result.account_id,
                'account_name', result.account_name,
                'account_type', result.account_type,
                'transaction_type', result.transaction_type,
                'amount', result.amount,
                'reference_type', result.reference_type,
                'reference_id', result.reference_id,
                'reference_number', result.reference_number,
                'description', result.description
            )
            ORDER BY
                result.transaction_date DESC,
                result.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_transactions
    FROM (
        SELECT *
        FROM tmp_all_cash_transactions
        WHERE
            (
                p_transaction_type = 'all'
                OR transaction_type = p_transaction_type
            )
            AND (
                p_date_from IS NULL
                OR transaction_date >= p_date_from::TIMESTAMPTZ
            )
            AND (
                p_date_to IS NULL
                OR transaction_date < (p_date_to + 1)::TIMESTAMPTZ
            )
            AND (
                COALESCE(p_search, '') = ''
                OR account_name ILIKE '%' || p_search || '%'
                OR COALESCE(reference_number, '') ILIKE '%' || p_search || '%'
                OR COALESCE(description, '') ILIKE '%' || p_search || '%'
            )
        ORDER BY transaction_date DESC, id DESC
        LIMIT p_page_size
        OFFSET v_offset
    ) result;

    -- -------------------------------------------------
    -- 7. Response
    -- -------------------------------------------------

    RETURN JSONB_BUILD_OBJECT(
        'success', TRUE,
        'summary', JSONB_BUILD_OBJECT(
            'total_count', v_total_count,
            'total_in', v_total_in,
            'total_out', v_total_out,
            'net_movement', v_total_in - v_total_out
        ),
        'transactions', v_transactions,
        'pagination', JSONB_BUILD_OBJECT(
            'current_page', p_page,
            'page_size', p_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );

END;
$$;

-- -----------------------------------------------------
-- 8. Function Permissions
-- -----------------------------------------------------

REVOKE ALL ON FUNCTION public.get_all_cash_transactions(
    TEXT,
    UUID,
    TEXT,
    TEXT,
    DATE,
    DATE,
    INTEGER,
    INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_all_cash_transactions(
    TEXT,
    UUID,
    TEXT,
    TEXT,
    DATE,
    DATE,
    INTEGER,
    INTEGER
) TO authenticated;
