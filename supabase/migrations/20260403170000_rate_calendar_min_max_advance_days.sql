-- Antecedência mín/máx (dias antes do check-in) para ARI e Channel Manager (ex.: Aiosell minimumAdvanceReservation / maximumAdvanceReservation)

ALTER TABLE public.rate_calendar
  ADD COLUMN IF NOT EXISTS min_advance_days INTEGER,
  ADD COLUMN IF NOT EXISTS max_advance_days INTEGER;

COMMENT ON COLUMN public.rate_calendar.min_advance_days IS 'Reserva com antecedência mínima de N dias (0 = sem regra explícita)';
COMMENT ON COLUMN public.rate_calendar.max_advance_days IS 'Reserva com antecedência máxima de N dias (0 = sem regra explícita)';

-- Atualizar MV rate_calendar_summary (leituras com VITE_USE_RATE_CALENDAR_SUMMARY)
DROP MATERIALIZED VIEW IF EXISTS public.rate_calendar_summary;

CREATE MATERIALIZED VIEW public.rate_calendar_summary AS
SELECT
  rc.id,
  rc.establishment_id,
  rc.pricing_plan_id AS rate_plan_id,
  rc.category_id,
  rc.date,
  rc.base_price AS final_price,
  rc.projected_occupancy,
  rc.pickup_rate,
  COALESCE(rc.sales_status, 'open') AS availability,
  COALESCE(rc.min_stay, 0) AS min_stay,
  COALESCE(rc.max_stay, 0) AS max_stay,
  COALESCE(rc.closed_to_arrival, false) AS closed_to_arrival,
  COALESCE(rc.closed_to_departure, false) AS closed_to_departure,
  COALESCE(rc.stop_sell_ota, false) AS stop_sell_ota,
  COALESCE(rc.stop_sell_booking_engine, false) AS stop_sell_booking_engine,
  COALESCE(rc.min_advance_days, 0) AS min_advance_days,
  COALESCE(rc.max_advance_days, 0) AS max_advance_days,
  rc.created_at,
  rc.updated_at
FROM public.rate_calendar rc;

CREATE UNIQUE INDEX idx_rate_calendar_summary_pk
  ON public.rate_calendar_summary (id);

CREATE INDEX idx_rate_calendar_summary_est_date
  ON public.rate_calendar_summary (establishment_id, date);

CREATE INDEX idx_rate_calendar_summary_est_plan_category_date
  ON public.rate_calendar_summary (establishment_id, rate_plan_id, category_id, date);

COMMENT ON MATERIALIZED VIEW public.rate_calendar_summary IS
  'Cópia materializada do rate_calendar. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY rate_calendar_summary;';
