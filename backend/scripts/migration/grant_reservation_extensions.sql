-- Web check-in / extensão de reserva: GRANT na tabela (RLS já permite hóspedes)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reservation_extensions TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reservation_extensions TO anon;
  END IF;
END $$;