-- Guest dashboard / web check-in: GRANTs em tabelas com RLS permissivo para hóspedes
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['reservation_extensions', 'fiscal_document_requests'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role',
      t
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon',
        t
      );
    END IF;
  END LOOP;
END $$;