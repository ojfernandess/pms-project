-- Web Check-in: reset de senha do hóspede (pgcrypto em extensions)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$ext$;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

ALTER TABLE public.guest_accounts
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_guest_accounts_reset_token
  ON public.guest_accounts(reset_token)
  WHERE reset_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_guest_password_reset(p_email TEXT)
RETURNS TABLE (
  success BOOLEAN,
  reset_token TEXT,
  email TEXT,
  full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_id UUID;
  v_reset_token TEXT;
  v_reset_token_expires TIMESTAMPTZ;
  v_full_name TEXT;
BEGIN
  SELECT ga.id, ga.full_name
  INTO v_account_id, v_full_name
  FROM public.guest_accounts ga
  WHERE ga.email = LOWER(p_email)
    AND ga.is_active IS DISTINCT FROM FALSE;

  IF v_account_id IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_reset_token := gen_random_uuid()::TEXT;
  v_reset_token_expires := NOW() + INTERVAL '1 hour';

  UPDATE public.guest_accounts ga
  SET
    reset_token = v_reset_token,
    reset_token_expires_at = v_reset_token_expires,
    updated_at = NOW()
  WHERE ga.id = v_account_id;

  RETURN QUERY SELECT TRUE, v_reset_token, LOWER(p_email), v_full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_guest_password(
  p_reset_token TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_id UUID;
  v_password_hash TEXT;
BEGIN
  IF p_new_password IS NULL OR char_length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'A senha deve ter pelo menos 8 caracteres';
  END IF;

  SELECT ga.id
  INTO v_account_id
  FROM public.guest_accounts ga
  WHERE ga.reset_token = p_reset_token
    AND ga.reset_token_expires_at > NOW()
    AND ga.is_active IS DISTINCT FROM FALSE;

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_password_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

  UPDATE public.guest_accounts ga
  SET
    password_hash = v_password_hash,
    reset_token = NULL,
    reset_token_expires_at = NULL,
    failed_login_attempts = 0,
    locked_until = NULL,
    updated_at = NOW()
  WHERE ga.id = v_account_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.request_guest_password_reset(TEXT) IS
  'Solicita reset de senha para conta de hóspede. Retorna token para envio de email.';
COMMENT ON FUNCTION public.reset_guest_password(TEXT, TEXT) IS
  'Reseta senha de conta de hóspede usando token válido.';

GRANT EXECUTE ON FUNCTION public.request_guest_password_reset(TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_guest_password(TEXT, TEXT)
  TO anon, authenticated, service_role;
