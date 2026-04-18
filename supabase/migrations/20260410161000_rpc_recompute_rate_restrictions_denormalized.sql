-- RPC opcional: reexecutar a denormalização (rate_restrictions → rate_calendar / rate_sales_status)
-- para um intervalo, com auth. O fluxo normal continua a ser só o trigger em rate_restrictions.

CREATE OR REPLACE FUNCTION public.rpc_recompute_denormalized_from_rate_restrictions(
  p_establishment_id uuid,
  p_from date,
  p_to date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_establishment_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid arguments' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_can_access_establishment(auth.uid(), p_establishment_id) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  n := public.recompute_rate_calendar_from_restrictions(p_establishment_id, p_from, p_to);
  PERFORM public.recompute_rate_sales_status_from_restrictions(p_establishment_id, p_from, p_to);
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.rpc_recompute_denormalized_from_rate_restrictions(uuid, date, date) IS
  'Reaplica regras de rate_restrictions ao calendário/ARI no intervalo. Uso manual; o trigger já corre ao guardar em Restrições e Políticas.';

REVOKE ALL ON FUNCTION public.rpc_recompute_denormalized_from_rate_restrictions(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_recompute_denormalized_from_rate_restrictions(uuid, date, date) TO authenticated;
