-- Garantir que a extensão pgcrypto está habilitada
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função para criar conta de hóspede (faz hash da senha no backend)
CREATE OR REPLACE FUNCTION create_guest_account(
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
AS $$
DECLARE
  v_password_hash TEXT;
  v_account_id UUID;
BEGIN
  -- Verificar se email já existe
  IF EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.email = LOWER(p_email)) THEN
    RAISE EXCEPTION 'Este email já está cadastrado';
  END IF;

  -- Hash da senha usando pgcrypto
  v_password_hash := crypt(p_password, gen_salt('bf', 10));

  -- Inserir conta
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

  -- Retornar dados da conta (sem password_hash)
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

-- Função para verificar senha de hóspede
CREATE OR REPLACE FUNCTION verify_guest_password(
  p_account_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_password_hash TEXT;
  v_locked_until TIMESTAMPTZ;
  v_failed_attempts INTEGER;
BEGIN
  -- Buscar hash da senha e status da conta
  SELECT ga.password_hash, ga.locked_until, ga.failed_login_attempts
  INTO v_password_hash, v_locked_until, v_failed_attempts
  FROM public.guest_accounts ga
  WHERE ga.id = p_account_id;

  -- Se conta não encontrada
  IF v_password_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verificar se conta está bloqueada
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'Conta temporariamente bloqueada. Tente novamente mais tarde.';
  END IF;

  -- Verificar senha usando pgcrypto
  IF crypt(p_password, v_password_hash) = v_password_hash THEN
    -- Senha correta - resetar tentativas e atualizar último login
    UPDATE public.guest_accounts ga
    SET
      failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = NOW()
    WHERE ga.id = p_account_id;
    
    RETURN TRUE;
  ELSE
    -- Senha incorreta - incrementar tentativas
    v_failed_attempts := COALESCE(v_failed_attempts, 0) + 1;
    
    -- Bloquear após 5 tentativas por 30 minutos
    IF v_failed_attempts >= 5 THEN
      v_locked_until := NOW() + INTERVAL '30 minutes';
    END IF;

    UPDATE public.guest_accounts ga
    SET
      failed_login_attempts = v_failed_attempts,
      locked_until = v_locked_until
    WHERE ga.id = p_account_id;

    RETURN FALSE;
  END IF;
END;
$$;

