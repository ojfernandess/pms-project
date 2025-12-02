-- Corrigir política RLS da tabela email_queue para permitir inserção por usuários autenticados

-- Remover todas as políticas existentes relacionadas
DROP POLICY IF EXISTS "Authenticated users can insert into email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Super admin can manage email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Super admin can view and update email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Super admin can update email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Super admin can delete email queue" ON public.email_queue;

-- Recriar políticas na ordem correta
-- 1. Política específica para INSERT (usuários autenticados)
-- Para INSERT, apenas WITH CHECK é permitido
CREATE POLICY "Authenticated users can insert into email queue"
  ON public.email_queue
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Políticas separadas para super admin (SELECT, UPDATE, DELETE)
-- Não incluir INSERT para evitar conflito
CREATE POLICY "Super admin can view email queue"
  ON public.email_queue
  FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can update email queue"
  ON public.email_queue
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete email queue"
  ON public.email_queue
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

