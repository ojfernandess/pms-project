-- Função de debug melhorada para verificar pré-reservas expiradas
-- Esta função mostra informações detalhadas sobre todas as pré-reservas

CREATE OR REPLACE FUNCTION public.debug_expired_preregistrations()
RETURNS TABLE (
  reservation_code TEXT,
  expiration_date TIMESTAMPTZ,
  expiration_date_text TEXT,
  now_time TIMESTAMPTZ,
  now_time_text TEXT,
  is_expired BOOLEAN,
  time_diff_seconds NUMERIC,
  time_diff_text TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.reservation_code::TEXT,
    r.expiration_date,
    TO_CHAR(r.expiration_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS TZ') as expiration_date_text,
    NOW() as now_time,
    TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS TZ') as now_time_text,
    (r.expiration_date <= NOW()) as is_expired,
    EXTRACT(EPOCH FROM (NOW() - r.expiration_date))::NUMERIC as time_diff_seconds,
    (NOW() - r.expiration_date)::TEXT as time_diff_text,
    r.status::TEXT
  FROM public.reservations r
  WHERE r.status = 'preregistration'
    AND r.expiration_date IS NOT NULL
  ORDER BY r.expiration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.debug_expired_preregistrations() IS 
'Função de debug para verificar detalhadamente quais pré-reservas estão expiradas. Mostra datas formatadas e diferenças de tempo.';

