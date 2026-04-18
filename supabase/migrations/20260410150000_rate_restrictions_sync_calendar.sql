-- Persistir regras de rate_restrictions em rate_calendar (e rate_sales_status quando stop_sell abrange toda a categoria).
-- Agregação por célula (categoria + plano + data): OR para booleanos; MAX(min_los); MIN(max_los).
-- rate_sales_status: apenas stop_sell com pricing_plan_id IS NULL; reason = 'rate_restrictions_sync' para não sobrescrever fechos manuais.
--
-- Escopo de utilização (automático):
--   O trigger abaixo corre APENAS em INSERT/UPDATE/DELETE em public.rate_restrictions — ou seja, ao usar
--   «Restrições e Políticas» (ou qualquer cliente que altere essa tabela). Editar só o ARI / rate_calendar
--   não invoca estas funções.
--   Exceções: (1) backfill desta migration; (2) RPC rpc_recompute_denormalized_from_rate_restrictions (auth + acesso ao est.).

CREATE OR REPLACE FUNCTION public.recompute_rate_calendar_from_restrictions(
  p_establishment_id uuid,
  p_from date,
  p_to date
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF p_establishment_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN 0;
  END IF;

  WITH cal AS (
    SELECT id, category_id, pricing_plan_id, date
    FROM public.rate_calendar
    WHERE establishment_id = p_establishment_id
      AND date >= p_from
      AND date <= p_to
  ),
  joined AS (
    SELECT
      c.id,
      BOOL_OR(r.restriction_type = 'stop_sell') AS ss,
      MAX(r.value) FILTER (
        WHERE r.restriction_type = 'min_los' AND r.value IS NOT NULL
      ) AS min_stay_v,
      MIN(r.value) FILTER (
        WHERE r.restriction_type = 'max_los' AND r.value IS NOT NULL
      ) AS max_stay_v,
      BOOL_OR(r.restriction_type IN ('cta', 'closed_to_arrival')) AS cta,
      BOOL_OR(r.restriction_type IN ('ctd', 'closed_to_departure')) AS ctd
    FROM cal c
    LEFT JOIN public.rate_restrictions r
      ON r.establishment_id = p_establishment_id
      AND r.is_active = true
      AND c.date >= r.start_date
      AND c.date <= r.end_date
      AND (r.category_id IS NULL OR r.category_id = c.category_id)
      AND (r.pricing_plan_id IS NULL OR r.pricing_plan_id = c.pricing_plan_id)
    GROUP BY c.id
  )
  UPDATE public.rate_calendar rc
  SET
    min_stay = j.min_stay_v,
    max_stay = j.max_stay_v,
    closed_to_arrival = COALESCE(j.cta, false),
    closed_to_departure = COALESCE(j.ctd, false),
    stop_sell_ota = COALESCE(j.ss, false),
    stop_sell_booking_engine = COALESCE(j.ss, false),
    updated_at = NOW()
  FROM joined j
  WHERE rc.id = j.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.recompute_rate_calendar_from_restrictions(uuid, date, date) IS
  'Atualiza min_stay, max_stay, CTA/CTD e stop sell no rate_calendar a partir de rate_restrictions ativas no intervalo.';

CREATE OR REPLACE FUNCTION public.recompute_rate_sales_status_from_restrictions(
  p_establishment_id uuid,
  p_from date,
  p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_establishment_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

  -- Remover fechos OTA impulsionados por regras que já não se aplicam
  UPDATE public.rate_sales_status rss
  SET
    status = 'open',
    reason = NULL,
    updated_at = NOW()
  WHERE rss.establishment_id = p_establishment_id
    AND rss.date >= p_from
    AND rss.date <= p_to
    AND rss.reason = 'rate_restrictions_sync'
    AND NOT EXISTS (
      SELECT 1
      FROM public.rate_restrictions r
      WHERE r.establishment_id = p_establishment_id
        AND r.is_active = true
        AND r.restriction_type = 'stop_sell'
        AND r.pricing_plan_id IS NULL
        AND (r.category_id IS NULL OR r.category_id = rss.category_id)
        AND rss.date >= r.start_date
        AND rss.date <= r.end_date
    );

  -- Stop sell «toda a categoria» (sem plano): alinha Aiosell (rate_sales_status por categoria/data)
  INSERT INTO public.rate_sales_status (establishment_id, category_id, date, status, reason)
  SELECT DISTINCT
    p_establishment_id,
    cat.id,
    dr.day_dt::date,
    'restricted_ota',
    'rate_restrictions_sync'
  FROM generate_series(
    p_from::timestamp,
    p_to::timestamp,
    interval '1 day'
  ) AS dr(day_dt)
  CROSS JOIN public.room_categories cat
  INNER JOIN public.rate_restrictions r
    ON r.establishment_id = p_establishment_id
    AND r.is_active = true
    AND r.restriction_type = 'stop_sell'
    AND r.pricing_plan_id IS NULL
    AND cat.establishment_id = p_establishment_id
    AND (r.category_id IS NULL OR r.category_id = cat.id)
    AND (dr.day_dt::date >= r.start_date AND dr.day_dt::date <= r.end_date)
  ON CONFLICT (establishment_id, category_id, date)
  DO UPDATE SET
    status = CASE
      WHEN rate_sales_status.reason IS NULL
        OR rate_sales_status.reason = 'rate_restrictions_sync'
      THEN EXCLUDED.status
      ELSE rate_sales_status.status
    END,
    reason = CASE
      WHEN rate_sales_status.reason IS NULL
        OR rate_sales_status.reason = 'rate_restrictions_sync'
      THEN EXCLUDED.reason
      ELSE rate_sales_status.reason
    END,
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.recompute_rate_sales_status_from_restrictions(uuid, date, date) IS
  'Upsert restricted_ota em rate_sales_status para stop_sell sem pricing_plan_id; limpa linhas com reason rate_restrictions_sync quando a regra deixa de aplicar.';

CREATE OR REPLACE FUNCTION public.trg_rate_restrictions_sync_calendar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_est uuid;
  v_from date;
  v_to date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_est := OLD.establishment_id;
    v_from := OLD.start_date;
    v_to := OLD.end_date;
    PERFORM public.recompute_rate_calendar_from_restrictions(v_est, v_from, v_to);
    PERFORM public.recompute_rate_sales_status_from_restrictions(v_est, v_from, v_to);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.establishment_id IS DISTINCT FROM NEW.establishment_id THEN
      PERFORM public.recompute_rate_calendar_from_restrictions(
        OLD.establishment_id, OLD.start_date, OLD.end_date);
      PERFORM public.recompute_rate_sales_status_from_restrictions(
        OLD.establishment_id, OLD.start_date, OLD.end_date);
    END IF;
    v_est := NEW.establishment_id;
    v_from := LEAST(OLD.start_date, NEW.start_date);
    v_to := GREATEST(OLD.end_date, NEW.end_date);
  ELSE
    v_est := NEW.establishment_id;
    v_from := NEW.start_date;
    v_to := NEW.end_date;
  END IF;

  PERFORM public.recompute_rate_calendar_from_restrictions(v_est, v_from, v_to);
  PERFORM public.recompute_rate_sales_status_from_restrictions(v_est, v_from, v_to);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rate_restrictions_sync_calendar_after ON public.rate_restrictions;

CREATE TRIGGER rate_restrictions_sync_calendar_after
  AFTER INSERT OR UPDATE OR DELETE ON public.rate_restrictions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rate_restrictions_sync_calendar();

COMMENT ON TRIGGER rate_restrictions_sync_calendar_after ON public.rate_restrictions IS
  'Denormaliza regras ativas para rate_calendar e rate_sales_status (stop sell categoria-inteiro).';

-- Backfill: uma passagem por estabelecimento que tenha restrições
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT establishment_id, MIN(start_date) AS d0, MAX(end_date) AS d1
    FROM public.rate_restrictions
    GROUP BY establishment_id
  LOOP
    PERFORM public.recompute_rate_calendar_from_restrictions(r.establishment_id, r.d0, r.d1);
    PERFORM public.recompute_rate_sales_status_from_restrictions(r.establishment_id, r.d0, r.d1);
  END LOOP;
END $$;
