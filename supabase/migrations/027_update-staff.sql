
-- Update Staff Profile RPC
-- DRAFT: Verify profiles.role type and column names.

CREATE OR REPLACE FUNCTION public.update_staff(
    p_staff_user_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_new_role TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_current_role TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_owner() THEN
        RAISE EXCEPTION 'Only the Owner can update staff.';
    END IF;

    IF p_staff_user_id IS NULL
       OR p_staff_user_id = v_user_id THEN
        RAISE EXCEPTION 'Invalid staff account.';
    END IF;

    SELECT role::TEXT
    INTO v_current_role
    FROM public.profiles
    WHERE id = p_staff_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff account not found.';
    END IF;

    IF v_current_role = 'owner' THEN
        RAISE EXCEPTION 'Owner account cannot be modified here.';
    END IF;

    IF p_full_name IS NOT NULL
       AND (
           length(trim(p_full_name)) < 2
           OR length(p_full_name) > 100
       ) THEN
        RAISE EXCEPTION 'Invalid staff name.';
    END IF;

    IF p_phone IS NOT NULL AND length(p_phone) > 30 THEN
        RAISE EXCEPTION 'Invalid phone number.';
    END IF;

    IF p_new_role IS NOT NULL
       AND p_new_role NOT IN (
           'manager',
           'ticket_staff',
           'accounts_staff'
       ) THEN
        RAISE EXCEPTION 'Invalid staff role.';
    END IF;

    UPDATE public.profiles
    SET
        full_name = COALESCE(
            trim(p_full_name),
            full_name
        ),
        phone = COALESCE(p_phone, phone),
        role = COALESCE(p_new_role, role),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_staff_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'staff_user_id', p_staff_user_id,
        'updated', TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff(
    UUID, TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_staff(
    UUID, TEXT, TEXT, TEXT, BOOLEAN
) TO authenticated;
