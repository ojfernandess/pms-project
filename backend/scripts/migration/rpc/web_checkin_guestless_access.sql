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
  v_res_guest_email TEXT;
  v_res_client_email TEXT;
  v_ota_email TEXT;
  v_account_email TEXT;
  v_account_doc_digits TEXT;
  v_account_for_stay BOOLEAN := FALSE;
  v_reservation_email_match BOOLEAN := FALSE;
  v_reservation_cpf_match BOOLEAN := FALSE;
BEGIN
  v_locator := upper(trim(COALESCE(p_locator, '')));
  v_identifier := trim(COALESCE(p_identifier, ''));

  IF length(v_locator) < 4 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_locator', 'message', 'Localizador inválido.');
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

  v_res_guest_email := lower(trim(COALESCE(v_guest.email, '')));
  v_res_client_email := lower(trim(COALESCE(v_client.email, '')));
  v_ota_email := '';
  SELECT lower(trim(COALESCE(ota.ota_guest_email, '')))
  INTO v_ota_email
  FROM public.ota_reservations ota
  WHERE ota.reservation_id = v_res.id
  ORDER BY ota.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT gsh.guest_account_id
  INTO v_stay_account
  FROM public.guest_stay_history gsh
  WHERE gsh.reservation_id = v_res.id
  LIMIT 1;

  -- Pré-validação só pelo localizador (painel sem CPF/e-mail ainda)
  IF v_identifier = '' THEN
    IF v_stay_account IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'reservation_requires_login',
        'has_linked_account', true,
        'message', 'Esta reserva está vinculada a uma conta. Faça login para acessar as informações.'
      );
    END IF;
    RETURN jsonb_build_object('success', true, 'code', 'awaiting_identifier', 'has_linked_account', false);
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

  IF NOT p_is_brazilian THEN
    IF v_res_guest_email = v_email OR v_res_client_email = v_email THEN
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

    IF NOT v_reservation_cpf_match THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.web_checkin_guests wcg
        WHERE wcg.web_checkin_id = v_wc.id
          AND normalize_identifier_digits(COALESCE(wcg.cpf, wcg.document_number, '')) = v_digits
      )
      INTO v_reservation_cpf_match;
    END IF;
  END IF;

  IF (p_is_brazilian AND NOT v_reservation_cpf_match) OR (NOT p_is_brazilian AND NOT v_reservation_email_match) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'verification_failed',
      'message', 'Os dados informados não conferem com esta reserva. Verifique o localizador e tente novamente.'
    );
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

  IF v_account_id IS NULL AND p_is_brazilian THEN
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.guest_accounts ga
    WHERE ga.is_active IS DISTINCT FROM FALSE
      AND (
        (v_res_guest_email <> '' AND lower(trim(ga.email)) = v_res_guest_email)
        OR (v_res_client_email <> '' AND lower(trim(ga.email)) = v_res_client_email)
        OR (v_ota_email <> '' AND lower(trim(ga.email)) = v_ota_email)
      )
    ORDER BY ga.created_at DESC
    LIMIT 1;
  END IF;

  -- Mesma estratégia do check-in manual: check-ins completos em web_checkin_guests
  IF v_account_id IS NULL AND p_is_brazilian THEN
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.web_checkin_guests wcg
    JOIN public.web_checkin wc ON wc.id = wcg.web_checkin_id AND wc.status = 'completed'
    JOIN public.guest_accounts ga ON ga.is_active IS DISTINCT FROM FALSE
      AND lower(trim(ga.email)) = lower(trim(COALESCE(wcg.email, '')))
    WHERE normalize_identifier_digits(COALESCE(wcg.cpf, wcg.document_number, '')) = v_digits
      AND trim(COALESCE(wcg.email, '')) <> ''
    ORDER BY wc.completed_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_account_id IS NULL AND p_is_brazilian THEN
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.guest_accounts ga
    WHERE ga.is_active IS DISTINCT FROM FALSE
      AND lower(trim(ga.email)) IN (
        SELECT DISTINCT lower(trim(wcg.email))
        FROM public.web_checkin_guests wcg
        JOIN public.web_checkin wc ON wc.id = wcg.web_checkin_id AND wc.status = 'completed'
        WHERE normalize_identifier_digits(COALESCE(wcg.cpf, wcg.document_number, '')) = v_digits
          AND trim(COALESCE(wcg.email, '')) <> ''
      )
    ORDER BY ga.created_at DESC
    LIMIT 1;
  END IF;

  IF v_account_id IS NULL AND NOT p_is_brazilian THEN
    SELECT ga.id, ga.birth_date
    INTO v_account_id, v_account_birth
    FROM public.web_checkin_guests wcg
    JOIN public.web_checkin wc ON wc.id = wcg.web_checkin_id AND wc.status = 'completed'
    JOIN public.guest_accounts ga ON ga.is_active IS DISTINCT FROM FALSE
      AND lower(trim(ga.email)) = v_email
    WHERE lower(trim(COALESCE(wcg.email, ''))) = v_email
    ORDER BY wc.completed_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_stay_account IS NOT NULL THEN
    IF v_account_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'reservation_requires_login',
        'has_linked_account', true,
        'message', 'Esta reserva está vinculada a uma conta. Faça login para acessar as informações.'
      );
    END IF;

    IF v_account_id <> v_stay_account THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'reservation_linked_other_account',
        'message', 'Esta reserva está vinculada a outra conta. Faça login com a conta correta.'
      );
    END IF;

    v_account_for_stay := TRUE;
  ELSIF v_account_id IS NOT NULL THEN
    SELECT lower(trim(COALESCE(ga.email, ''))),
           normalize_identifier_digits(COALESCE(ga.document_number, ''))
    INTO v_account_email, v_account_doc_digits
    FROM public.guest_accounts ga
    WHERE ga.id = v_account_id;

    IF p_is_brazilian THEN
      IF v_account_doc_digits = v_digits THEN
        v_account_for_stay := TRUE;
      ELSIF v_res_guest_email <> '' AND v_account_email = v_res_guest_email THEN
        v_account_for_stay := TRUE;
      ELSIF v_res_client_email <> '' AND v_account_email = v_res_client_email THEN
        v_account_for_stay := TRUE;
      ELSIF v_ota_email <> '' AND v_account_email = v_ota_email THEN
        v_account_for_stay := TRUE;
      END IF;
    ELSIF v_account_email = v_email THEN
      v_account_for_stay := TRUE;
    END IF;

    IF NOT v_account_for_stay THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'account_exists_use_login',
        'account_matched', true,
        'message', 'Já existe uma conta com estes dados, mas ela não corresponde a esta reserva. Faça login com e-mail e senha.'
      );
    END IF;
  END IF;

  -- Data de nascimento só quando há conta de hóspede a confirmar (sem login)
  IF v_account_id IS NOT NULL AND v_account_for_stay THEN
    IF p_birth_date IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'birth_date_required',
        'account_matched', true,
        'registered_guest', true,
        'message', 'Encontramos um cadastro com estes dados. Informe sua data de nascimento para continuar sem login.'
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

    RETURN jsonb_build_object(
      'success', true,
      'code', 'ok',
      'account_matched', true,
      'registered_guest', true,
      'guest_account_id', v_account_id,
      'reservation_id', v_res.id,
      'web_checkin_id', v_wc.id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'ok',
    'account_matched', false,
    'registered_guest', false,
    'reservation_id', v_res.id,
    'web_checkin_id', v_wc.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_web_checkin_guest_access(TEXT, BOOLEAN, TEXT, DATE) TO anon, authenticated, service_role;