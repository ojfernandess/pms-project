-- Script para criar o primeiro super admin
-- Substitua 'SEU_USER_ID_AQUI' pelo ID do usuário que você quer tornar super admin
-- Você pode encontrar o ID do usuário no Supabase Dashboard > Authentication > Users

-- Opção 1: Criar super admin para um usuário específico (substitua o UUID)
-- INSERT INTO public.admin_users (user_id, is_super_admin)
-- VALUES ('SEU_USER_ID_AQUI', true)
-- ON CONFLICT (user_id) DO UPDATE SET is_super_admin = true;

-- Opção 2: Criar super admin para o primeiro usuário criado no sistema
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Buscar o primeiro usuário criado
  SELECT id INTO first_user_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_user_id IS NOT NULL THEN
    -- Criar registro de super admin
    INSERT INTO public.admin_users (user_id, is_super_admin)
    VALUES (first_user_id, true)
    ON CONFLICT (user_id) DO UPDATE SET is_super_admin = true;
    
    RAISE NOTICE 'Super admin criado para o usuário: %', first_user_id;
  ELSE
    RAISE NOTICE 'Nenhum usuário encontrado em auth.users';
  END IF;
END $$;

-- Opção 3: Criar super admin para todos os usuários existentes (use com cuidado!)
-- INSERT INTO public.admin_users (user_id, is_super_admin)
-- SELECT id, true
-- FROM auth.users
-- ON CONFLICT (user_id) DO UPDATE SET is_super_admin = true;

