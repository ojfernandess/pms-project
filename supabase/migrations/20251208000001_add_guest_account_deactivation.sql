-- Adicionar campo is_active na tabela guest_accounts para desativação de conta (LGPD)
ALTER TABLE public.guest_accounts
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Criar índice para busca rápida por contas ativas
CREATE INDEX IF NOT EXISTS idx_guest_accounts_is_active ON public.guest_accounts(is_active)
WHERE is_active = true;

-- Função para desativar conta de hóspede (remove acesso ao guest-dashboard, mas mantém dados de reservas e histórico fiscal)
-- Substitui o email por um genérico para permitir novo cadastro com o mesmo email
CREATE OR REPLACE FUNCTION deactivate_guest_account(
  p_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_exists BOOLEAN;
  v_generic_email TEXT;
BEGIN
  -- Verificar se a conta existe
  SELECT EXISTS(SELECT 1 FROM public.guest_accounts WHERE id = p_account_id)
  INTO v_account_exists;

  IF NOT v_account_exists THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;

  -- Gerar email genérico único usando o UUID da conta
  -- Formato: deleted_{uuid}@deleted.local
  v_generic_email := 'deleted_' || p_account_id::TEXT || '@deleted.local';

  -- Desativar conta e substituir email por genérico
  -- Isso permite que o usuário se cadastre novamente com o mesmo email no futuro
  UPDATE public.guest_accounts
  SET
    is_active = false,
    email = v_generic_email,
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN TRUE;
END;
$$;

-- Atualizar política RLS: manter política existente, mas a verificação de is_active será feita na função verify_guest_password
-- A política atual já permite leitura pública para verificação via token, o que é necessário para o sistema funcionar
-- A verificação de is_active será feita na função verify_guest_password e no código do frontend

-- Atualizar função verify_guest_password para verificar is_active
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
  v_is_active BOOLEAN;
BEGIN
  -- Buscar hash da senha, status da conta e is_active
  SELECT ga.password_hash, ga.locked_until, ga.failed_login_attempts, COALESCE(ga.is_active, true)
  INTO v_password_hash, v_locked_until, v_failed_attempts, v_is_active
  FROM public.guest_accounts ga
  WHERE ga.id = p_account_id;

  -- Se conta não encontrada
  IF v_password_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verificar se conta está ativa (LGPD - exclusão de conta)
  IF v_is_active = false THEN
    RAISE EXCEPTION 'Esta conta foi excluída. Entre em contato com o suporte para mais informações.';
  END IF;

  -- Verificar se conta está bloqueada
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'Conta temporariamente bloqueada. Tente novamente mais tarde.';
  END IF;

  -- Verificar senha usando pgcrypto
  IF crypt(p_password, v_password_hash) = v_password_hash THEN
    -- Senha correta: resetar tentativas e atualizar last_login
    UPDATE public.guest_accounts
    SET
      failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = NOW(),
      updated_at = NOW()
    WHERE id = p_account_id;
    
    RETURN TRUE;
  ELSE
    -- Senha incorreta: incrementar tentativas
    v_failed_attempts := COALESCE(v_failed_attempts, 0) + 1;
    
    -- Bloquear conta após 5 tentativas por 30 minutos
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

