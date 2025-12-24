-- =====================================================
-- SIMPLIFICAR REGRAS DINÂMICAS COM FAIXAS DE OCUPAÇÃO
-- =====================================================
-- Esta versão suporta o novo formato de faixas de ocupação
-- com três níveis: Baixa, Média e Alta Ocupação

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
  v_auto_apply_rules BOOLEAN := false;
  -- Variáveis para histórico de demanda
  v_historical_price DECIMAL(10,2);
  v_historical_date DATE;
  v_historical_year INTEGER;
  v_historical_month INTEGER;
  v_current_year INTEGER;
  v_current_month INTEGER;
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
  v_rules_applied INTEGER := 0;
  v_rules_found INTEGER := 0;
  -- Variáveis para ocupação por categoria
  v_category_occupancy DECIMAL(5,2);
  v_total_rooms INTEGER;
  v_occupied_rooms INTEGER;
  v_room_count INTEGER;
  v_scale_factor DECIMAL(5,2); -- Fator de escala baseado na quantidade de quartos
  -- Variáveis para novo formato de faixas
  v_occupancy_ranges JSONB;
  v_range_item JSONB;
  v_range_min DECIMAL(5,2);
  v_range_max DECIMAL(5,2);
  v_range_adjustment DECIMAL(10,2);
  v_range_base_value DECIMAL(10,2);
  v_matched_range BOOLEAN := false;
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

    -- Calcular métricas se não estão no calendário
    v_occupancy := 0;
    v_projected_occupancy := 0;
    v_pickup_rate := 0;
  END IF;

  -- 2. CALCULAR OCUPAÇÃO ESPECÍFICA DA CATEGORIA
  -- Contar total de quartos na categoria
  SELECT COUNT(*) INTO v_total_rooms
  FROM public.rooms
  WHERE category_id = p_category_id
    AND establishment_id = p_establishment_id;

  -- Contar quartos ocupados na categoria para a data específica
  SELECT COUNT(DISTINCT r.id) INTO v_occupied_rooms
  FROM public.rooms r
  INNER JOIN public.reservations res ON res.room_id = r.id
  WHERE r.category_id = p_category_id
    AND r.establishment_id = p_establishment_id
    AND res.status IN ('confirmed', 'checkedin')
    AND res.checkin_date <= p_date
    AND res.checkout_date > p_date
    AND (res.cancelled_at IS NULL);

  -- Calcular ocupação da categoria
  IF v_total_rooms > 0 THEN
    v_category_occupancy := (v_occupied_rooms::DECIMAL / v_total_rooms::DECIMAL) * 100;
  ELSE
    v_category_occupancy := 0;
  END IF;

  IF v_category_occupancy IS NOT NULL AND v_category_occupancy >= 0 THEN
    v_occupancy := v_category_occupancy;
  END IF;

  -- 3. Calcular fator de escala baseado no número de quartos
  -- ⚖️ Ajustes Proporcionais Automáticos:
  -- 10+ quartos: 100% do ajuste
  -- 5-9 quartos: 75-100% do ajuste (linear)
  -- 2-4 quartos: 60-75% do ajuste (linear)
  -- 1 quarto: 50% do ajuste
  v_room_count := v_total_rooms;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0; -- 100% do ajuste
  ELSIF v_room_count >= 5 THEN
    -- 5 quartos = 75%, 9 quartos = 100%
    -- Fórmula: 0.75 + ((count - 5) / (9 - 5)) * (1.0 - 0.75)
    -- Simplificando: 0.75 + ((count - 5) / 4.0) * 0.25
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25; -- 75-100%
  ELSIF v_room_count >= 2 THEN
    -- 2 quartos = 60%, 4 quartos = 75%
    -- Fórmula: 0.6 + ((count - 2) / (4 - 2)) * (0.75 - 0.6)
    -- Simplificando: 0.6 + ((count - 2) / 2.0) * 0.15
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15; -- 60-75%
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5; -- 50% do ajuste
  ELSE
    v_scale_factor := 1.0; -- Fallback (0 quartos ou NULL)
  END IF;

  -- 4. Verificar se auto_apply_dynamic_rules está habilitado
  SELECT rate_system_settings INTO v_settings_json
  FROM public.hotel_settings
  WHERE establishment_id = p_establishment_id
  LIMIT 1;

  IF v_settings_json IS NOT NULL THEN
    -- Verificar auto_apply_dynamic_rules de forma robusta
    DECLARE
      v_auto_apply_value TEXT;
    BEGIN
      v_auto_apply_value := COALESCE(
        v_settings_json->>'auto_apply_dynamic_rules',
        'false'
      );
      
      v_auto_apply_rules := (
        v_auto_apply_value = 'true' OR
        v_auto_apply_value = '1' OR
        v_auto_apply_value = 'True' OR
        v_auto_apply_value = 'TRUE' OR
        (v_settings_json->>'auto_apply_dynamic_rules')::BOOLEAN = true
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_auto_apply_rules := false;
    END;
  END IF;

  -- Se não está habilitado, retornar preço base
  IF NOT v_auto_apply_rules THEN
    RETURN v_base_price;
  END IF;

  -- 5. Calcular data atual e dias até a data
  v_current_day_of_week := EXTRACT(DOW FROM p_date);
  v_days_until_date := p_date - CURRENT_DATE;

  -- 6. Buscar histórico de demanda (mesmo mês do ano anterior)
  -- Busca valores do tarifário do mesmo mês do ano anterior para considerar histórico
  v_historical_price := NULL;
  v_current_year := EXTRACT(YEAR FROM p_date);
  v_current_month := EXTRACT(MONTH FROM p_date);
  v_historical_year := v_current_year - 1;
  
  BEGIN
    -- Primeiro, tentar buscar na mesma data do ano anterior
    v_historical_date := (p_date - INTERVAL '1 year')::DATE;
    
    -- Se a data não existe (ex: 29/02 em ano não bissexto), ajustar para o último dia do mês
    IF EXTRACT(MONTH FROM v_historical_date) != v_current_month THEN
      -- Usar último dia do mês do ano anterior
      v_historical_date := (DATE_TRUNC('month', MAKE_DATE(v_historical_year, v_current_month, 1)) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;
    
    -- Buscar preço histórico na data específica
    SELECT base_price INTO v_historical_price
    FROM public.rate_calendar
    WHERE establishment_id = p_establishment_id
      AND category_id = p_category_id
      AND pricing_plan_id = p_pricing_plan_id
      AND date = v_historical_date
      AND base_price > 0
    LIMIT 1;
    
    -- Se não encontrou na data exata, buscar média do mesmo mês do ano anterior
    IF v_historical_price IS NULL THEN
      SELECT AVG(base_price) INTO v_historical_price
      FROM public.rate_calendar
      WHERE establishment_id = p_establishment_id
        AND category_id = p_category_id
        AND pricing_plan_id = p_pricing_plan_id
        AND EXTRACT(YEAR FROM date) = v_historical_year
        AND EXTRACT(MONTH FROM date) = v_current_month
        AND base_price > 0;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_historical_price := NULL;
  END;

  -- 7. APLICAR REGRAS DINÂMICAS
  v_final_price := v_base_price;
  
  FOR v_rule IN
    SELECT *
    FROM public.dynamic_pricing_rules
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
    ORDER BY priority ASC, created_at ASC
  LOOP
    v_rules_found := v_rules_found + 1;
    
    -- Obter trigger_condition
    v_trigger_condition := COALESCE(v_rule.trigger_condition, '{}'::jsonb);
    
    -- Verificar condições do trigger baseado no trigger_type
    DECLARE
      v_should_apply BOOLEAN := false;
      v_applied_adjustment DECIMAL(10,2) := NULL; -- NULL indica que não foi definido ainda
      v_applied_base_value DECIMAL(10,2) := NULL;
    BEGIN
      -- Trigger: Ocupação (NOVO FORMATO COM FAIXAS)
      IF v_rule.trigger_type = 'occupancy' THEN
        IF (v_rule.use_occupancy IS NULL OR v_rule.use_occupancy = true) THEN
          IF v_category_occupancy IS NOT NULL AND v_category_occupancy >= 0 THEN
            -- Verificar se tem o novo formato de faixas
            IF v_trigger_condition ? 'occupancy_ranges' AND jsonb_typeof(v_trigger_condition->'occupancy_ranges') = 'array' THEN
              -- NOVO FORMATO: Processar faixas de ocupação
              v_occupancy_ranges := v_trigger_condition->'occupancy_ranges';
              v_matched_range := false;
              
              -- Iterar sobre as faixas
              FOR v_range_item IN SELECT * FROM jsonb_array_elements(v_occupancy_ranges)
              LOOP
                BEGIN
                  v_range_min := (v_range_item->>'min')::DECIMAL;
                  v_range_max := (v_range_item->>'max')::DECIMAL;
                  v_range_adjustment := (v_range_item->>'adjustment')::DECIMAL;
                  
                  -- Verificar se base_value existe e não é null
                  IF v_range_item ? 'base_value' AND v_range_item->>'base_value' IS NOT NULL AND v_range_item->>'base_value' != 'null' THEN
                    v_range_base_value := (v_range_item->>'base_value')::DECIMAL;
                  ELSE
                    v_range_base_value := NULL;
                  END IF;
                  
                  -- Verificar se a ocupação está dentro desta faixa
                  IF v_category_occupancy >= v_range_min AND v_category_occupancy <= v_range_max THEN
                    v_matched_range := true;
                    v_should_apply := true;
                    
                    -- Usar base_value se definido, senão usar v_final_price atual
                    IF v_range_base_value IS NOT NULL THEN
                      v_applied_base_value := v_range_base_value;
                    ELSE
                      v_applied_base_value := v_final_price;
                    END IF;
                    
                    -- Calcular ajuste proporcional
                    v_applied_adjustment := v_range_adjustment * v_scale_factor;
                    
                    EXIT; -- Sair do loop quando encontrar a faixa correspondente
                  END IF;
                EXCEPTION
                  WHEN OTHERS THEN
                    -- Continuar para próxima faixa em caso de erro
                    CONTINUE;
                END;
              END LOOP;
            ELSE
              -- FORMATO ANTIGO: Compatibilidade retroativa
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
                IF v_category_occupancy > 0 THEN
                  v_should_apply := true;
                  v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
                END IF;
              ELSE
                IF v_min_occupancy IS NULL THEN v_min_occupancy := 0; END IF;
                IF v_max_occupancy IS NULL THEN v_max_occupancy := 100; END IF;
                
                IF v_category_occupancy >= v_min_occupancy AND v_category_occupancy <= v_max_occupancy THEN
                  v_should_apply := true;
                  v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
                END IF;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

      -- Trigger: Pickup Rate (Booking Velocity)
      IF v_rule.trigger_type = 'booking_velocity' THEN
        IF (v_rule.use_pickup_rate IS NULL OR v_rule.use_pickup_rate = true) THEN
          IF v_pickup_rate IS NOT NULL AND v_pickup_rate >= 0 THEN
            BEGIN
              v_min_bookings := (v_trigger_condition->>'min_bookings')::INTEGER;
            EXCEPTION
              WHEN OTHERS THEN
                v_min_bookings := NULL;
            END;
            
            IF v_min_bookings IS NULL THEN
              IF v_pickup_rate > 0 THEN
                v_should_apply := true;
                v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
              END IF;
            ELSE
              IF v_pickup_rate >= v_min_bookings THEN
                v_should_apply := true;
                v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

      -- Trigger: Day of Week
      IF v_rule.trigger_type = 'day_of_week' THEN
        BEGIN
          IF v_trigger_condition ? 'days' AND jsonb_typeof(v_trigger_condition->'days') = 'array' THEN
            SELECT ARRAY(
              SELECT jsonb_array_elements_text(v_trigger_condition->'days')
            )::INTEGER[] INTO v_days_of_week;
            
            IF v_days_of_week IS NOT NULL AND array_length(v_days_of_week, 1) > 0 THEN
              IF v_current_day_of_week = ANY(v_days_of_week) THEN
                v_should_apply := true;
                v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
              END IF;
            ELSE
              v_should_apply := true;
              v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
            END IF;
          ELSE
            v_should_apply := true;
            v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
          END IF;
        EXCEPTION
          WHEN OTHERS THEN
            v_should_apply := true;
            v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
        END;
      END IF;

      -- Trigger: Advance Booking
      IF v_rule.trigger_type = 'advance_booking' THEN
        IF v_days_until_date >= 0 THEN
          BEGIN
            v_min_days := (v_trigger_condition->>'min_days')::INTEGER;
            v_max_days := (v_trigger_condition->>'max_days')::INTEGER;
          EXCEPTION
            WHEN OTHERS THEN
              v_min_days := NULL;
              v_max_days := NULL;
          END;
          
          IF v_min_days IS NULL AND v_max_days IS NULL THEN
            v_should_apply := true;
            v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
          ELSE
            IF v_min_days IS NULL THEN v_min_days := 0; END IF;
            IF v_max_days IS NULL THEN v_max_days := 365; END IF;
            
            IF v_days_until_date >= v_min_days AND v_days_until_date <= v_max_days THEN
              v_should_apply := true;
              v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
            END IF;
          END IF;
        END IF;
      END IF;

      -- Trigger: Custom (Personalizado)
      IF v_rule.trigger_type = 'custom' THEN
        -- Para regras personalizadas, aplicar se não houver condições específicas
        -- ou se as condições customizadas forem atendidas
        DECLARE
          v_custom_condition_met BOOLEAN := true;
        BEGIN
          -- Verificar condições customizadas se existirem
          IF v_trigger_condition ? 'conditions' THEN
            -- Aqui pode ser implementada lógica customizada específica
            -- Por enquanto, aplicar se não houver condições específicas
            v_custom_condition_met := true;
          END IF;
          
          IF v_custom_condition_met THEN
            v_should_apply := true;
            v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
          END IF;
        END;
      END IF;

          -- Aplicar ajuste se a regra deve ser aplicada
      IF v_should_apply THEN
        DECLARE
          v_price_to_adjust DECIMAL(10,2);
        BEGIN
          -- Se use_demand_history está ativo e temos preço histórico, usar o histórico como base
          IF (v_rule.use_demand_history IS NULL OR v_rule.use_demand_history = true) AND v_historical_price IS NOT NULL AND v_historical_price > 0 THEN
            -- Usar preço histórico do mesmo mês do ano anterior como base
            v_price_to_adjust := v_historical_price;
          ELSIF v_applied_base_value IS NOT NULL THEN
            -- Usar base_value se definido
            v_price_to_adjust := v_applied_base_value;
          ELSE
            -- Usar preço atual
            v_price_to_adjust := v_final_price;
          END IF;
          
          -- Aplicar ajuste baseado no tipo
          -- Se v_applied_adjustment foi definido (faixas de ocupação), usar ele
          -- Caso contrário, usar v_rule.adjustment_value com escala
          DECLARE
            v_final_adjustment DECIMAL(10,2);
          BEGIN
            IF v_applied_adjustment IS NOT NULL THEN
              -- Usar ajuste já calculado (faixas de ocupação)
              v_final_adjustment := v_applied_adjustment;
            ELSE
              -- Usar adjustment_value com escala proporcional
              v_final_adjustment := v_rule.adjustment_value * v_scale_factor;
            END IF;
            
            IF v_rule.adjustment_type = 'percentage' THEN
              v_final_price := v_price_to_adjust * (1 + (v_final_adjustment / 100));
            ELSIF v_rule.adjustment_type = 'fixed' THEN
              v_final_price := v_price_to_adjust + v_final_adjustment;
            ELSIF v_rule.adjustment_type = 'multiplier' THEN
              -- Para multiplicador, aplicar escala proporcional
              DECLARE
                v_base_multiplier DECIMAL(5,2);
                v_scaled_multiplier DECIMAL(5,2);
              BEGIN
                v_base_multiplier := v_rule.adjustment_value;
                v_scaled_multiplier := 1.0 + ((v_base_multiplier - 1.0) * v_scale_factor);
                v_final_price := v_price_to_adjust * v_scaled_multiplier;
              END;
            END IF;
          END;
          
          v_rules_applied := v_rules_applied + 1;
        END;
      END IF;
    END;
  END LOOP;

  -- Garantir que o preço não seja negativo
  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  RETURN v_final_price;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_rate_price IS 'Calcula preço usando rate_calendar e regras dinâmicas com suporte a faixas de ocupação (Baixa, Média, Alta). Mantém compatibilidade com formato antigo. Aplica ajustes proporcionais baseados no número de quartos.';

