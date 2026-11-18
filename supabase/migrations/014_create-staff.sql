
-- Staff Management Security
-- DRAFT: Review existing profiles policies before execution.

-- Prevent non-owner users from changing their own role.
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF NOT public.is_owner() THEN
            RAISE EXCEPTION
                'Only the Owner can change staff roles.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
public.prevent_unauthorized_role_change()
FROM PUBLIC;

CREATE TRIGGER protect_profile_role_changes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unauthorized_role_change();


-- Owner-only staff role management RPC.
CREATE OR REPLACE FUNCTION public.update_staff_role(
    p_staff_user_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_target_role TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_owner() THEN
        RAISE EXCEPTION 'Only the Owner can manage staff roles.';
    END IF;

    IF p_staff_user_id IS NULL
       OR p_staff_user_id = v_user_id THEN
        RAISE EXCEPTION 'Invalid staff account.';
    END IF;

    IF p_new_role NOT IN (
        'manager',
        'ticket_staff',
        'accounts_staff'
    ) THEN
        RAISE EXCEPTION 'Invalid staff role.';
    END IF;

    SELECT role::TEXT
    INTO v_target_role
    FROM public.profiles
    WHERE id = p_staff_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff account not found.';
    END IF;

    IF v_target_role = 'owner' THEN
        RAISE EXCEPTION 'Owner role cannot be changed here.';
    END IF;

    UPDATE public.profiles
    SET
        role = p_new_role,
        updated_at = now()
    WHERE id = p_staff_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'staff_user_id', p_staff_user_id,
        'new_role', p_new_role
    );
END;
$$;

REVOKE ALL ON FUNCTION
public.update_staff_role(UUID, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.update_staff_role(UUID, TEXT)
TO authenticated;
