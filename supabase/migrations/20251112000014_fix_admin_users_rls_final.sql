-- Script de correção final para as políticas RLS da tabela admin_users
-- Remove recursão infinita e garante que as políticas funcionem corretamente

-- Remover todas as políticas existentes que podem causar recursão
DROP POLICY IF EXISTS "Allow authenticated users to read admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow users to read their own admin status" ON public.admin_users;
DROP POLICY IF EXISTS "Allow super admins to read all admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow super admins to manage admin users" ON public.admin_users;

-- Criar política simples: Permitir que usuários autenticados leiam seu próprio registro
-- Esta política não causa recursão porque verifica apenas o próprio user_id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'admin_users' 
    AND policyname = 'Allow users to read their own admin status'
  ) THEN
    CREATE POLICY "Allow users to read their own admin status"
      ON public.admin_users FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Remover função existente se houver
DROP FUNCTION IF EXISTS public.is_super_admin(UUID);

-- Criar função helper que bypassa RLS para verificar se é super admin
-- Esta função usa SECURITY DEFINER para evitar recursão
CREATE FUNCTION public.is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT is_super_admin 
    FROM public.admin_users 
    WHERE user_id = user_uuid
    LIMIT 1
  ) = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar política para permitir que super admins leiam todos os registros
-- Usa a função helper que não causa recursão
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'admin_users' 
    AND policyname = 'Allow super admins to read all admin users'
  ) THEN
    CREATE POLICY "Allow super admins to read all admin users"
      ON public.admin_users FOR SELECT
      TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Criar política para permitir que super admins gerenciem todos os registros
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'admin_users' 
    AND policyname = 'Allow super admins to manage admin users'
  ) THEN
    CREATE POLICY "Allow super admins to manage admin users"
      ON public.admin_users FOR ALL
      TO authenticated
      USING (public.is_super_admin(auth.uid()))
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

