-- Índices para acelerar os JOINs de ocupação em calculate_rate_price
-- (evita timeout no Postgres → 502 no PostgREST / gateway).
-- Padrão: reservas ativas numa data D com checkin_date <= D e checkout_date > D

CREATE INDEX IF NOT EXISTS idx_reservations_room_active_stay_dates
  ON public.reservations (room_id, checkin_date, checkout_date)
  WHERE status IN ('confirmed', 'checkedin')
    AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_establishment_category
  ON public.rooms (establishment_id, category_id)
  WHERE establishment_id IS NOT NULL;
