-- Script para sincronizar usuários existentes da tabela auth.users para public.users
-- Execute este script se a tabela users já foi criada mas não tem dados

-- Sincronizar usuários existentes (se houver)
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, updated_at = NOW();

-- Verificar quantos usuários foram sincronizados
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.users;
  RAISE NOTICE 'Total de usuários sincronizados: %', user_count;
END $$;

