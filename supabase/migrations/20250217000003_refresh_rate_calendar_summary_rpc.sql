-- =====================================================
-- RPC: refresh_rate_calendar_summary
-- =====================================================
-- Atualiza a materialized view rate_calendar_summary.
-- Usar CONCURRENTLY para não bloquear leituras durante o refresh.
-- Chamar após mutations em rate_calendar (upsert, bulk update).

CREATE OR REPLACE FUNCTION public.refresh_rate_calendar_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY rate_calendar_summary;
END;
$$;

COMMENT ON FUNCTION public.refresh_rate_calendar_summary() IS
  'Atualiza a MV rate_calendar_summary. Chamar após alterações em rate_calendar.';
