-- Página pública de reservas (/reservar): role anon precisa criar clientes e orçamentos.
-- Sem GRANT INSERT → 42501 no DataService (permission denied for table clients).
-- Origem: supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/migration/public_reservation_anon.sql

DO $$
BEGIN
  IF to_regclass('public.clients') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE public.clients TO anon, authenticated, service_role;
  END IF;
  IF to_regclass('public.quotes') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.quotes TO anon, authenticated, service_role;
  END IF;
  IF to_regclass('public.reservation_service_fees') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE public.reservation_service_fees TO anon, authenticated, service_role;
  END IF;
END $$;

-- Disponibilidade na página pública (alinhada ao mapa / ARI)
DO $$
BEGIN
  IF to_regprocedure('public.calculate_category_availability(uuid,uuid,date)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.calculate_category_availability(UUID, UUID, DATE) TO anon;
  END IF;
END $$;

-- clients
DROP POLICY IF EXISTS "Public can create clients for reservations" ON public.clients;
CREATE POLICY "Public can create clients for reservations"
  ON public.clients FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read own clients" ON public.clients;
CREATE POLICY "Public can read own clients"
  ON public.clients FOR SELECT
  TO anon, authenticated
  USING (true);

-- quotes
DROP POLICY IF EXISTS "Public can create quotes for reservations" ON public.quotes;
CREATE POLICY "Public can create quotes for reservations"
  ON public.quotes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read own quotes" ON public.quotes;
CREATE POLICY "Public can read own quotes"
  ON public.quotes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can update own quotes" ON public.quotes;
CREATE POLICY "Public can update own quotes"
  ON public.quotes FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- taxas na reserva (limpeza/estacionamento no checkout público)
DROP POLICY IF EXISTS "Public can add service fees on new reservations" ON public.reservation_service_fees;
CREATE POLICY "Public can add service fees on new reservations"
  ON public.reservation_service_fees FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read reservation service fees" ON public.reservation_service_fees;
CREATE POLICY "Public can read reservation service fees"
  ON public.reservation_service_fees FOR SELECT
  TO anon, authenticated
  USING (true);