
CREATE OR REPLACE FUNCTION public.update_booking(
    p_booking_id UUID,
    p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_booking RECORD;
    v_agency_id UUID;
    v_origin TEXT;
    v_destination TEXT;
    v_travel_date DATE;
    v_notes TEXT;
    v_updated_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Authentication
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Role and account verification
    SELECT p.role::TEXT
    INTO v_role
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN (
        'owner',
        'manager',
        'ticket_staff'
    ) THEN
        RAISE EXCEPTION 'You are not authorized to update bookings.';
    END IF;

    -- Validate input
    IF p_booking_id IS NULL
       OR p_updates IS NULL
       OR jsonb_typeof(p_updates) <> 'object'
       OR p_updates = '{}'::JSONB THEN
        RAISE EXCEPTION 'Invalid booking update data.';
    END IF;

    -- Only allow approved fields
    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_updates) AS k
        WHERE k NOT IN (
            'travel_date',
            'origin',
            'destination',
            'agency_id',
            'notes'
        )
    ) THEN
        RAISE EXCEPTION 'One or more fields are not allowed.';
    END IF;

    -- Lock booking row
    SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found.';
    END IF;

    -- Issued or cancelled bookings cannot be edited
    IF lower(v_booking.status::TEXT) IN (
        'issued',
        'ticket_issued',
        'converted',
        'cancelled',
        'refunded'
    ) THEN
        RAISE EXCEPTION 'This booking can no longer be edited.';
    END IF;

    -- Validate and prepare travel date
    IF p_updates ? 'travel_date' THEN
        IF p_updates->>'travel_date' IS NULL
           OR p_updates->>'travel_date' = '' THEN
            v_travel_date := NULL;
        ELSE
            BEGIN
                v_travel_date := (p_updates->>'travel_date')::DATE;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid travel date.';
            END;
        END IF;

        v_updated_fields := array_append(v_updated_fields, 'travel_date');
    ELSE
        v_travel_date := v_booking.travel_date;
    END IF;

    -- Validate origin
    IF p_updates ? 'origin' THEN
        v_origin := NULLIF(trim(p_updates->>'origin'), '');

        IF v_origin IS NULL OR length(v_origin) > 150 THEN
            RAISE EXCEPTION 'Invalid origin.';
        END IF;

        v_updated_fields := array_append(v_updated_fields, 'origin');
    ELSE
        v_origin := v_booking.origin;
    END IF;

    -- Validate destination
    IF p_updates ? 'destination' THEN
        v_destination := NULLIF(trim(p_updates->>'destination'), '');

        IF v_destination IS NULL OR length(v_destination) > 150 THEN
            RAISE EXCEPTION 'Invalid destination.';
        END IF;

        v_updated_fields := array_append(v_updated_fields, 'destination');
    ELSE
        v_destination := v_booking.destination;
    END IF;

    -- Validate agency
    IF p_updates ? 'agency_id' THEN
        IF p_updates->'agency_id' = 'null'::JSONB THEN
            v_agency_id := NULL;
        ELSE
            BEGIN
                v_agency_id := (p_updates->>'agency_id')::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid agency ID.';
            END;

            IF NOT EXISTS (
                SELECT 1
                FROM public.agencies a
                WHERE a.id = v_agency_id
                  AND a.is_active = TRUE
            ) THEN
                RAISE EXCEPTION 'Selected agency is not active or does not exist.';
            END IF;
        END IF;

        v_updated_fields := array_append(v_updated_fields, 'agency_id');
    ELSE
        v_agency_id := v_booking.agency_id;
    END IF;

    -- Validate notes
    IF p_updates ? 'notes' THEN
        IF p_updates->'notes' = 'null'::JSONB THEN
            v_notes := NULL;
        ELSE
            v_notes := p_updates->>'notes';

            IF length(v_notes) > 2000 THEN
                RAISE EXCEPTION 'Notes cannot exceed 2000 characters.';
            END IF;
        END IF;

        v_updated_fields := array_append(v_updated_fields, 'notes');
    ELSE
        v_notes := v_booking.notes;
    END IF;

    -- Update booking
    UPDATE public.bookings
    SET
        travel_date = v_travel_date,
        origin = v_origin,
        destination = v_destination,
        agency_id = v_agency_id,
        notes = v_notes,
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        created_at
    )
    VALUES (
        v_user_id,
        'booking_updated',
        'booking',
        p_booking_id,
        jsonb_build_object(
            'updated_fields', to_jsonb(v_updated_fields)
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'updated_fields', to_jsonb(v_updated_fields)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking(UUID, JSONB)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_booking(UUID, JSONB)
TO authenticated;
