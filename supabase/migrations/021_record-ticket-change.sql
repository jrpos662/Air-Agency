
-- Ticket Change History RPC
-- Draft: verify ticket_changes column names before execution.

CREATE OR REPLACE FUNCTION public.record_ticket_change(
    p_sale_passenger_id UUID,
    p_change_type TEXT,
    p_reason TEXT,
    p_old_details JSONB,
    p_new_details JSONB,
    p_reference TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_change_id UUID;
BEGIN
    -- Verify authenticated user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
        RAISE EXCEPTION 'User identity mismatch.';
    END IF;

    -- Verify staff role
    SELECT role::TEXT
    INTO v_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_role IS NULL OR v_role NOT IN (
        'owner',
        'manager',
        'ticket_staff'
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    -- Validate change type
    IF p_change_type NOT IN (
        'date_change',
        'route_change',
        'name_correction',
        'reissue'
    ) THEN
        RAISE EXCEPTION 'Invalid change type.';
    END IF;

    -- Validate reason
    IF p_reason IS NULL
       OR length(trim(p_reason)) < 3
       OR length(p_reason) > 1000 THEN
        RAISE EXCEPTION 'A valid reason is required.';
    END IF;

    IF p_old_details IS NULL
       OR jsonb_typeof(p_old_details) <> 'object'
       OR p_new_details IS NULL
       OR jsonb_typeof(p_new_details) <> 'object' THEN
        RAISE EXCEPTION 'Invalid change details.';
    END IF;

    -- Lock and verify ticket passenger
    PERFORM 1
    FROM public.sale_passengers
    WHERE id = p_sale_passenger_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket passenger not found.';
    END IF;

    -- Save change history
    INSERT INTO public.ticket_changes (
        sale_passenger_id,
        change_type,
        reason,
        old_details,
        new_details,
        reference,
        changed_by,
        created_at
    )
    VALUES (
        p_sale_passenger_id,
        p_change_type,
        trim(p_reason),
        p_old_details,
        p_new_details,
        NULLIF(trim(p_reference), ''),
        v_user_id,
        now()
    )
    RETURNING id INTO v_change_id;

    RETURN v_change_id;
END;
$$;

-- Restrict RPC execution
REVOKE ALL ON FUNCTION public.record_ticket_change(
    UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_ticket_change(
    UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID
) TO authenticated;
