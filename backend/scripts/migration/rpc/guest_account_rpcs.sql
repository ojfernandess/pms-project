-- Web Check-in: contas de hóspede (pgcrypto + RPCs públicas para anon)
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
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_guest_accounts_is_active ON public.guest_accounts(is_active)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.create_guest_account(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_document_number TEXT DEFAULT NULL,
  p_birth_date DATE DEFAULT NULL,
  p_verification_token TEXT DEFAULT NULL,
  p_verification_token_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  document_type TEXT,
  document_number TEXT,
  birth_date DATE,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_password_hash TEXT;
  v_account_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.email = LOWER(p_email)) THEN
    RAISE EXCEPTION 'Este email já está cadastrado';
  END IF;

  v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  INSERT INTO public.guest_accounts (
    email,
    password_hash,
    full_name,
    phone,
    document_type,
    document_number,
    birth_date,
    verification_token,
    verification_token_expires_at
  )
  VALUES (
    LOWER(p_email),
    v_password_hash,
    p_full_name,
    p_phone,
    p_document_type,
    p_document_number,
    p_birth_date,
    p_verification_token,
    p_verification_token_expires_at
  )
  RETURNING guest_accounts.id INTO v_account_id;

  RETURN QUERY
  SELECT
    ga.id,
    ga.email,
    ga.full_name,
    ga.phone,
    ga.document_type,
    ga.document_number,
    ga.birth_date,
    ga.is_verified,
    ga.created_at,
    ga.updated_at
  FROM public.guest_accounts ga
  WHERE ga.id = v_account_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.update_guest_password(
  p_account_id UUID,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_password_hash TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = p_account_id) THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;

  v_password_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

  UPDATE public.guest_accounts ga
  SET
    password_hash = v_password_hash,
    updated_at = NOW()
  WHERE ga.id = p_account_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_guest_account(
  p_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_exists BOOLEAN;
  v_generic_email TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.guest_accounts WHERE id = p_account_id)
  INTO v_account_exists;

  IF NOT v_account_exists THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;

  v_generic_email := 'deleted_' || p_account_id::TEXT || '@deleted.local';

  UPDATE public.guest_accounts
  SET
    is_active = false,
    email = v_generic_email,
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_guest_account(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TIMESTAMPTZ
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_guest_password(UUID, TEXT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_guest_password(UUID, TEXT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.deactivate_guest_account(UUID) TO anon, authenticated, service_role;