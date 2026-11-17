-- Conclui pré check-in web por token (hóspede anon/guestless; bypass RLS de forma controlada).
CREATE OR REPLACE FUNCTION public.complete_web_checkin_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wc public.web_checkin%ROWTYPE;
  v_reservation_id UUID;
  v_reservation_code TEXT;
  v_main_guest_name TEXT;
  v_establishment_id UUID;
  v_old_status TEXT;
BEGIN
  IF trim(COALESCE(p_token, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_token', 'message', 'Token inválido.');
  END IF;

  SELECT *
  INTO v_wc
  FROM public.web_checkin
  WHERE token = trim(p_token)
  LIMIT 1;

  IF v_wc.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found', 'message', 'Web check-in não encontrado.');
  END IF;

  IF v_wc.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_completed',
      'id', v_wc.id,
      'reservation_id', v_wc.reservation_id,
      'token', v_wc.token,
      'locator', v_wc.locator,
      'establishment_id', v_wc.establishment_id,
      'completed_at', v_wc.completed_at
    );
  END IF;

  IF v_wc.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'Link de check-in expirado.');
  END IF;

  v_reservation_id := v_wc.reservation_id;
  v_establishment_id := v_wc.establishment_id;

  UPDATE public.web_checkin
  SET
    status = 'completed',
    completed_at = COALESCE(v_wc.completed_at, NOW()),
    updated_at = NOW()
  WHERE id = v_wc.id
  RETURNING * INTO v_wc;

  IF v_reservation_id IS NOT NULL THEN
    SELECT r.status::text, r.reservation_code, r.establishment_id
    INTO v_old_status, v_reservation_code, v_establishment_id
    FROM public.reservations r
    WHERE r.id = v_reservation_id;

    IF v_establishment_id IS NULL THEN
      v_establishment_id := v_wc.establishment_id;
    END IF;

    UPDATE public.reservations
    SET status = 'confirmed', updated_at = NOW()
    WHERE id = v_reservation_id
      AND status::text IN ('pending', 'preregistration');
  END IF;

  SELECT wcg.name
  INTO v_main_guest_name
  FROM public.web_checkin_guests wcg
  WHERE wcg.web_checkin_id = v_wc.id
    AND COALESCE(wcg.is_main_guest, false) = true
  ORDER BY wcg."order" NULLS LAST
  LIMIT 1;

  IF v_main_guest_name IS NULL THEN
    SELECT wcg.name
    INTO v_main_guest_name
    FROM public.web_checkin_guests wcg
    WHERE wcg.web_checkin_id = v_wc.id
    ORDER BY wcg."order" NULLS LAST
    LIMIT 1;
  END IF;

  IF v_establishment_id IS NOT NULL AND v_reservation_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_activity(
        v_establishment_id,
        NULL,
        'checked_in',
        'reservation',
        'Check-in web concluído' || CASE WHEN v_reservation_code IS NOT NULL THEN ' para reserva ' || v_reservation_code ELSE '' END
          || ' - Realizado pelo hóspede: ' || COALESCE(v_main_guest_name, 'Hóspede'),
        v_reservation_id,
        v_reservation_code,
        jsonb_build_object('status', COALESCE(v_old_status, 'pending')),
        jsonb_build_object(
          'status', 'confirmed',
          'checkin_method', 'web',
          'web_checkin_id', v_wc.id,
          'completed_at', v_wc.completed_at,
          'performed_by', COALESCE(v_main_guest_name, 'Hóspede'),
          'performed_by_type', 'guest'
        ),
        jsonb_build_object(
          'web_checkin_id', v_wc.id,
          'locator', v_wc.locator,
          'ip_address', v_wc.ip_address,
          'user_agent', v_wc.user_agent,
          'guest_name', COALESCE(v_main_guest_name, 'Hóspede'),
          'performed_by', 'guest'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'ok',
    'id', v_wc.id,
    'reservation_id', v_reservation_id,
    'token', v_wc.token,
    'locator', v_wc.locator,
    'establishment_id', v_establishment_id,
    'completed_at', v_wc.completed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_web_checkin_by_token(TEXT) TO anon, authenticated, service_role;