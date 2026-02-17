-- =====================================================
-- MATERIALIZED VIEW: rate_calendar_summary
-- =====================================================
-- View otimizada para leituras do calendário tarifário.
-- Evita joins pesados em tempo real.
-- Útil para dashboards e listagens em alta escala.
--
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY rate_calendar_summary;
-- (ou via trigger após INSERT/UPDATE/DELETE em rate_calendar)

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
  rc.created_at,
  rc.updated_at
FROM public.rate_calendar rc;

-- Índices para consultas frequentes
CREATE UNIQUE INDEX idx_rate_calendar_summary_pk
  ON public.rate_calendar_summary (id);

CREATE INDEX idx_rate_calendar_summary_est_date
  ON public.rate_calendar_summary (establishment_id, date);

CREATE INDEX idx_rate_calendar_summary_est_plan_category_date
  ON public.rate_calendar_summary (establishment_id, rate_plan_id, category_id, date);

-- Permitir REFRESH CONCURRENTLY (requer índice único)
COMMENT ON MATERIALIZED VIEW public.rate_calendar_summary IS
  'Cópia materializada do rate_calendar para leituras performáticas. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY rate_calendar_summary;';
