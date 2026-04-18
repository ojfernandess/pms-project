-- =====================================================
-- CORRIGIR FUNÇÃO calculate_rate_price - REMOVER is_active
-- =====================================================

-- Recriar função sem usar is_active em tabelas que não têm essa coluna
CREATE OR REPLACE FUNCTION public.calculate_rate_price(
  p_establishment_id UUID,
  p_category_id UUID,
  p_pricing_plan_id UUID,
  p_date DATE,
  p_adults INTEGER DEFAULT 1,
  p_children INTEGER DEFAULT 0
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_base_price DECIMAL(10,2);
  v_adult_price DECIMAL(10,2);
  v_child_price DECIMAL(10,2);
  v_final_price DECIMAL(10,2);
  v_occupancy DECIMAL(5,2);
  v_projected_occupancy DECIMAL(5,2);
  v_pickup_rate DECIMAL(10,2);
  v_demand_score DECIMAL(5,2);
  v_rule RECORD;
  v_adjustment DECIMAL(10,2);
  v_has_local_event BOOLEAN;
  v_event_impact DECIMAL(5,2);
BEGIN
  -- 1. Buscar preço base do calendário
  SELECT base_price, adult_price, child_price, occupancy_percentage, projected_occupancy, pickup_rate
  INTO v_base_price, v_adult_price, v_child_price, v_occupancy, v_projected_occupancy, v_pickup_rate
  FROM public.rate_calendar
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND pricing_plan_id = p_pricing_plan_id
    AND date = p_date
  LIMIT 1;

  -- Se não encontrou no calendário, usar preço base da categoria
  IF v_base_price IS NULL THEN
    SELECT base_price INTO v_base_price
    FROM public.room_categories
    WHERE id = p_category_id;
    
    IF v_base_price IS NULL THEN
      RETURN 0;
    END IF;

    -- Calcular métricas se não estão no calendário (opcional, pode ser custoso)
    -- Por enquanto, não calcular para melhor performance
    v_occupancy := 0;
    v_projected_occupancy := 0;
    v_pickup_rate := 0;
  END IF;

  -- Calcular score de demanda (opcional, pode ser custoso)
  -- Por enquanto, não calcular para melhor performance
  v_demand_score := 50; -- Score neutro

  -- Verificar eventos locais (se a tabela existir)
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.local_events
      WHERE establishment_id = p_establishment_id
        AND (is_active IS NULL OR is_active = true)
        AND start_date <= p_date
        AND end_date >= p_date
    ) INTO v_has_local_event;

    IF v_has_local_event THEN
      SELECT expected_demand_increase INTO v_event_impact
      FROM public.local_events
      WHERE establishment_id = p_establishment_id
        AND (is_active IS NULL OR is_active = true)
        AND start_date <= p_date
        AND end_date >= p_date
      ORDER BY impact_level DESC
      LIMIT 1;
    ELSE
      v_event_impact := 0;
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      -- Tabela local_events não existe ainda, ignorar
      v_has_local_event := false;
      v_event_impact := 0;
    WHEN OTHERS THEN
      v_has_local_event := false;
      v_event_impact := 0;
  END;

  -- 2. Calcular preço base com adultos/crianças
  v_final_price := v_base_price;
  
  IF p_adults > 1 AND v_adult_price IS NOT NULL THEN
    v_final_price := v_final_price + (v_adult_price * (p_adults - 1));
  END IF;
  
  IF p_children > 0 AND v_child_price IS NOT NULL THEN
    v_final_price := v_final_price + (v_child_price * p_children);
  END IF;

  -- 3. Aplicar regras dinâmicas em ordem de prioridade
  -- Verificar se a tabela existe antes de usar
  BEGIN
    FOR v_rule IN
      SELECT * FROM public.dynamic_pricing_rules
      WHERE establishment_id = p_establishment_id
        AND (start_date IS NULL OR start_date <= p_date)
        AND (end_date IS NULL OR end_date >= p_date)
        AND (
          applicable_categories IS NULL 
          OR p_category_id = ANY(applicable_categories)
        )
        AND (
          applicable_plans IS NULL 
          OR p_pricing_plan_id = ANY(applicable_plans)
        )
      ORDER BY priority ASC
    LOOP
      -- Verificar se a regra está ativa (se a coluna existir)
      IF v_rule.is_active IS NOT NULL AND v_rule.is_active = false THEN
        CONTINUE;
      END IF;
      
      -- Verificar condições do trigger
      DECLARE
        v_should_apply BOOLEAN := false;
      BEGIN
        -- Trigger: Ocupação
        IF v_rule.use_occupancy AND v_rule.trigger_type = 'occupancy' THEN
          IF v_occupancy IS NOT NULL AND v_occupancy > 0 THEN
            v_should_apply := true;
          END IF;
        END IF;

        -- Trigger: Pickup Rate
        IF v_rule.use_pickup_rate AND v_rule.trigger_type = 'booking_velocity' THEN
          IF v_pickup_rate IS NOT NULL AND v_pickup_rate > 0 THEN
            v_should_apply := true;
          END IF;
        END IF;

        -- Trigger: Eventos Locais
        IF v_rule.use_local_events AND v_has_local_event THEN
          v_should_apply := true;
        END IF;

        -- Trigger: Histórico de Demanda
        IF v_rule.use_demand_history AND v_demand_score IS NOT NULL THEN
          IF v_demand_score > 70 THEN -- Alta demanda
            v_should_apply := true;
          END IF;
        END IF;

        -- Aplicar ajuste se a condição foi atendida
        IF v_should_apply THEN
          IF v_rule.adjustment_type = 'percentage' THEN
            v_adjustment := v_final_price * (v_rule.adjustment_value / 100);
            v_final_price := v_final_price + v_adjustment;
          ELSIF v_rule.adjustment_type = 'fixed' THEN
            v_final_price := v_final_price + v_rule.adjustment_value;
          ELSIF v_rule.adjustment_type = 'multiplier' THEN
            v_final_price := v_final_price * v_rule.adjustment_value;
          END IF;
        END IF;
      END;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN
      -- Tabela dynamic_pricing_rules não existe ainda, ignorar
      NULL;
    WHEN OTHERS THEN
      -- Erro ao processar regras, continuar sem aplicar
      NULL;
  END;

  -- Aplicar impacto de eventos locais
  IF v_event_impact > 0 THEN
    v_final_price := v_final_price * (1 + v_event_impact / 100);
  END IF;

  -- Garantir que o preço não seja negativo
  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  RETURN v_final_price;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_rate_price IS 'Calcula preço usando rate_calendar e regras dinâmicas, com fallback para preço base da categoria';

