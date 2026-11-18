-- Guest dashboard: checkout (rooms) e avaliações (stay_reviews)
DO $$
DECLARE
  t text;
  tables_rw text[] := ARRAY['stay_reviews'];
BEGIN
  FOREACH t IN ARRAY tables_rw LOOP
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

GRANT SELECT, UPDATE ON TABLE public.rooms TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, UPDATE ON TABLE public.rooms TO anon;
  END IF;
END $$;

GRANT SELECT ON TABLE public.establishment_review_settings TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE public.establishment_review_settings TO anon;
  END IF;
END $$;

DROP POLICY IF EXISTS "Guests can mark room cleaning after checkout" ON public.rooms;
CREATE POLICY "Guests can mark room cleaning after checkout"
  ON public.rooms FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservations r
      INNER JOIN public.guest_stay_history gsh ON gsh.reservation_id = r.id
      WHERE r.room_id = rooms.id
        AND r.status = 'checkedout'
    )
  )
  WITH CHECK (status = 'cleaning');

DROP POLICY IF EXISTS "Guests can read establishment review settings" ON public.establishment_review_settings;
CREATE POLICY "Guests can read establishment review settings"
  ON public.establishment_review_settings FOR SELECT
  TO public
  USING (true);