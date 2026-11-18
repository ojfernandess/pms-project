-- Recibo / NF pelo guest dashboard: GRANT na tabela (RLS já permite hóspedes)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_document_requests TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_document_requests TO anon;
  END IF;
END $$;