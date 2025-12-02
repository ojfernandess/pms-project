-- Atualizar função calculate_dynamic_price para considerar tarifários simplificados
-- Os tarifários simplificados têm prioridade sobre temporadas e regras
-- Esta migration substitui completamente a função anterior

-- Remover todas as versões antigas da função para evitar ambiguidade
-- O PostgreSQL precisa de todas as assinaturas possíveis para fazer DROP
DROP FUNCTION IF EXISTS public.calculate_dynamic_price(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.calculate_dynamic_price(UUID, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.calculate_dynamic_price(UUID, DATE, DATE, TEXT, UUID);
DROP FUNCTION IF EXISTS public.calculate_dynamic_price(UUID, DATE, DATE, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.calculate_dynamic_price(
  p_category_id UUID,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_promotion_code TEXT DEFAULT NULL,
  p_pricing_plan_id UUID DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price DECIMAL(10,2);
  v_nights INTEGER;
  v_total_price DECIMAL(10,2) := 0;
  v_date DATE;
  v_day_price DECIMAL(10,2);
  v_season_multiplier DECIMAL(5,2);
  v_rule_multiplier DECIMAL(5,2);
  v_rule_override DECIMAL(10,2);
  v_day_of_week INTEGER;
  v_promotion_discount DECIMAL(10,2) := 0;
  v_promotion_record RECORD;
  v_establishment_id UUID;
  v_pricing_plan_ids UUID[];
  v_simplified_pricing RECORD;
BEGIN
  -- Obter preço base da categoria e establishment_id
  SELECT base_price, establishment_id INTO v_base_price, v_establishment_id
  FROM public.room_categories
  WHERE id = p_category_id;

  IF v_base_price IS NULL THEN
    RETURN 0;
  END IF;

  -- Se não foi fornecido pricing_plan_id, buscar todos os tarifários ativos do estabelecimento
  IF p_pricing_plan_id IS NULL THEN
    SELECT ARRAY_AGG(id) INTO v_pricing_plan_ids
    FROM public.pricing_plans
    WHERE establishment_id = v_establishment_id
      AND is_active = true;
  ELSE
    v_pricing_plan_ids := ARRAY[p_pricing_plan_id];
  END IF;

  -- Se não há tarifários, retornar preço base simples (sem aplicar temporadas/regras)
  IF v_pricing_plan_ids IS NULL OR array_length(v_pricing_plan_ids, 1) IS NULL THEN
    v_nights := p_checkout_date - p_checkin_date;
    RETURN v_base_price * v_nights;
  END IF;

  -- Calcular número de noites
  v_nights := p_checkout_date - p_checkin_date;

  -- Processar cada dia da estadia
  v_date := p_checkin_date;
  WHILE v_date < p_checkout_date LOOP
    v_day_price := v_base_price;
    v_day_of_week := EXTRACT(DOW FROM v_date);

    -- PRIMEIRO: Verificar tarifários simplificados (têm prioridade)
    SELECT * INTO v_simplified_pricing
    FROM public.simplified_pricing
    WHERE establishment_id = v_establishment_id
      AND category_id = p_category_id
      AND pricing_plan_id = ANY(v_pricing_plan_ids)
      AND is_active = true
      AND (
        -- Verificar por datas
        (start_date IS NOT NULL AND end_date IS NOT NULL AND v_date >= start_date AND v_date <= end_date)
        OR
        -- Verificar por dias da semana
        (days_of_week IS NOT NULL AND array_length(days_of_week, 1) > 0 AND v_day_of_week = ANY(days_of_week))
        OR
        -- Sem restrição de data/dia (aplica sempre)
        (start_date IS NULL AND end_date IS NULL AND (days_of_week IS NULL OR array_length(days_of_week, 1) = 0))
      )
      AND (
        -- Verificar canal (se fornecido)
        p_channel_type IS NULL
        OR channel_type = p_channel_type
        OR (p_channel_type = 'direct' AND channel_type = 'direct')
      )
    ORDER BY created_at DESC
    LIMIT 1;

    -- Se encontrou tarifário simplificado, usar ele
    IF v_simplified_pricing IS NOT NULL THEN
      IF v_simplified_pricing.price IS NOT NULL THEN
        -- Preço fixo
        v_day_price := v_simplified_pricing.price;
      ELSIF v_simplified_pricing.price_multiplier IS NOT NULL THEN
        -- Multiplicador
        v_day_price := v_base_price * v_simplified_pricing.price_multiplier;
      END IF;
    ELSE
      -- SEGUNDO: Se não encontrou tarifário simplificado, usar sistema antigo (temporadas e regras)
      v_season_multiplier := 1.0;
      v_rule_multiplier := 1.0;
      v_rule_override := NULL;

      -- Verificar se há temporada ativa para esta data nos tarifários selecionados
      SELECT multiplier INTO v_season_multiplier
      FROM public.pricing_seasons
      WHERE is_active = true
        AND pricing_plan_id = ANY(v_pricing_plan_ids)
        AND start_date <= v_date
        AND end_date >= v_date
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_season_multiplier IS NULL THEN
        v_season_multiplier := 1.0;
      END IF;

      -- Aplicar multiplicador da temporada
      v_day_price := v_day_price * v_season_multiplier;

      -- Verificar regras de precificação nos tarifários selecionados
      SELECT price_override, multiplier INTO v_rule_override, v_rule_multiplier
      FROM public.pricing_rules
      WHERE category_id = p_category_id
        AND pricing_plan_id = ANY(v_pricing_plan_ids)
        AND (season_id IS NULL OR season_id IN (
          SELECT id FROM public.pricing_seasons
          WHERE is_active = true
            AND pricing_plan_id = ANY(v_pricing_plan_ids)
            AND start_date <= v_date
            AND end_date >= v_date
        ))
        AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
        AND (min_stay_nights IS NULL OR min_stay_nights <= v_nights)
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1;

      -- Aplicar regra (override tem prioridade sobre multiplier)
      IF v_rule_override IS NOT NULL THEN
        v_day_price := v_rule_override;
      ELSIF v_rule_multiplier IS NOT NULL THEN
        v_day_price := v_day_price * v_rule_multiplier;
      END IF;
    END IF;

    v_total_price := v_total_price + v_day_price;
    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  -- Aplicar promoção se fornecida (filtrar por pricing_plan_id também)
  IF p_promotion_code IS NOT NULL THEN
    SELECT * INTO v_promotion_record
    FROM public.promotions
    WHERE code = p_promotion_code
      AND pricing_plan_id = ANY(v_pricing_plan_ids)
      AND is_active = true
      AND start_date <= p_checkin_date
      AND end_date >= p_checkout_date
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND (applicable_categories IS NULL OR p_category_id = ANY(applicable_categories))
      AND (min_stay_nights IS NULL OR v_nights >= min_stay_nights)
      AND (max_stay_nights IS NULL OR v_nights <= max_stay_nights);

    IF v_promotion_record IS NOT NULL THEN
      IF v_promotion_record.discount_type = 'percentage' THEN
        v_promotion_discount := v_total_price * (v_promotion_record.discount_value / 100);
      ELSE
        v_promotion_discount := LEAST(v_promotion_record.discount_value, v_total_price);
      END IF;
      v_total_price := v_total_price - v_promotion_discount;
    END IF;
  END IF;

  RETURN GREATEST(v_total_price, 0);
END;
$$;

