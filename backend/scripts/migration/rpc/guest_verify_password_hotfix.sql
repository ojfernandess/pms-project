-- Recria verify_guest_password quando a versão antiga chamava crypt() em public (42883).
CREATE OR REPLACE FUNCTION public.verify_guest_password(
  p_account_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_password_hash TEXT;
  v_locked_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
  v_is_active BOOLEAN;
BEGIN
  SELECT ga.password_hash, ga.locked_until, ga.failed_login_attempts, COALESCE(ga.is_active, true)
  INTO v_password_hash, v_locked_until, v_failed_attempts, v_is_active
  FROM public.guest_accounts ga
  WHERE ga.id = p_account_id;

  IF v_password_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_is_active = false THEN
    RAISE EXCEPTION 'Esta conta foi excluída. Entre em contato com o suporte para mais informações.';
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'Conta temporariamente bloqueada. Tente novamente mais tarde.';
  END IF;

  IF extensions.crypt(p_password, v_password_hash) = v_password_hash THEN
    UPDATE public.guest_accounts
    SET
      failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = NOW(),
      updated_at = NOW()
    WHERE id = p_account_id;

    RETURN TRUE;
  ELSE
    v_failed_attempts := COALESCE(v_failed_attempts, 0) + 1;

    IF v_failed_attempts >= 5 THEN
      UPDATE public.guest_accounts
      SET
        failed_login_attempts = v_failed_attempts,
        locked_until = NOW() + INTERVAL '30 minutes',
        updated_at = NOW()
      WHERE id = p_account_id;
    ELSE
      UPDATE public.guest_accounts
      SET
        failed_login_attempts = v_failed_attempts,
        updated_at = NOW()
      WHERE id = p_account_id;
    END IF;

    RETURN FALSE;
  END IF;
END;
$$;