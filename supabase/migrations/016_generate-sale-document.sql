
-- Generate Sale Document RPC
-- DRAFT: Verify receipts table columns before execution.

CREATE OR REPLACE FUNCTION public.generate_sale_document(
    p_sale_id UUID,
    p_document_type TEXT,
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
    v_sale RECORD;
    v_document_id UUID;
    v_document_number TEXT;
    v_existing RECORD;
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
        'ticket_staff',
        'accounts_staff'
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    IF p_document_type NOT IN ('receipt', 'invoice') THEN
        RAISE EXCEPTION 'Invalid document type.';
    END IF;

    SELECT
        id,
        customer_id,
        sale_date,
        selling_total,
        status
    INTO v_sale
    FROM public.ticket_sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket sale not found.';
    END IF;

    -- Reuse an existing document of the same type.
    SELECT id, document_number
    INTO v_existing
    FROM public.receipts
    WHERE sale_id = p_sale_id
      AND document_type = p_document_type
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'id', v_existing.id,
            'document_number', v_existing.document_number,
            'document_type', p_document_type,
            'sale_id', p_sale_id,
            'existing', TRUE
        );
    END IF;

    -- Create a unique document number.
    v_document_number :=
        CASE
            WHEN p_document_type = 'receipt' THEN 'RCT'
            ELSE 'INV'
        END
        || '-'
        || to_char(now(), 'YYYYMMDD')
        || '-'
        || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));

    INSERT INTO public.receipts (
        sale_id,
        document_number,
        document_type,
        customer_id,
        issue_date,
        created_by,
        created_at
    )
    VALUES (
        p_sale_id,
        v_document_number,
        p_document_type,
        v_sale.customer_id,
        CURRENT_DATE,
        v_user_id,
        now()
    )
    RETURNING id INTO v_document_id;

    RETURN jsonb_build_object(
        'id', v_document_id,
        'document_number', v_document_number,
        'document_type', p_document_type,
        'sale_id', p_sale_id,
        'existing', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_sale_document(
    UUID, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_sale_document(
    UUID, TEXT, UUID
) TO authenticated;
