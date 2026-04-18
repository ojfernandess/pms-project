-- Script de correção para remover recursão infinita nas políticas RLS da tabela users
-- Execute este script no Supabase SQL Editor se a migration anterior já foi executada

-- Remover políticas antigas que causam recursão
DROP POLICY IF EXISTS "Allow super admins to manage users" ON public.users;

-- Criar política simplificada (verificação de super admin será feita no código)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Allow authenticated users to manage users'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage users"
      ON public.users FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

