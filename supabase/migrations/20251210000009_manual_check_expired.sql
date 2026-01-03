-- Query manual para verificar pré-reservas expiradas
-- Execute esta query para ver quais pré-reservas deveriam ser canceladas

-- Ver todas as pré-reservas com expiration_date
SELECT 
  r.id,
  r.reservation_code,
  r.status,
  r.expiration_date,
  NOW() as current_time,
  (r.expiration_date <= NOW()) as should_be_cancelled,
  EXTRACT(EPOCH FROM (NOW() - r.expiration_date))::INTEGER as seconds_expired
FROM public.reservations r
WHERE r.status = 'preregistration'
  AND r.expiration_date IS NOT NULL
ORDER BY r.expiration_date ASC;

-- Para cancelar manualmente uma pré-reserva específica (substitua o reservation_code):
-- UPDATE public.reservations
-- SET status = 'cancelled',
--     notes = COALESCE(notes || E'\n', '') || 'Cancelada manualmente por expiração'
-- WHERE reservation_code = 'SEU_CODIGO_AQUI'
--   AND status = 'preregistration'
--   AND expiration_date <= NOW();

