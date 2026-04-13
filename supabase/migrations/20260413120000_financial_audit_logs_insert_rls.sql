-- financial_audit_logs: RLS tinha apenas SELECT; inserts do cliente (ex. refundService) falhavam com 42501.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'financial_audit_logs' AND policyname = 'users_insert_own_establishment_audit'
  ) THEN
    CREATE POLICY users_insert_own_establishment_audit ON public.financial_audit_logs
      FOR INSERT
      WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
        AND (user_id IS NULL OR user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON POLICY users_insert_own_establishment_audit ON public.financial_audit_logs IS
  'Utilizadores autenticados podem inserir auditoria apenas para estabelecimentos a que têm acesso; user_id deve coincidir com auth.uid() quando preenchido.';
