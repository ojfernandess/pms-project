-- Fallback mínimo se o SQL completo falhar (schema incompleto). Preço pode divergir do Supabase.
CREATE OR REPLACE FUNCTION public.calculate_rate_price(
  p_establishment_id UUID,
  p_category_id UUID,
  p_pricing_plan_id UUID,
  p_date DATE,
  p_adults INTEGER DEFAULT 1,
  p_children INTEGER DEFAULT 0
) RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_base DECIMAL(10,2);
BEGIN
  SELECT rc.base_price
  INTO v_base
  FROM public.rate_calendar rc
  WHERE rc.establishment_id = p_establishment_id
    AND rc.category_id = p_category_id
    AND rc.pricing_plan_id = p_pricing_plan_id
    AND rc.date = p_date
  LIMIT 1;

  IF v_base IS NULL THEN
    SELECT c.base_price INTO v_base FROM public.room_categories c WHERE c.id = p_category_id;
  END IF;

  RETURN COALESCE(v_base, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_rate_price(UUID, UUID, UUID, DATE, INTEGER, INTEGER) TO anon, authenticated, service_role;