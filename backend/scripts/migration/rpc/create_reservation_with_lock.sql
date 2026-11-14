-- Origem: supabase/migrations/20251219000003_fix_reservation_conflict_check.sql
-- Requer tabelas reservations, rooms e enums payment_status / reservation_status.

CREATE OR REPLACE FUNCTION public.create_reservation_with_lock(
  p_reservation_data JSONB,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_establishment_id UUID,
  p_room_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_room_id UUID;
  v_category_id UUID;
  v_available_rooms INTEGER;
  v_room_is_blocked BOOLEAN;
  v_room_status TEXT;
  v_conflict_count INTEGER;
  v_client_id UUID;
BEGIN
  IF p_checkin_date >= p_checkout_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Data de check-in deve ser anterior à data de check-out'
    );
  END IF;

  IF p_reservation_data->>'client_id' IS NOT NULL THEN
    v_client_id := (p_reservation_data->>'client_id')::UUID;
  END IF;

  IF p_category_id IS NOT NULL THEN
    v_category_id := p_category_id;
  ELSIF p_reservation_data->>'category_id' IS NOT NULL THEN
    v_category_id := (p_reservation_data->>'category_id')::UUID;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'category_id é obrigatório'
    );
  END IF;

  IF p_room_id IS NOT NULL THEN
    v_room_id := p_room_id;

    SELECT is_blocked, status INTO v_room_is_blocked, v_room_status
    FROM public.rooms
    WHERE id = v_room_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto não encontrado'
      );
    END IF;

    IF COALESCE(v_room_is_blocked, FALSE) = TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está interditado - não é possível criar reservas'
      );
    END IF;

    IF v_room_status = 'maintenance' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está em manutenção - não é possível criar reservas'
      );
    END IF;

    BEGIN
      PERFORM 1
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        AND (
          v_client_id IS NULL
          OR client_id IS NULL
          OR client_id != v_client_id
          OR checkin_date != p_checkin_date
          OR checkout_date != p_checkout_date
          OR created_at <= NOW() - INTERVAL '60 seconds'
        )
      FOR UPDATE NOWAIT;

      SELECT COUNT(*) INTO v_conflict_count
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        AND (
          v_client_id IS NULL
          OR client_id IS NULL
          OR client_id != v_client_id
          OR checkin_date != p_checkin_date
          OR checkout_date != p_checkout_date
          OR created_at <= NOW() - INTERVAL '60 seconds'
        );

      IF v_conflict_count > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Quarto não está disponível no período solicitado',
          'conflict_count', v_conflict_count
        );
      END IF;
    EXCEPTION
      WHEN lock_not_available THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Sistema ocupado. Por favor, tente novamente em alguns instantes.',
          'retry_after', 1
        );
    END;

    v_available_rooms := 1;
  ELSE
    SELECT COUNT(*) INTO v_available_rooms
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.establishment_id = p_establishment_id
      AND (r.is_blocked IS NULL OR r.is_blocked = FALSE)
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
          AND (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          AND (
            v_client_id IS NULL
            OR res.client_id IS NULL
            OR res.client_id != v_client_id
            OR res.checkin_date != p_checkin_date
            OR res.checkout_date != p_checkout_date
            OR res.created_at <= NOW() - INTERVAL '60 seconds'
          )
      );

    IF v_available_rooms = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Nenhum quarto disponível nesta categoria no período solicitado',
        'available_rooms', 0
      );
    END IF;

    SELECT id INTO v_room_id
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.establishment_id = p_establishment_id
      AND (r.is_blocked IS NULL OR r.is_blocked = FALSE)
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
          AND (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          AND (
            v_client_id IS NULL
            OR res.client_id IS NULL
            OR res.client_id != v_client_id
            OR res.checkin_date != p_checkin_date
            OR res.checkout_date != p_checkout_date
            OR res.created_at <= NOW() - INTERVAL '60 seconds'
          )
      )
    LIMIT 1;
  END IF;

  INSERT INTO public.reservations (
    reservation_code,
    establishment_id,
    room_id,
    category_id,
    checkin_date,
    checkout_date,
    client_id,
    guest_id,
    guest_name,
    adults,
    children,
    total_amount,
    paid_amount,
    payment_status,
    status,
    notes,
    checkin_time,
    checkout_time,
    pricing_plan_id,
    created_by,
    expiration_date,
    channel,
    coupon_id
  )
  VALUES (
    COALESCE(
      NULLIF(trim(p_reservation_data->>'reservation_code'), ''),
      public.generate_reservation_code()
    ),
    p_establishment_id,
    v_room_id,
    v_category_id,
    p_checkin_date,
    p_checkout_date,
    COALESCE((p_reservation_data->>'client_id')::UUID, NULL),
    COALESCE((p_reservation_data->>'guest_id')::UUID, NULL),
    p_reservation_data->>'guest_name',
    COALESCE((p_reservation_data->>'adults')::INTEGER, 1),
    COALESCE((p_reservation_data->>'children')::INTEGER, 0),
    COALESCE((p_reservation_data->>'total_amount')::NUMERIC, 0),
    COALESCE((p_reservation_data->>'paid_amount')::NUMERIC, 0),
    CASE
      WHEN p_reservation_data->>'payment_status' IS NOT NULL
      THEN (p_reservation_data->>'payment_status')::payment_status
      ELSE 'pending'::payment_status
    END,
    CASE
      WHEN p_reservation_data->>'status' IS NOT NULL
      THEN (p_reservation_data->>'status')::reservation_status
      ELSE 'pending'::reservation_status
    END,
    p_reservation_data->>'notes',
    COALESCE((p_reservation_data->>'checkin_time')::TIME, NULL),
    COALESCE((p_reservation_data->>'checkout_time')::TIME, NULL),
    COALESCE((p_reservation_data->>'pricing_plan_id')::UUID, NULL),
    COALESCE((p_reservation_data->>'created_by')::UUID, NULL),
    COALESCE((p_reservation_data->>'expiration_date')::DATE, NULL),
    COALESCE(p_reservation_data->>'channel', 'direct'),
    COALESCE((p_reservation_data->>'coupon_id')::UUID, NULL)
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'room_id', v_room_id,
    'category_id', v_category_id
  );
END;
$$;

COMMENT ON FUNCTION public.create_reservation_with_lock(JSONB, DATE, DATE, UUID, UUID, UUID) IS
  'Cria reserva com verificação de conflitos e lock (bundled cutover).';

GRANT EXECUTE ON FUNCTION public.create_reservation_with_lock(JSONB, DATE, DATE, UUID, UUID, UUID) TO authenticated, service_role;