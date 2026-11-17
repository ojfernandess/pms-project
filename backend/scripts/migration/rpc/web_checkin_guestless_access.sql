-- Acesso ao web check-in sem conta (valida localizador + e-mail/CPF; confirma nascimento se houver conta)
CREATE OR REPLACE FUNCTION public.normalize_identifier_digits(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_text, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.verify_web_checkin_guest_access(
  p_locator TEXT,
  p_is_brazilian BOOLEAN,
  p_identifier TEXT,
  p_birth_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locator TEXT;
  v_identifier TEXT;
  v_digits TEXT;
  v_wc RECORD;
  v_res RECORD;
  v_guest RECORD;
  v_client RECORD;
  v_account_id UUID;
  v_account_birth DATE;
  v_stay_account UUID;
  v_email TEXT;
  v_reservation_email_match BOOLEAN := FALSE;
  v_reservation_cpf_match BOOLEAN := FALSE;
BEGIN
  v_locator := upper(trim(COALESCE(p_locator, '')));
  v_identifier := trim(COALESCE(p_identifier, ''));

  IF length(v_locator) < 4 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_locator', 'message', 'Localizador inválido.');
  END IF;

  IF p_is_brazilian THEN
    v_digits := normalize_identifier_digits(v_identifier);
    IF length(v_digits) <> 11 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_cpf', 'message', 'Informe um CPF válido (11 dígitos).');
    END IF;
  ELSE
    v_email := lower(v_identifier);
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_email', 'message', 'Informe um e-mail válido.');
    END IF;
  END IF;

  SELECT wc.id, wc.reservation_id, wc.status, wc.expires_at
  INTO v_wc
  FROM public.web_checkin wc
  WHERE upper(trim(wc.locator)) = v_locator
  LIMIT 1;

  IF v_wc.id IS NULL THEN
    SELECT wc.id, wc.reservation_id, wc.status, wc.expires_at
    INTO v_wc
    FROM public.reservations r
    JOIN public.web_checkin wc ON wc.reservation_id = r.id
    WHERE upper(trim(r.reservation_code)) = v_locator
    LIMIT 1;
  END IF;

  IF v_wc.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'locator_not_found', 'message', 'Localizador não encontrado.');
  END IF;

  SELECT r.id, r.guest_id, r.client_id, r.checkin_date, r.checkout_date, r.status
  INTO v_res
  FROM public.reservations r
  WHERE r.id = v_wc.reservation_id;

  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'reservation_not_found', 'message', 'Reserva não encontrada.');
  END IF;

  IF lower(COALESCE(v_res.status::text, '')) IN ('cancelled', 'canceled', 'no_show', 'no-show') THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'O prazo deste check-in online expirou.');
  END IF;

  IF v_wc.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'O prazo deste check-in online expirou.');
  END IF;

  -- Alinhado ao fluxo autenticado: não bloquear só porque expires_at foi gravado na meia-noite do check-in.
  IF v_res.checkout_date IS NOT NULL AND CURRENT_DATE > (v_res.checkout_date::date + 1) THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'O prazo deste check-in online expirou.');
  ELSIF v_res.checkout_date IS NULL AND v_res.checkin_date IS NOT NULL
        AND CURRENT_DATE > (v_res.checkin_date::date + 31) THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'O prazo deste check-in online expirou.');
  ELSIF v_wc.expires_at IS NOT NULL
        AND v_wc.expires_at < NOW()
        AND v_res.checkout_date IS NULL
        AND v_res.checkin_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'O prazo deste check-in online expirou.');
  END IF;

  IF v_res.guest_id IS NOT NULL THEN
    SELECT c.email, c.document_number
    INTO v_guest
    FROM public.clients c
    WHERE c.id = v_res.guest_id;
  END IF;

  IF v_res.client_id IS NOT NULL THEN
    SELECT c.email, c.document_number
    INTO v_client
    FROM public.clients c
    WHERE c.id = v_res.client_id;
  END IF;

  IF NOT p_is_brazilian THEN
    IF lower(COALESCE(v_guest.email, '')) = v_email
       OR lower(COALESCE(v_client.email, '')) = v_email THEN
      v_reservation_email_match := TRUE;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.ota_reservations ota
        WHERE ota.reservation_id = v_res.id
          AND lower(trim(COALESCE(ota.ota_guest_email, ''))) = v_email
      )
      INTO v_reservation_email_match;
    END IF;
  ELSE
    IF normalize_identifier_digits(COALESCE(v_guest.document_number, '')) = v_digits
       OR normalize_identifier_digits(COALESCE(v_client.document_number, '')) = v_digits THEN
      v_reservation_cpf_match := TRUE;
    END IF;
  END IF;

  v_account_id := NULL;
  v_account_birth := NULL;

  IF p_is_brazilian THEN
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.guest_accounts ga
    WHERE ga.is_active IS DISTINCT FROM FALSE
      AND normalize_identifier_digits(COALESCE(ga.document_number, '')) = v_digits
    LIMIT 1;
  ELSE
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.guest_accounts ga
    WHERE ga.is_active IS DISTINCT FROM FALSE
      AND lower(trim(ga.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_account_id IS NOT NULL THEN
    IF p_birth_date IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'birth_date_required',
        'account_matched', true,
        'message', 'Encontramos um cadastro com estes dados. Informe sua data de nascimento para continuar.'
      );
    END IF;

    IF v_account_birth IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'birth_date_missing_on_account',
        'message', 'Não foi possível validar sua identidade. Faça login com e-mail e senha ou entre em contato com o hotel.'
      );
    END IF;

    IF v_account_birth <> p_birth_date THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'birth_date_mismatch',
        'message', 'Data de nascimento não confere com o cadastro encontrado.'
      );
    END IF;

    SELECT gsh.guest_account_id
    INTO v_stay_account
    FROM public.guest_stay_history gsh
    WHERE gsh.reservation_id = v_res.id
    LIMIT 1;

    IF v_stay_account IS NOT NULL AND v_stay_account <> v_account_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'reservation_linked_other_account',
        'message', 'Esta reserva está vinculada a outra conta. Faça login com a conta correta.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'ok',
      'account_matched', true,
      'reservation_id', v_res.id,
      'web_checkin_id', v_wc.id
    );
  END IF;

  IF (p_is_brazilian AND NOT v_reservation_cpf_match) OR (NOT p_is_brazilian AND NOT v_reservation_email_match) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'verification_failed',
      'message', 'Os dados informados não conferem com esta reserva. Verifique o localizador e tente novamente.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'ok',
    'account_matched', false,
    'reservation_id', v_res.id,
    'web_checkin_id', v_wc.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_web_checkin_guest_access(TEXT, BOOLEAN, TEXT, DATE) TO anon, authenticated, service_role;