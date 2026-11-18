
-- =====================================================
-- CREATE BOOKING RPC
-- Air Ticket Agency Management
-- Schema-aligned version
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_booking(
    p_customer_id UUID,
    p_agency_id UUID DEFAULT NULL,
    p_booking_date DATE DEFAULT CURRENT_DATE,
    p_travel_date DATE DEFAULT NULL,
    p_origin TEXT DEFAULT NULL,
    p_destination TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_passengers JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_booking_id UUID;
    v_booking_reference TEXT;
    v_passenger JSONB;
    v_passenger_count INTEGER := 0;
    v_customer_exists BOOLEAN;
    v_agency_active BOOLEAN;
    v_passenger_type TEXT;
    v_passenger_name TEXT;
    v_passport_number TEXT;
    v_date_of_birth DATE;
BEGIN

    -- =================================================
    -- 1. AUTHENTICATION
    -- =================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;


    -- =================================================
    -- 2. ACTIVE STAFF AND ROLE VALIDATION
    -- =================================================

    SELECT p.role
    INTO v_role
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN (
        'owner',
        'manager',
        'ticket_staff'
    ) THEN
        RAISE EXCEPTION
            'You do not have permission to create bookings.';
    END IF;


    -- =================================================
    -- 3. INPUT VALIDATION
    -- =================================================

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer is required.';
    END IF;

    IF p_booking_date IS NULL THEN
        RAISE EXCEPTION 'Booking date is required.';
    END IF;

    IF p_travel_date IS NOT NULL
       AND p_travel_date < p_booking_date THEN
        RAISE EXCEPTION
            'Travel date cannot be earlier than booking date.';
    END IF;

    IF COALESCE(TRIM(p_origin), '') = '' THEN
        RAISE EXCEPTION 'Departure location is required.';
    END IF;

    IF COALESCE(TRIM(p_destination), '') = '' THEN
        RAISE EXCEPTION 'Destination is required.';
    END IF;

    IF LENGTH(TRIM(p_origin)) > 150
       OR LENGTH(TRIM(p_destination)) > 150 THEN
        RAISE EXCEPTION
            'Origin and destination cannot exceed 150 characters.';
    END IF;

    IF LOWER(TRIM(p_origin)) = LOWER(TRIM(p_destination)) THEN
        RAISE EXCEPTION
            'Origin and destination cannot be the same.';
    END IF;

    IF COALESCE(p_notes, '') <> ''
       AND LENGTH(p_notes) > 2000 THEN
        RAISE EXCEPTION 'Booking notes are too long.';
    END IF;

    IF p_passengers IS NULL
       OR jsonb_typeof(p_passengers) <> 'array' THEN
        RAISE EXCEPTION 'Passengers must be an array.';
    END IF;

    v_passenger_count := jsonb_array_length(p_passengers);

    IF v_passenger_count < 1
       OR v_passenger_count > 20 THEN
        RAISE EXCEPTION
            'Booking must contain 1 to 20 passengers.';
    END IF;


    -- =================================================
    -- 4. VERIFY CUSTOMER
    -- customers table has NO is_active column.
    -- =================================================

    SELECT TRUE
    INTO v_customer_exists
    FROM public.customers c
    WHERE c.id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found.';
    END IF;


    -- =================================================
    -- 5. VERIFY SOURCE AGENCY
    -- =================================================

    IF p_agency_id IS NOT NULL THEN

        SELECT a.is_active
        INTO v_agency_active
        FROM public.agencies a
        WHERE a.id = p_agency_id
        FOR UPDATE;

        IF NOT FOUND OR v_agency_active IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION
                'Source agency not found or inactive.';
        END IF;

    END IF;


    -- =================================================
    -- 6. VALIDATE PASSENGERS BEFORE INSERT
    -- =================================================

    FOR v_passenger IN
        SELECT value
        FROM jsonb_array_elements(p_passengers)
    LOOP

        v_passenger_name :=
            TRIM(COALESCE(v_passenger->>'full_name', ''));

        IF v_passenger_name = '' THEN
            RAISE EXCEPTION
                'Every passenger must have a full name.';
        END IF;

        IF LENGTH(v_passenger_name) > 150 THEN
            RAISE EXCEPTION
                'Passenger name cannot exceed 150 characters.';
        END IF;

        v_passenger_type :=
            COALESCE(
                NULLIF(v_passenger->>'passenger_type', ''),
                'adult'
            );

        IF v_passenger_type NOT IN (
            'adult',
            'child',
            'infant'
        ) THEN
            RAISE EXCEPTION 'Invalid passenger type.';
        END IF;

        IF COALESCE(v_passenger->>'date_of_birth', '') <> '' THEN

            BEGIN
                v_date_of_birth :=
                    (v_passenger->>'date_of_birth')::DATE;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE EXCEPTION
                        'Invalid passenger date of birth.';
            END;

        END IF;

        IF COALESCE(v_passenger->>'passport_number', '') <> ''
           AND LENGTH(v_passenger->>'passport_number') > 30 THEN
            RAISE EXCEPTION
                'Passport number is too long.';
        END IF;

    END LOOP;


    -- =================================================
    -- 7. GENERATE BOOKING REFERENCE
    -- =================================================

    v_booking_reference :=
        'BKG-' ||
        TO_CHAR(p_booking_date, 'YYYYMMDD') ||
        '-' ||
        UPPER(SUBSTRING(
            REPLACE(gen_random_uuid()::TEXT, '-', '')
            FROM 1 FOR 8
        ));


    -- =================================================
    -- 8. CREATE BOOKING
    -- Correct column: booking_status
    -- =================================================

    INSERT INTO public.bookings (
        booking_reference,
        customer_id,
        agency_id,
        booking_status,
        booking_date,
        travel_date,
        origin,
        destination,
        passenger_count,
        notes,
        created_by
    )
    VALUES (
        v_booking_reference,
        p_customer_id,
        p_agency_id,
        'pending',
        p_booking_date,
        p_travel_date,
        TRIM(p_origin),
        TRIM(p_destination),
        v_passenger_count,
        NULLIF(TRIM(p_notes), ''),
        v_user_id
    )
    RETURNING id INTO v_booking_id;


    -- =================================================
    -- 9. CREATE BOOKING PASSENGERS
    -- Correct column: passenger_name
    -- =================================================

    FOR v_passenger IN
        SELECT value
        FROM jsonb_array_elements(p_passengers)
    LOOP

        v_passenger_name :=
            TRIM(v_passenger->>'full_name');

        v_passport_number :=
            NULLIF(
                TRIM(COALESCE(
                    v_passenger->>'passport_number',
                    ''
                )),
                ''
            );

        v_date_of_birth := NULL;

        IF COALESCE(
            v_passenger->>'date_of_birth',
            ''
        ) <> '' THEN
            v_date_of_birth :=
                (v_passenger->>'date_of_birth')::DATE;
        END IF;

        v_passenger_type :=
            COALESCE(
                NULLIF(v_passenger->>'passenger_type', ''),
                'adult'
            );

        INSERT INTO public.booking_passengers (
            booking_id,
            passenger_name,
            passenger_type,
            passport_number,
            date_of_birth
        )
        VALUES (
            v_booking_id,
            v_passenger_name,
            v_passenger_type,
            v_passport_number,
            v_date_of_birth
        );

    END LOOP;


    -- =================================================
    -- 10. AUDIT LOG
    -- Correct audit_logs schema
    -- =================================================

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        new_data,
        created_at
    )
    VALUES (
        v_user_id,
        'create_booking',
        'bookings',
        v_booking_id,
        jsonb_build_object(
            'booking_reference', v_booking_reference,
            'customer_id', p_customer_id,
            'agency_id', p_agency_id,
            'passenger_count', v_passenger_count,
            'origin', TRIM(p_origin),
            'destination', TRIM(p_destination),
            'booking_status', 'pending'
        ),
        NOW()
    );


    -- =================================================
    -- 11. RETURN RESULT
    -- =================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking_id,
        'booking_reference', v_booking_reference,
        'passenger_count', v_passenger_count,
        'booking_status', 'pending',
        'message', 'Booking created successfully.'
    );

END;
$$;


-- =====================================================
-- 12. FUNCTION PERMISSIONS
-- =====================================================

REVOKE ALL ON FUNCTION public.create_booking(
    UUID,
    UUID,
    DATE,
    DATE,
    TEXT,
    TEXT,
    TEXT,
    JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking(
    UUID,
    UUID,
    DATE,
    DATE,
    TEXT,
    TEXT,
    TEXT,
    JSONB
) TO authenticated;


-- =====================================================
-- END OF CREATE BOOKING RPC
-- =====================================================
