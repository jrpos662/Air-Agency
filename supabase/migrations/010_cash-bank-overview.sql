
-- =====================================================
-- CASH & BANK OVERVIEW
-- Account balances + transaction history
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_cash_bank_overview(
    p_account_type text DEFAULT 'all',
    p_search text DEFAULT '',
    p_account_id uuid DEFAULT NULL,
    p_transaction_type text DEFAULT 'all',
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
    v_accounts jsonb;
    v_transactions jsonb;
    v_summary jsonb;
BEGIN
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

    IF p_account_type NOT IN ('all', 'cash', 'bank', 'mobile_banking') THEN
        RAISE EXCEPTION 'Invalid account type';
    END IF;

    IF p_transaction_type NOT IN ('all', 'credit', 'debit', 'transfer') THEN
        RAISE EXCEPTION 'Invalid transaction type';
    END IF;

    IF p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Invalid date range';
    END IF;

    -- Account balances
    WITH account_balances AS (
        SELECT
            a.id,
            a.account_name,
            a.account_type,
            a.bank_name,
            a.account_number,
            a.opening_balance,
            a.is_active,
            COALESCE(
                SUM(
                    CASE
                        WHEN t.transaction_type = 'in' THEN t.amount
                        WHEN t.transaction_type = 'out' THEN -t.amount
                        ELSE 0
                    END
                ), 0
            ) AS movement_balance
        FROM public.cash_accounts a
        LEFT JOIN public.cash_transactions t
            ON t.account_id = a.id
        WHERE a.is_active = true
          AND (p_account_type = 'all' OR a.account_type = p_account_type)
        GROUP BY a.id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'account_name', account_name,
                'account_type', account_type,
                'bank_name', bank_name,
                'account_number', account_number,
                'opening_balance', opening_balance,
                'current_balance', opening_balance + movement_balance,
                'is_active', is_active
            )
            ORDER BY account_name
        ), '[]'::jsonb
    )
    INTO v_accounts
    FROM account_balances;

    -- Summary balances across all active accounts
    SELECT jsonb_build_object(
        'total_balance', COALESCE(SUM(balance), 0),
        'cash_balance', COALESCE(SUM(balance) FILTER (WHERE account_type = 'cash'), 0),
        'bank_balance', COALESCE(SUM(balance) FILTER (WHERE account_type = 'bank'), 0),
        'mobile_balance', COALESCE(SUM(balance) FILTER (WHERE account_type = 'mobile_banking'), 0)
    )
    INTO v_summary
    FROM (
        SELECT
            a.account_type,
            a.opening_balance + COALESCE(
                SUM(
                    CASE
                        WHEN t.transaction_type = 'in' THEN t.amount
                        WHEN t.transaction_type = 'out' THEN -t.amount
                        ELSE 0
                    END
                ), 0
            ) AS balance
        FROM public.cash_accounts a
        LEFT JOIN public.cash_transactions t ON t.account_id = a.id
        WHERE a.is_active = true
        GROUP BY a.id
    ) balances;

    -- Count filtered transactions
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.cash_transactions t
    JOIN public.cash_accounts a ON a.id = t.account_id
    WHERE
        (p_account_id IS NULL OR t.account_id = p_account_id)
        AND (
            p_transaction_type = 'all'
            OR (p_transaction_type = 'credit' AND t.transaction_type = 'in')
            OR (p_transaction_type = 'debit' AND t.transaction_type = 'out')
            OR (
                p_transaction_type = 'transfer'
                AND t.reference_type = 'transfer'
            )
        )
        AND (p_date_from IS NULL OR t.transaction_date::date >= p_date_from)
        AND (p_date_to IS NULL OR t.transaction_date::date <= p_date_to)
        AND (
            COALESCE(TRIM(p_search), '') = ''
            OR t.description ILIKE '%' || TRIM(p_search) || '%'
            OR a.account_name ILIKE '%' || TRIM(p_search) || '%'
        );

    v_total_pages := CASE
        WHEN v_total_count = 0 THEN 0
        ELSE CEIL(v_total_count::numeric / v_page_size)::integer
    END;

    -- Paginated transaction history
    SELECT COALESCE(
        jsonb_agg(row_data ORDER BY transaction_date DESC),
        '[]'::jsonb
    )
    INTO v_transactions
    FROM (
        SELECT
            jsonb_build_object(
                'id', t.id,
                'account_id', t.account_id,
                'account_name', a.account_name,
                'account_type', a.account_type,
                'transaction_type',
                    CASE
                        WHEN t.reference_type = 'transfer' THEN 'transfer'
                        WHEN t.transaction_type = 'in' THEN 'credit'
                        ELSE 'debit'
                    END,
                'amount', t.amount,
                'transaction_date', t.transaction_date,
                'reference_type', t.reference_type,
                'reference_id', t.reference_id,
                'description', t.description,
                'recorded_by', t.recorded_by,
                'created_at', t.created_at
            ) AS row_data,
            t.transaction_date
        FROM public.cash_transactions t
        JOIN public.cash_accounts a ON a.id = t.account_id
        WHERE
            (p_account_id IS NULL OR t.account_id = p_account_id)
            AND (
                p_transaction_type = 'all'
                OR (p_transaction_type = 'credit' AND t.transaction_type = 'in')
                OR (p_transaction_type = 'debit' AND t.transaction_type = 'out')
                OR (
                    p_transaction_type = 'transfer'
                    AND t.reference_type = 'transfer'
                )
            )
            AND (p_date_from IS NULL OR t.transaction_date::date >= p_date_from)
            AND (p_date_to IS NULL OR t.transaction_date::date <= p_date_to)
            AND (
                COALESCE(TRIM(p_search), '') = ''
                OR t.description ILIKE '%' || TRIM(p_search) || '%'
                OR a.account_name ILIKE '%' || TRIM(p_search) || '%'
            )
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT v_page_size
        OFFSET (v_page - 1) * v_page_size
    ) transaction_rows;

    RETURN jsonb_build_object(
        'success', true,
        'summary', v_summary,
        'accounts', v_accounts,
        'transactions', v_transactions,
        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_bank_overview(
    text, text, uuid, text, date, date, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_cash_bank_overview(
    text, text, uuid, text, date, date, integer, integer
) TO authenticated;
