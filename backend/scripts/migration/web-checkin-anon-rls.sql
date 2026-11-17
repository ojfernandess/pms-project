-- Políticas mínimas para anon no fluxo Web Check-in (se migrações Supabase não foram aplicadas).

DROP POLICY IF EXISTS "Guests can update reservations via web_checkin" ON public.reservations;
CREATE POLICY "Guests can update reservations via web_checkin"
  ON public.reservations
  FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.web_checkin wc
      WHERE wc.reservation_id = reservations.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.web_checkin wc
      WHERE wc.reservation_id = reservations.id
    )
  );

DROP POLICY IF EXISTS "Guests can view reservations for linking via web_checkin" ON public.reservations;
CREATE POLICY "Guests can view reservations for linking via web_checkin"
  ON public.reservations
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.web_checkin wc
      WHERE wc.reservation_id = reservations.id
    )
  );