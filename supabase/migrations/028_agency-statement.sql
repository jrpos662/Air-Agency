-- =====================================================
-- AGENCY ACCOUNT STATEMENT
-- Used by Edge Functions:
--   get-agency-details
--   get-agency-account-statement
--
-- Ledger rules (see record-agency-payment.sql):
--   Ticket Purchase = Debit  (increases payable)
--   Agency Payment  = Credit (reduces payable)
-- Current payable = opening balance + debits - credits
-- Running balance is calculated over the FULL ledger so it stays
-- correct when filters or pagination are applied.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_agency_account_statement(
    p_agency_id uuid,
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 10,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_transaction_type text DEFAULT 'all',
    p_search text DEFAULT ''
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
    v_agency public.agencies%ROWTYPE;
    v_page integer := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100);
    v_search text := lower(btrim(COALESCE(p_search, '')));
    v_total_count bigint;
    v_total_pages integer;
    v_summary jsonb;
    v_transactions jsonb;
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

    IF p_transaction_type NOT IN (
        'all', 'opening_balance', 'ticket_purchase',
        'payment', 'adjustment', 'refund'
    ) THEN
        RAISE EXCEPTION 'Invalid transaction type';
    END IF;

    IF p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Start date cannot be later than end date';
    END IF;

    SELECT * INTO v_agency
    FROM public.agencies
    WHERE id = p_agency_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Agency not found.'
        );
    END IF;

    SELECT jsonb_build_object(
        'opening_balance', v_agency.opening_balance,
        'total_purchases', COALESCE(SUM(t.debit_amount)
            FILTER (WHERE t.transaction_type = 'ticket_purchase'), 0),
        'total_payments', COALESCE(SUM(t.credit_amount)
            FILTER (WHERE t.transaction_type = 'payment'), 0),
        'current_payable_balance', v_agency.opening_balance
            + COALESCE(SUM(t.debit_amount), 0)
            - COALESCE(SUM(t.credit_amount), 0)
    )
    INTO v_summary
    FROM public.agency_transactions t
    WHERE t.agency_id = p_agency_id;

    WITH ledger AS (
        SELECT
            t.*,
            v_agency.opening_balance
                + SUM(t.debit_amount - t.credit_amount) OVER (
                    ORDER BY t.transaction_date, t.created_at, t.id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running_balance
        FROM public.agency_transactions t
        WHERE t.agency_id = p_agency_id
    ),
    filtered AS (
        SELECT l.*
        FROM ledger l
        WHERE (p_date_from IS NULL OR l.transaction_date::date >= p_date_from)
          AND (p_date_to IS NULL OR l.transaction_date::date <= p_date_to)
          AND (p_transaction_type = 'all'
               OR l.transaction_type = p_transaction_type)
          AND (v_search = ''
               OR position(v_search IN lower(COALESCE(l.transaction_reference, ''))) > 0
               OR position(v_search IN lower(COALESCE(l.description, ''))) > 0)
    ),
    page_rows AS (
        SELECT *
        FROM filtered
        ORDER BY transaction_date DESC, created_at DESC, id DESC
        OFFSET (v_page - 1) * v_page_size
        LIMIT v_page_size
    )
    SELECT
        (SELECT COUNT(*) FROM filtered),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'transaction_reference', p.transaction_reference,
                    'transaction_type', p.transaction_type,
                    'transaction_date', p.transaction_date,
                    'description', p.description,
                    'debit_amount', p.debit_amount,
                    'credit_amount', p.credit_amount,
                    'running_balance', p.running_balance
                )
                ORDER BY p.transaction_date DESC, p.created_at DESC, p.id DESC
            ),
            '[]'::jsonb
        )
    INTO v_total_count, v_transactions
    FROM page_rows p;

    v_total_pages := GREATEST(
        1,
        CEIL(v_total_count::numeric / v_page_size)::integer
    );

    RETURN jsonb_build_object(
        'success', true,
        'agency', jsonb_build_object(
            'id', v_agency.id,
            'name', v_agency.agency_name,
            'agency_name', v_agency.agency_name,
            'contact_person', v_agency.contact_person,
            'phone', v_agency.mobile,
            'mobile', v_agency.mobile,
            'whatsapp', v_agency.whatsapp,
            'email', v_agency.email,
            'address', v_agency.address,
            'account_reference', v_agency.account_reference,
            'notes', v_agency.notes,
            'is_active', v_agency.is_active,
            'created_at', v_agency.created_at
        ),
        'summary', v_summary,
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

REVOKE ALL ON FUNCTION public.get_agency_account_statement(
    uuid, integer, integer, date, date, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_agency_account_statement(
    uuid, integer, integer, date, date, text, text
) TO authenticated;
