-- Script de correção para as políticas RLS da tabela admin_users
-- Execute este script no Supabase SQL Editor se a migration anterior já foi executada

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Allow authenticated users to read admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow super admins to manage admin users" ON public.admin_users;

-- Criar nova política: Permitir que usuários autenticados leiam seu próprio registro
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

-- Criar política: Permitir que super admins leiam todos os registros
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
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.is_super_admin = true
        )
      );
  END IF;
END $$;

-- Criar política: Permitir que super admins gerenciem todos os registros
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
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.is_super_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.is_super_admin = true
        )
      );
  END IF;
END $$;

