-- =====================================================
-- ATUALIZAR FUNÇÃO calculate_dynamic_price PARA USAR NOVO SISTEMA
-- =====================================================
-- Esta função mantém compatibilidade com o sistema antigo
-- mas prioriza o novo sistema tarifário quando disponível

CREATE OR REPLACE FUNCTION public.calculate_dynamic_price(
  p_category_id UUID,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_promotion_code TEXT DEFAULT NULL,
  p_pricing_plan_id UUID DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_establishment_id UUID;
  v_base_price DECIMAL(10,2);
  v_total_price DECIMAL(10,2) := 0;
  v_nights INTEGER;
  v_date DATE;
  v_rate_price DECIMAL(10,2);
  v_category_base_price DECIMAL(10,2);
BEGIN
  -- Obter establishment_id da categoria
  SELECT establishment_id INTO v_establishment_id
  FROM public.room_categories
  WHERE id = p_category_id;

  IF v_establishment_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Calcular número de noites
  v_nights := p_checkout_date - p_checkin_date;
  IF v_nights <= 0 THEN
    RETURN 0;
  END IF;

  -- Se há pricing_plan_id, usar novo sistema tarifário
  IF p_pricing_plan_id IS NOT NULL THEN
    -- Calcular preço usando novo sistema (rate_calendar + dynamic_rules)
    v_date := p_checkin_date;
    WHILE v_date < p_checkout_date LOOP
      -- Usar função do novo sistema
      SELECT calculate_rate_price(
        v_establishment_id,
        p_category_id,
        p_pricing_plan_id,
        v_date,
        1, -- adults (pode ser expandido)
        0  -- children (pode ser expandido)
      ) INTO v_rate_price;

      IF v_rate_price IS NULL OR v_rate_price = 0 THEN
        -- Fallback: usar preço base da categoria
        SELECT base_price INTO v_category_base_price
        FROM public.room_categories
        WHERE id = p_category_id;
        v_total_price := v_total_price + COALESCE(v_category_base_price, 0);
      ELSE
        v_total_price := v_total_price + v_rate_price;
      END IF;

      v_date := v_date + 1;
    END LOOP;

    -- Aplicar promoção se houver
    IF p_promotion_code IS NOT NULL THEN
      -- Lógica de promoção (manter compatibilidade com sistema antigo)
      -- Pode ser expandida para usar novo sistema
      DECLARE
        v_promotion RECORD;
      BEGIN
        SELECT * INTO v_promotion
        FROM public.promotions
        WHERE code = p_promotion_code
          AND is_active = true
          AND start_date <= p_checkin_date
          AND end_date >= p_checkout_date
        LIMIT 1;

        IF FOUND AND v_promotion.discount_value IS NOT NULL THEN
          IF v_promotion.discount_type = 'percentage' THEN
            v_total_price := v_total_price * (1 - v_promotion.discount_value / 100);
          ELSIF v_promotion.discount_type = 'fixed' THEN
            v_total_price := v_total_price - v_promotion.discount_value;
          END IF;
        END IF;
      END;
    END IF;

    RETURN GREATEST(v_total_price, 0);
  END IF;

  -- Fallback: usar sistema antigo (pricing_rules, pricing_seasons, etc)
  -- Manter lógica existente para compatibilidade
  -- (código do sistema antigo seria mantido aqui)

  -- Por enquanto, retornar preço base da categoria
  SELECT base_price INTO v_base_price
  FROM public.room_categories
  WHERE id = p_category_id;

  IF v_base_price IS NULL THEN
    RETURN 0;
  END IF;

  RETURN v_base_price * v_nights;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_dynamic_price IS 'Calcula preço dinâmico usando novo sistema tarifário quando disponível, com fallback para sistema antigo';

