-- Correção FINAL da política RLS da tabela email_queue
-- Garantir que usuários autenticados possam inserir e-mails na fila

-- IMPORTANTE: Remover TODAS as políticas existentes relacionadas à email_queue
-- Isso garante que não há conflitos
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'email_queue' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.email_queue', r.policyname);
    END LOOP;
END $$;

-- Política 1: Qualquer usuário autenticado pode inserir na fila
-- Esta é a política mais importante para o funcionamento do sistema
-- Simplificada ao máximo para garantir que funcione
CREATE POLICY "Allow authenticated users to insert emails"
  ON public.email_queue
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Política 2: Super admin pode ver tudo
CREATE POLICY "Super admin can view email queue"
  ON public.email_queue
  FOR SELECT
  USING (
    public.is_super_admin(auth.uid()) = true
  );

-- Política 3: Super admin pode atualizar
CREATE POLICY "Super admin can update email queue"
  ON public.email_queue
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()) = true)
  WITH CHECK (public.is_super_admin(auth.uid()) = true);

-- Política 4: Super admin pode deletar
CREATE POLICY "Super admin can delete email queue"
  ON public.email_queue
  FOR DELETE
  USING (public.is_super_admin(auth.uid()) = true);

-- Política 5: Usuários podem ver seus próprios e-mails na fila (baseado em reservation_id)
CREATE POLICY "Users can view emails for their reservations"
  ON public.email_queue
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND reservation_id IN (
      SELECT id FROM public.reservations
      WHERE created_by = auth.uid()
    )
  );

