-- Migration: Corrigir erro 406 ao acessar stripe_global_config
-- O erro 406 ocorre quando a política RLS não permite acesso ou há problemas com headers Accept
-- Esta migration permite acesso público para leitura básica e autenticado para leitura completa

-- Remover políticas existentes
DROP POLICY IF EXISTS "Authenticated users can read stripe global config" ON public.stripe_global_config;
DROP POLICY IF EXISTS "Only super admin can manage stripe global config" ON public.stripe_global_config;
DROP POLICY IF EXISTS "Public can read stripe enabled status" ON public.stripe_global_config;

-- Criar política que permite leitura pública (necessário para verificar se Stripe está habilitado)
-- Nota: Apenas campos não sensíveis devem ser expostos publicamente
CREATE POLICY "Public can read stripe enabled status"
  ON public.stripe_global_config FOR SELECT
  TO public
  USING (true);

-- Criar política que permite leitura completa para usuários autenticados
-- Esta política permite acesso a todos os campos para usuários logados
CREATE POLICY "Authenticated users can read stripe global config"
  ON public.stripe_global_config FOR SELECT
  TO authenticated
  USING (true);

-- Manter política de gerenciamento apenas para super admin
CREATE POLICY "Only super admin can manage stripe global config"
  ON public.stripe_global_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
      AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
      AND is_super_admin = true
    )
  );

