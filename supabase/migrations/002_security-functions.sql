
-- =========================================================
-- AIR TICKET AGENCY MANAGEMENT
-- SECURITY HELPER FUNCTIONS
-- Updated with Secure Audit Log RPC
-- =========================================================


-- =========================================================
-- 1. GET CURRENT USER ROLE
-- =========================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.role::text
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
    LIMIT 1;
$$;


-- =========================================================
-- 2. CHECK OWNER ROLE
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'owner'
          AND p.is_active = true
    );
$$;


-- =========================================================
-- 3. CHECK OWNER OR MANAGER
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text IN ('owner', 'manager')
          AND p.is_active = true
    );
$$;


-- =========================================================
-- 4. CHECK ACCOUNTS STAFF
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_accounts_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'accounts_staff'
          AND p.is_active = true
    );
$$;


-- =========================================================
-- 5. CHECK TICKET STAFF
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_ticket_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'ticket_staff'
          AND p.is_active = true
    );
$$;


-- =========================================================
-- 6. CHECK STAFF PERMISSION
-- =========================================================

CREATE OR REPLACE FUNCTION public.has_staff_permission(
    requested_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        public.is_owner()
        OR EXISTS (
            SELECT 1
            FROM public.staff_permissions sp
            WHERE sp.user_id = (SELECT auth.uid())
              AND sp.permission_key = requested_permission
              AND sp.is_allowed = true
        );
$$;


-- =========================================================
-- 7. SECURE AUDIT LOG SEARCH
--
-- Only active Owner / Manager.
-- Returns user name without granting direct access
-- to other staff profiles.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_audit_logs(
    p_search text DEFAULT NULL,
    p_module text DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 15
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    user_name text,
    action text,
    table_name text,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_page integer;
    v_page_size integer;
    v_search text;
    v_action text;
BEGIN

    -- -----------------------------------------------------
    -- AUTHENTICATION
    -- -----------------------------------------------------

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT p.role::text
    INTO v_role
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true;

    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;


    -- -----------------------------------------------------
    -- INPUT VALIDATION
    -- -----------------------------------------------------

    v_page := GREATEST(COALESCE(p_page, 1), 1);

    v_page_size := LEAST(
        GREATEST(COALESCE(p_page_size, 15), 1),
        100
    );

    v_search := NULLIF(trim(p_search), '');

    v_action := NULLIF(trim(p_action), '');

    IF v_search IS NOT NULL AND length(v_search) > 150 THEN
        RAISE EXCEPTION 'Search text is too long.';
    END IF;

    IF p_module IS NOT NULL
       AND length(p_module) > 100 THEN
        RAISE EXCEPTION 'Invalid module filter.';
    END IF;

    IF p_date_from IS NOT NULL
       AND p_date_to IS NOT NULL
       AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Invalid date range.';
    END IF;


    -- -----------------------------------------------------
    -- QUERY
    -- -----------------------------------------------------

    RETURN QUERY

    WITH filtered AS (
        SELECT
            al.id,
            al.user_id,
            COALESCE(
                NULLIF(trim(p.full_name), ''),
                NULLIF(trim(p.email), ''),
                CASE
                    WHEN al.user_id IS NULL THEN 'System'
                    ELSE 'Unknown User'
                END
            )::text AS resolved_user_name,
            al.action,
            al.table_name,
            al.record_id,
            al.old_data,
            al.new_data,
            al.ip_address,
            al.user_agent,
            al.created_at

        FROM public.audit_logs al

        LEFT JOIN public.profiles p
            ON p.id = al.user_id

        WHERE
            (
                p_module IS NULL
                OR al.table_name = p_module
            )

            AND (
                p_date_from IS NULL
                OR al.created_at >=
                    (p_date_from::timestamp AT TIME ZONE 'Asia/Dhaka')
            )

            AND (
                p_date_to IS NULL
                OR al.created_at <
                    ((p_date_to + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
            )

            AND (
                v_search IS NULL
                OR al.action ILIKE '%' || v_search || '%'
                OR al.table_name ILIKE '%' || v_search || '%'
                OR al.record_id::text ILIKE '%' || v_search || '%'
                OR p.full_name ILIKE '%' || v_search || '%'
                OR p.email ILIKE '%' || v_search || '%'
            )

            AND (
                v_action IS NULL
                OR CASE v_action

                    WHEN 'create' THEN
                        al.action ILIKE '%create%'
                        OR al.action ILIKE '%insert%'
                        OR al.action ILIKE '%added%'

                    WHEN 'update' THEN
                        al.action ILIKE '%update%'
                        OR al.action ILIKE '%edit%'
                        OR al.action ILIKE '%changed%'

                    WHEN 'delete' THEN
                        al.action ILIKE '%delete%'
                        OR al.action ILIKE '%remove%'

                    WHEN 'payment' THEN
                        al.action ILIKE '%payment%'
                        OR al.action ILIKE '%paid%'

                    WHEN 'refund' THEN
                        al.action ILIKE '%refund%'

                    WHEN 'cancel' THEN
                        al.action ILIKE '%cancel%'

                    WHEN 'login' THEN
                        al.action ILIKE '%login%'

                    WHEN 'logout' THEN
                        al.action ILIKE '%logout%'

                    ELSE
                        al.action ILIKE '%' || v_action || '%'

                END
            )
    ),

    counted AS (
        SELECT
            filtered.*,
            COUNT(*) OVER () AS record_count
        FROM filtered
    )

    SELECT
        counted.id,
        counted.user_id,
        counted.resolved_user_name,
        counted.action,
        counted.table_name,
        counted.record_id,
        counted.old_data,
        counted.new_data,
        counted.ip_address,
        counted.user_agent,
        counted.created_at,
        counted.record_count

    FROM counted

    ORDER BY counted.created_at DESC

    LIMIT v_page_size

    OFFSET ((v_page - 1) * v_page_size);

END;
$$;


-- =========================================================
-- 8. FUNCTION ACCESS CONTROL
-- =========================================================

REVOKE ALL ON FUNCTION public.current_user_role()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_owner()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_owner_or_manager()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_accounts_staff()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_ticket_staff()
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.has_staff_permission(text)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_audit_logs(
    text,
    text,
    text,
    date,
    date,
    integer,
    integer
)
FROM PUBLIC, anon;


GRANT EXECUTE ON FUNCTION public.current_user_role()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_owner()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_owner_or_manager()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_accounts_staff()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_ticket_staff()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_staff_permission(text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_audit_logs(
    text,
    text,
    text,
    date,
    date,
    integer,
    integer
)
TO authenticated;


-- =========================================================
-- END OF SECURITY FUNCTIONS
-- =========================================================
