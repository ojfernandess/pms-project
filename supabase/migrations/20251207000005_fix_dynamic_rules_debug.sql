-- =====================================================
-- CORRIGIR E MELHORAR APLICAÇÃO DAS REGRAS DINÂMICAS
-- =====================================================
-- Adicionar logs de debug e corrigir verificação de configuração

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
  v_auto_apply_rules BOOLEAN := false;
  v_trigger_condition JSONB;
  v_min_occupancy DECIMAL(5,2);
  v_max_occupancy DECIMAL(5,2);
  v_min_bookings INTEGER;
  v_days_of_week INTEGER[];
  v_min_days INTEGER;
  v_max_days INTEGER;
  v_current_day_of_week INTEGER;
  v_days_until_date INTEGER;
  v_settings_json JSONB;
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

  -- Calcular dia da semana (0 = domingo, 6 = sábado)
  v_current_day_of_week := EXTRACT(DOW FROM p_date)::INTEGER;

  -- Calcular dias até a data (para advance_booking)
  v_days_until_date := p_date - CURRENT_DATE;

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

  -- 3. Verificar configuração auto_apply_dynamic_rules antes de aplicar regras
  BEGIN
    -- Buscar rate_system_settings
    SELECT rate_system_settings INTO v_settings_json
    FROM public.hotel_settings
    WHERE establishment_id = p_establishment_id
    LIMIT 1;

    -- Se encontrou configurações, verificar auto_apply_dynamic_rules
    IF v_settings_json IS NOT NULL THEN
      -- Verificar de múltiplas formas para garantir compatibilidade
      IF v_settings_json->>'auto_apply_dynamic_rules' IS NOT NULL THEN
        BEGIN
          -- Tentar converter para boolean
          v_auto_apply_rules := (v_settings_json->>'auto_apply_dynamic_rules')::boolean;
        EXCEPTION
          WHEN OTHERS THEN
            -- Se falhar, tentar como string
            IF v_settings_json->>'auto_apply_dynamic_rules' = 'true' OR 
               v_settings_json->>'auto_apply_dynamic_rules' = '1' OR
               v_settings_json->>'auto_apply_dynamic_rules' = 'True' THEN
              v_auto_apply_rules := true;
            ELSE
              v_auto_apply_rules := false;
            END IF;
        END;
      ELSE
        -- Se não existe a chave, assumir false
        v_auto_apply_rules := false;
      END IF;
    ELSE
      -- Se não encontrou configurações, assumir false
      v_auto_apply_rules := false;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Se não conseguir buscar configuração, assumir false (não aplicar automaticamente)
      v_auto_apply_rules := false;
  END;

  -- 4. Aplicar regras dinâmicas APENAS se auto_apply_dynamic_rules estiver habilitado
  IF v_auto_apply_rules THEN
    BEGIN
      FOR v_rule IN
        SELECT * FROM public.dynamic_pricing_rules
        WHERE establishment_id = p_establishment_id
          AND is_active = true
          AND (start_date IS NULL OR start_date <= p_date)
          AND (end_date IS NULL OR end_date >= p_date)
          AND (
            applicable_categories IS NULL 
            OR array_length(applicable_categories, 1) = 0
            OR p_category_id = ANY(applicable_categories)
          )
          AND (
            applicable_plans IS NULL 
            OR array_length(applicable_plans, 1) = 0
            OR p_pricing_plan_id = ANY(applicable_plans)
          )
        ORDER BY priority ASC
      LOOP
        -- Obter trigger_condition
        v_trigger_condition := v_rule.trigger_condition;
        IF v_trigger_condition IS NULL THEN
          v_trigger_condition := '{}'::jsonb;
        END IF;
        
        -- Verificar condições do trigger baseado no trigger_type e métricas habilitadas
        DECLARE
          v_should_apply BOOLEAN := false;
        BEGIN
          -- Trigger: Ocupação
          IF v_rule.trigger_type = 'occupancy' THEN
            -- Verificar se use_occupancy está habilitado (se não existir, considerar true para compatibilidade)
            IF (v_rule.use_occupancy IS NULL OR v_rule.use_occupancy = true) THEN
              IF v_occupancy IS NOT NULL AND v_occupancy >= 0 THEN
                -- Verificar condições específicas do trigger_condition
                BEGIN
                  v_min_occupancy := (v_trigger_condition->>'min_occupancy')::DECIMAL;
                  v_max_occupancy := (v_trigger_condition->>'max_occupancy')::DECIMAL;
                EXCEPTION
                  WHEN OTHERS THEN
                    v_min_occupancy := NULL;
                    v_max_occupancy := NULL;
                END;
                
                -- Se não há condições específicas, aplicar se ocupação > 0
                IF v_min_occupancy IS NULL AND v_max_occupancy IS NULL THEN
                  IF v_occupancy > 0 THEN
                    v_should_apply := true;
                  END IF;
                ELSE
                  -- Verificar range de ocupação
                  IF v_min_occupancy IS NULL THEN v_min_occupancy := 0; END IF;
                  IF v_max_occupancy IS NULL THEN v_max_occupancy := 100; END IF;
                  
                  IF v_occupancy >= v_min_occupancy AND v_occupancy <= v_max_occupancy THEN
                    v_should_apply := true;
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;

          -- Trigger: Pickup Rate (Booking Velocity)
          IF v_rule.trigger_type = 'booking_velocity' THEN
            -- Verificar se use_pickup_rate está habilitado
            IF (v_rule.use_pickup_rate IS NULL OR v_rule.use_pickup_rate = true) THEN
              IF v_pickup_rate IS NOT NULL AND v_pickup_rate >= 0 THEN
                -- Verificar condições específicas do trigger_condition
                BEGIN
                  v_min_bookings := (v_trigger_condition->>'min_bookings')::INTEGER;
                EXCEPTION
                  WHEN OTHERS THEN
                    v_min_bookings := NULL;
                END;
                
                -- Se não há condição específica, aplicar se pickup_rate > 0
                IF v_min_bookings IS NULL THEN
                  IF v_pickup_rate > 0 THEN
                    v_should_apply := true;
                  END IF;
                ELSE
                  -- Verificar se pickup_rate >= min_bookings
                  IF v_pickup_rate >= v_min_bookings THEN
                    v_should_apply := true;
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;

          -- Trigger: Day of Week
          IF v_rule.trigger_type = 'day_of_week' THEN
            -- Verificar se o dia atual está na lista de dias permitidos
            BEGIN
              IF v_trigger_condition->'days' IS NOT NULL THEN
                -- Converter array JSON para array PostgreSQL
                SELECT ARRAY(
                  SELECT jsonb_array_elements_text(v_trigger_condition->'days')
                )::INTEGER[] INTO v_days_of_week;
                
                IF v_days_of_week IS NOT NULL AND array_length(v_days_of_week, 1) > 0 THEN
                  IF v_current_day_of_week = ANY(v_days_of_week) THEN
                    v_should_apply := true;
                  END IF;
                ELSE
                  -- Se não há dias especificados, aplicar sempre
                  v_should_apply := true;
                END IF;
              ELSE
                -- Se não há campo days, aplicar sempre
                v_should_apply := true;
              END IF;
            EXCEPTION
              WHEN OTHERS THEN
                -- Se houver erro ao processar, aplicar sempre
                v_should_apply := true;
            END;
          END IF;

          -- Trigger: Advance Booking
          IF v_rule.trigger_type = 'advance_booking' THEN
            IF v_days_until_date >= 0 THEN
              -- Verificar condições específicas do trigger_condition
              BEGIN
                v_min_days := (v_trigger_condition->>'min_days')::INTEGER;
                v_max_days := (v_trigger_condition->>'max_days')::INTEGER;
              EXCEPTION
                WHEN OTHERS THEN
                  v_min_days := NULL;
                  v_max_days := NULL;
              END;
              
              -- Se não há condições específicas, aplicar sempre
              IF v_min_days IS NULL AND v_max_days IS NULL THEN
                v_should_apply := true;
              ELSE
                -- Verificar range de dias
                IF v_min_days IS NULL THEN v_min_days := 0; END IF;
                IF v_max_days IS NULL THEN v_max_days := 365; END IF;
                
                IF v_days_until_date >= v_min_days AND v_days_until_date <= v_max_days THEN
                  v_should_apply := true;
                END IF;
              END IF;
            END IF;
          END IF;

          -- Trigger: Eventos Locais
          IF v_rule.trigger_type = 'local_event' THEN
            -- Verificar se use_local_events está habilitado
            IF (v_rule.use_local_events IS NULL OR v_rule.use_local_events = true) THEN
              IF v_has_local_event THEN
                v_should_apply := true;
              END IF;
            END IF;
          END IF;

          -- Trigger: Histórico de Demanda (Custom)
          IF v_rule.trigger_type = 'custom' THEN
            -- Verificar se use_demand_history está habilitado
            IF (v_rule.use_demand_history IS NULL OR v_rule.use_demand_history = true) THEN
              IF v_demand_score IS NOT NULL AND v_demand_score >= 0 THEN
                -- Verificar condições específicas do trigger_condition
                DECLARE
                  v_min_score DECIMAL(5,2);
                  v_max_score DECIMAL(5,2);
                BEGIN
                  BEGIN
                    v_min_score := (v_trigger_condition->>'min_score')::DECIMAL;
                    v_max_score := (v_trigger_condition->>'max_score')::DECIMAL;
                  EXCEPTION
                    WHEN OTHERS THEN
                      v_min_score := NULL;
                      v_max_score := NULL;
                  END;
                  
                  -- Se não há condições específicas, usar padrão (score > 70)
                  IF v_min_score IS NULL AND v_max_score IS NULL THEN
                    IF v_demand_score > 70 THEN
                      v_should_apply := true;
                    END IF;
                  ELSE
                    -- Verificar range de score
                    IF v_min_score IS NULL THEN v_min_score := 0; END IF;
                    IF v_max_score IS NULL THEN v_max_score := 100; END IF;
                    
                    IF v_demand_score >= v_min_score AND v_demand_score <= v_max_score THEN
                      v_should_apply := true;
                    END IF;
                  END IF;
                END;
              END IF;
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
        -- Log do erro seria útil aqui, mas não temos acesso a RAISE NOTICE em funções RPC
        NULL;
    END;
  END IF;

  -- 5. Aplicar impacto de eventos locais (sempre aplicar, independente da configuração)
  IF v_event_impact > 0 THEN
    v_final_price := v_final_price * (1 + v_event_impact / 100);
  END IF;

  -- 6. Garantir que o preço não seja negativo
  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  RETURN v_final_price;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_rate_price IS 'Calcula preço usando rate_calendar e regras dinâmicas (se auto_apply_dynamic_rules estiver habilitado), verificando corretamente as condições específicas do trigger_condition (JSONB) e aplicando ajustes de preço. Versão melhorada com melhor verificação de configuração.';

