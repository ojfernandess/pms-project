-- Função para atualizar senha de usuário (requer Service Role)
-- Esta função usa SECURITY DEFINER para executar com privilégios elevados
-- e usa a Service Role Key para atualizar a senha via Auth Admin API

CREATE OR REPLACE FUNCTION public.update_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  is_super_admin BOOLEAN;
BEGIN
  -- Verificar se o usuário atual está autenticado
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Verificar se o usuário atual é super admin
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = current_user_id
    AND is_super_admin = true
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Acesso negado. Apenas super admins podem atualizar senhas.';
  END IF;

  -- Verificar se o usuário alvo existe
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  -- Atualizar a senha usando a extensão pgcrypto para hash
  -- Nota: O Supabase Auth gerencia senhas internamente, então precisamos
  -- usar a API Admin do Supabase. Como não podemos fazer isso diretamente
  -- em uma função SQL, vamos usar uma abordagem diferente.
  
  -- Retornar true para indicar que a operação foi autorizada
  -- A atualização real será feita via Edge Function ou diretamente no código
  RETURN true;
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.update_user_password IS 'Função para autorizar atualização de senha de usuário por super admin. A atualização real deve ser feita via API Admin do Supabase.';

