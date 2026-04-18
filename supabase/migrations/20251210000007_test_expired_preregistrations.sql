-- Função de teste para verificar pré-reservas expiradas
-- Execute esta função para ver quais pré-reservas estão expiradas

CREATE OR REPLACE FUNCTION public.test_expired_preregistrations()
RETURNS TABLE (
  reservation_code TEXT,
  expiration_date TIMESTAMPTZ,
  now_time TIMESTAMPTZ,
  is_expired BOOLEAN,
  time_diff INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.reservation_code::TEXT,
    r.expiration_date,
    NOW() as now_time,
    (r.expiration_date <= NOW()) as is_expired,
    (NOW() - r.expiration_date) as time_diff
  FROM public.reservations r
  WHERE r.status = 'preregistration'
    AND r.expiration_date IS NOT NULL
  ORDER BY r.expiration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.test_expired_preregistrations() IS 
'Função de teste para verificar quais pré-reservas estão expiradas e quando expiraram.';

