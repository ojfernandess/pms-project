-- Adicionar colunas para reset de senha na tabela guest_accounts
ALTER TABLE public.guest_accounts
ADD COLUMN IF NOT EXISTS reset_token TEXT,
ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

-- Criar índice para busca rápida por reset_token
CREATE INDEX IF NOT EXISTS idx_guest_accounts_reset_token ON public.guest_accounts(reset_token)
WHERE reset_token IS NOT NULL;

-- Função para solicitar reset de senha (gera token e retorna dados para envio de email)
CREATE OR REPLACE FUNCTION request_guest_password_reset(
  p_email TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  reset_token TEXT,
  email TEXT,
  full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id UUID;
  v_reset_token TEXT;
  v_reset_token_expires TIMESTAMPTZ;
  v_full_name TEXT;
BEGIN
  -- Buscar conta pelo email
  SELECT ga.id, ga.full_name
  INTO v_account_id, v_full_name
  FROM public.guest_accounts ga
  WHERE ga.email = LOWER(p_email);

  -- Se conta não encontrada, não revelar isso (segurança)
  IF v_account_id IS NULL THEN
    -- Retornar sucesso mesmo se não encontrar (para não revelar emails cadastrados)
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Gerar token de reset (UUID)
  v_reset_token := gen_random_uuid()::TEXT;
  v_reset_token_expires := NOW() + INTERVAL '1 hour'; -- Token válido por 1 hora

  -- Atualizar conta com token de reset
  UPDATE public.guest_accounts ga
  SET
    reset_token = v_reset_token,
    reset_token_expires_at = v_reset_token_expires,
    updated_at = NOW()
  WHERE ga.id = v_account_id;

  -- Retornar dados para envio de email
  RETURN QUERY SELECT TRUE, v_reset_token, LOWER(p_email), v_full_name;
END;
$$;

-- Função para resetar senha usando token
CREATE OR REPLACE FUNCTION reset_guest_password(
  p_reset_token TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id UUID;
  v_password_hash TEXT;
BEGIN
  -- Buscar conta pelo token de reset válido
  SELECT ga.id
  INTO v_account_id
  FROM public.guest_accounts ga
  WHERE ga.reset_token = p_reset_token
    AND ga.reset_token_expires_at > NOW();

  -- Se token inválido ou expirado
  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Gerar novo hash da senha
  v_password_hash := crypt(p_new_password, gen_salt('bf', 10));

  -- Atualizar senha e limpar token de reset
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

-- Comentários nas funções
COMMENT ON FUNCTION request_guest_password_reset IS 'Solicita reset de senha para conta de hóspede. Retorna token para envio de email.';
COMMENT ON FUNCTION reset_guest_password IS 'Reseta senha de conta de hóspede usando token válido.';

