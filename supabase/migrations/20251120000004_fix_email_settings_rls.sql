-- Corrigir política RLS da tabela email_settings
-- Permitir que usuários autenticados leiam configurações ativas para verificar se envio está habilitado

-- Remover política existente se houver conflito
DROP POLICY IF EXISTS "Authenticated users can view active email settings" ON public.email_settings;

-- Criar política para permitir que usuários autenticados leiam configurações ativas
CREATE POLICY "Authenticated users can view active email settings"
  ON public.email_settings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
  );

