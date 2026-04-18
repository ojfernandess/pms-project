-- =====================================================
-- PREÇO POR QUANTIDADE DE HÓSPEDES (LIGA DE PREÇOS X)
-- =====================================================
-- Atualiza calculate_rate_price para usar a mesma lógica da grade ARI:
-- x1 = 1 hóspede, x2 = 2 (preço padrão), x3 = 3, x4 = 4+
-- Inclui flutuações salvas em rate_calendar (occupancy_1/3/4_fluctuation_*).
-- Motor de reservas e página pública de reserva passam a seguir essa liga.

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
  v_rule RECORD;
  v_adjustment DECIMAL(10,2);
  v_auto_apply_rules BOOLEAN := false;
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
  v_category_occupancy DECIMAL(5,2);
  v_total_rooms INTEGER;
  v_occupied_rooms INTEGER;
  v_room_count INTEGER;
  v_scale_factor DECIMAL(5,2);
  v_establishment_occupancy DECIMAL(5,2);
  v_establishment_total_rooms INTEGER;
  v_establishment_occupied_rooms INTEGER;
  v_occupancy_ranges JSONB;
  v_range_item JSONB;
  v_range_min DECIMAL(5,2);
  v_range_max DECIMAL(5,2);
  v_range_adjustment DECIMAL(10,2);
  v_range_base_value DECIMAL(10,2);
  v_matched_range BOOLEAN := false;
  v_occupancy_to_use DECIMAL(5,2);
  -- Liga de preços por quantidade de hóspedes (x1, x2, x3, x4)
  v_occupancy_slot INTEGER;      -- 1, 2, 3 ou 4
  v_price_by_occupancy DECIMAL(10,2);
  v_base_calc DECIMAL(10,2);
  v_occ1_type TEXT;
  v_occ1_val DECIMAL(10,2);
  v_occ3_type TEXT;
  v_occ3_val DECIMAL(10,2);
  v_occ4_type TEXT;
  v_occ4_val DECIMAL(10,2);
BEGIN
  -- 1. Buscar preço e flutuações do calendário (liga x1/x2/x3/x4)
  SELECT
    base_price,
    adult_price,
    child_price,
    occupancy_percentage,
    projected_occupancy,
    pickup_rate,
    occupancy_1_fluctuation_type,
    occupancy_1_fluctuation_value,
    occupancy_3_fluctuation_type,
    occupancy_3_fluctuation_value,
    occupancy_4_fluctuation_type,
    occupancy_4_fluctuation_value
  INTO
    v_base_price,
    v_adult_price,
    v_child_price,
    v_occupancy,
    v_projected_occupancy,
    v_pickup_rate,
    v_occ1_type,
    v_occ1_val,
    v_occ3_type,
    v_occ3_val,
    v_occ4_type,
    v_occ4_val
  FROM public.rate_calendar
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND pricing_plan_id = p_pricing_plan_id
    AND date = p_date
  LIMIT 1;

  -- Se não encontrou no calendário, usar preço base da categoria (sem liga x)
  IF v_base_price IS NULL THEN
    SELECT base_price INTO v_base_price
    FROM public.room_categories
    WHERE id = p_category_id;

    IF v_base_price IS NULL THEN
      RETURN 0;
    END IF;

    v_adult_price := COALESCE(v_adult_price, 0);
    v_occupancy := 0;
    v_projected_occupancy := 0;
    v_pickup_rate := 0;
    v_occ1_type := NULL;
    v_occ1_val := NULL;
    v_occ3_type := NULL;
    v_occ3_val := NULL;
    v_occ4_type := NULL;
    v_occ4_val := NULL;
  END IF;

  v_adult_price := COALESCE(v_adult_price, 0);

  -- 2. Preço por quantidade de hóspedes (liga x1, x2, x3, x4)
  v_occupancy_slot := LEAST(GREATEST(COALESCE(p_adults, 1), 1), 4);

  CASE v_occupancy_slot
    WHEN 1 THEN
      v_base_calc := GREATEST(0, v_base_price - v_adult_price);
      IF v_occ1_type IN ('fixed', 'percentage') AND v_occ1_val IS NOT NULL THEN
        IF v_occ1_type = 'percentage' THEN
          v_price_by_occupancy := v_base_calc * (1 + v_occ1_val / 100);
        ELSE
          v_price_by_occupancy := v_base_calc + v_occ1_val;
        END IF;
      ELSE
        v_price_by_occupancy := v_base_calc;
      END IF;
    WHEN 2 THEN
      v_price_by_occupancy := v_base_price;
    WHEN 3 THEN
      v_base_calc := v_base_price + v_adult_price;
      IF v_occ3_type IN ('fixed', 'percentage') AND v_occ3_val IS NOT NULL THEN
        IF v_occ3_type = 'percentage' THEN
          v_price_by_occupancy := v_base_calc * (1 + v_occ3_val / 100);
        ELSE
          v_price_by_occupancy := v_base_calc + v_occ3_val;
        END IF;
      ELSE
        v_price_by_occupancy := v_base_calc;
      END IF;
    ELSE
      -- 4 ou mais hóspedes -> preço x4
      v_base_calc := v_base_price + (v_adult_price * 2);
      IF v_occ4_type IN ('fixed', 'percentage') AND v_occ4_val IS NOT NULL THEN
        IF v_occ4_type = 'percentage' THEN
          v_price_by_occupancy := v_base_calc * (1 + v_occ4_val / 100);
        ELSE
          v_price_by_occupancy := v_base_calc + v_occ4_val;
        END IF;
      ELSE
        v_price_by_occupancy := v_base_calc;
      END IF;
  END CASE;

  v_price_by_occupancy := GREATEST(0, v_price_by_occupancy);

  -- Somar valor por criança
  IF p_children > 0 AND v_child_price IS NOT NULL AND v_child_price > 0 THEN
    v_final_price := v_price_by_occupancy + (v_child_price * p_children);
  ELSE
    v_final_price := v_price_by_occupancy;
  END IF;

  -- 3. Ocupação da categoria (para regras dinâmicas)
  SELECT COUNT(*) INTO v_total_rooms
  FROM public.rooms
  WHERE category_id = p_category_id
    AND establishment_id = p_establishment_id;

  SELECT COUNT(DISTINCT r.id) INTO v_occupied_rooms
  FROM public.rooms r
  INNER JOIN public.reservations res ON res.room_id = r.id
  WHERE r.category_id = p_category_id
    AND r.establishment_id = p_establishment_id
    AND res.status IN ('confirmed', 'checkedin')
    AND res.checkin_date <= p_date
    AND res.checkout_date > p_date
    AND (res.cancelled_at IS NULL);

  IF v_total_rooms > 0 THEN
    v_category_occupancy := (v_occupied_rooms::DECIMAL / v_total_rooms::DECIMAL) * 100;
  ELSE
    v_category_occupancy := 0;
  END IF;

  IF v_category_occupancy IS NOT NULL AND v_category_occupancy >= 0 THEN
    v_occupancy := v_category_occupancy;
  END IF;

  -- 4. Ocupação total do estabelecimento
  SELECT COUNT(*) INTO v_establishment_total_rooms
  FROM public.rooms
  WHERE establishment_id = p_establishment_id;

  SELECT COUNT(DISTINCT r.id) INTO v_establishment_occupied_rooms
  FROM public.rooms r
  INNER JOIN public.reservations res ON res.room_id = r.id
  WHERE r.establishment_id = p_establishment_id
    AND res.status IN ('confirmed', 'checkedin')
    AND res.checkin_date <= p_date
    AND res.checkout_date > p_date
    AND (res.cancelled_at IS NULL);

  IF v_establishment_total_rooms > 0 THEN
    v_establishment_occupancy := (v_establishment_occupied_rooms::DECIMAL / v_establishment_total_rooms::DECIMAL) * 100;
  ELSE
    v_establishment_occupancy := 0;
  END IF;

  -- 5. Fator de escala (número de quartos da categoria)
  v_room_count := v_total_rooms;
  IF v_room_count >= 10 THEN
    v_scale_factor := 1.0;
  ELSIF v_room_count >= 5 THEN
    v_scale_factor := 0.75 + ((v_room_count - 5)::DECIMAL / 4.0) * 0.25;
  ELSIF v_room_count >= 2 THEN
    v_scale_factor := 0.6 + ((v_room_count - 2)::DECIMAL / 2.0) * 0.15;
  ELSIF v_room_count = 1 THEN
    v_scale_factor := 0.5;
  ELSE
    v_scale_factor := 1.0;
  END IF;

  -- 6. Verificar auto_apply_dynamic_rules
  SELECT rate_system_settings INTO v_settings_json
  FROM public.hotel_settings
  WHERE establishment_id = p_establishment_id
  LIMIT 1;

  IF v_settings_json IS NOT NULL THEN
    BEGIN
      v_auto_apply_rules := (
        COALESCE(v_settings_json->>'auto_apply_dynamic_rules', 'false') = 'true'
        OR COALESCE(v_settings_json->>'auto_apply_dynamic_rules', 'false') = '1'
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_auto_apply_rules := false;
    END;
  END IF;

  -- Sem regras dinâmicas: retornar preço já pela liga de hóspedes (x1/x2/x3/x4)
  IF NOT v_auto_apply_rules THEN
    RETURN GREATEST(0, v_final_price);
  END IF;

  -- 7. A partir daqui: aplicar regras dinâmicas sobre o preço por ocupação
  v_current_day_of_week := EXTRACT(DOW FROM p_date);
  v_days_until_date := p_date - CURRENT_DATE;

  v_historical_price := NULL;
  v_current_year := EXTRACT(YEAR FROM p_date);
  v_current_month := EXTRACT(MONTH FROM p_date);
  v_historical_year := v_current_year - 1;
  BEGIN
    v_historical_date := (p_date - INTERVAL '1 year')::DATE;
    IF EXTRACT(MONTH FROM v_historical_date) != v_current_month THEN
      v_historical_date := (DATE_TRUNC('month', MAKE_DATE(v_historical_year, v_current_month, 1)) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;
    SELECT base_price INTO v_historical_price
    FROM public.rate_calendar
    WHERE establishment_id = p_establishment_id
      AND category_id = p_category_id
      AND pricing_plan_id = p_pricing_plan_id
      AND date = v_historical_date
      AND base_price > 0
    LIMIT 1;
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

  -- Loop de regras dinâmicas (usa v_final_price = preço por ocupação)
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
    v_trigger_condition := COALESCE(v_rule.trigger_condition, '{}'::jsonb);

    DECLARE
      v_should_apply BOOLEAN := false;
      v_applied_adjustment DECIMAL(10,2) := NULL;
      v_applied_base_value DECIMAL(10,2) := NULL;
    BEGIN
      -- Trigger: Ocupação
      IF v_rule.trigger_type = 'occupancy' THEN
        IF (v_rule.use_establishment_occupancy IS NOT NULL AND v_rule.use_establishment_occupancy = true) THEN
          v_occupancy_to_use := v_establishment_occupancy;
        ELSIF (v_rule.use_occupancy IS NULL OR v_rule.use_occupancy = true) THEN
          v_occupancy_to_use := v_category_occupancy;
        ELSE
          v_occupancy_to_use := NULL;
        END IF;

        IF v_occupancy_to_use IS NOT NULL AND v_occupancy_to_use >= 0 THEN
          IF v_trigger_condition ? 'occupancy_ranges' AND jsonb_typeof(v_trigger_condition->'occupancy_ranges') = 'array' THEN
            v_occupancy_ranges := v_trigger_condition->'occupancy_ranges';
            v_matched_range := false;
            FOR v_range_item IN SELECT * FROM jsonb_array_elements(v_occupancy_ranges)
            LOOP
              BEGIN
                v_range_min := (v_range_item->>'min')::DECIMAL;
                v_range_max := (v_range_item->>'max')::DECIMAL;
                v_range_adjustment := (v_range_item->>'adjustment')::DECIMAL;
                IF v_range_item ? 'base_value' AND v_range_item->>'base_value' IS NOT NULL AND v_range_item->>'base_value' != 'null' THEN
                  v_range_base_value := (v_range_item->>'base_value')::DECIMAL;
                ELSE
                  v_range_base_value := NULL;
                END IF;
                IF v_occupancy_to_use >= v_range_min AND v_occupancy_to_use <= v_range_max THEN
                  v_matched_range := true;
                  v_should_apply := true;
                  IF v_range_base_value IS NOT NULL THEN
                    v_applied_base_value := v_range_base_value;
                  ELSE
                    v_applied_base_value := v_final_price;
                  END IF;
                  v_applied_adjustment := v_range_adjustment * v_scale_factor;
                  EXIT;
                END IF;
              EXCEPTION
                WHEN OTHERS THEN
                  CONTINUE;
              END;
            END LOOP;
          ELSE
            BEGIN
              v_min_occupancy := (v_trigger_condition->>'min_occupancy')::DECIMAL;
              v_max_occupancy := (v_trigger_condition->>'max_occupancy')::DECIMAL;
            EXCEPTION
              WHEN OTHERS THEN
                v_min_occupancy := NULL;
                v_max_occupancy := NULL;
            END;
            IF v_min_occupancy IS NULL AND v_max_occupancy IS NULL THEN
              IF v_occupancy_to_use > 0 THEN
                v_should_apply := true;
                v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
              END IF;
            ELSE
              IF v_min_occupancy IS NULL THEN v_min_occupancy := 0; END IF;
              IF v_max_occupancy IS NULL THEN v_max_occupancy := 100; END IF;
              IF v_occupancy_to_use >= v_min_occupancy AND v_occupancy_to_use <= v_max_occupancy THEN
                v_should_apply := true;
                v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

      -- Trigger: Booking velocity
      IF v_rule.trigger_type = 'booking_velocity' THEN
        IF (v_rule.use_pickup_rate IS NULL OR v_rule.use_pickup_rate = true) AND v_pickup_rate IS NOT NULL AND v_pickup_rate >= 0 THEN
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
          ELSIF v_pickup_rate >= v_min_bookings THEN
            v_should_apply := true;
            v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
          END IF;
        END IF;
      END IF;

      -- Trigger: Day of week
      IF v_rule.trigger_type = 'day_of_week' THEN
        BEGIN
          IF v_trigger_condition ? 'days' AND jsonb_typeof(v_trigger_condition->'days') = 'array' THEN
            SELECT array_agg(elem::INTEGER) INTO v_days_of_week FROM jsonb_array_elements_text(v_trigger_condition->'days') AS elem;
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

      -- Trigger: Advance booking
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

      -- Trigger: Custom
      IF v_rule.trigger_type = 'custom' THEN
        v_should_apply := true;
        v_applied_adjustment := v_rule.adjustment_value * v_scale_factor;
      END IF;

      IF v_should_apply THEN
        DECLARE
          v_price_to_adjust DECIMAL(10,2);
          v_final_adjustment DECIMAL(10,2);
        BEGIN
          IF (v_rule.use_demand_history IS NULL OR v_rule.use_demand_history = true) AND v_historical_price IS NOT NULL AND v_historical_price > 0 THEN
            v_price_to_adjust := v_historical_price;
          ELSIF v_applied_base_value IS NOT NULL THEN
            v_price_to_adjust := v_applied_base_value;
          ELSE
            v_price_to_adjust := v_final_price;
          END IF;

          IF v_applied_adjustment IS NOT NULL THEN
            v_final_adjustment := v_applied_adjustment;
          ELSE
            v_final_adjustment := v_rule.adjustment_value * v_scale_factor;
          END IF;

          IF v_rule.adjustment_type = 'percentage' THEN
            v_final_price := v_price_to_adjust * (1 + (v_final_adjustment / 100));
          ELSIF v_rule.adjustment_type = 'fixed' THEN
            v_final_price := v_price_to_adjust + v_final_adjustment;
          ELSIF v_rule.adjustment_type = 'multiplier' THEN
            DECLARE
              v_base_multiplier DECIMAL(5,2);
              v_scaled_multiplier DECIMAL(5,2);
            BEGIN
              v_base_multiplier := v_rule.adjustment_value;
              v_scaled_multiplier := 1.0 + ((v_base_multiplier - 1.0) * v_scale_factor);
              v_final_price := v_price_to_adjust * v_scaled_multiplier;
            END;
          END IF;

          v_rules_applied := v_rules_applied + 1;
        END;
      END IF;
    END;
  END LOOP;

  -- Garantir não negativo
  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  RETURN v_final_price;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_rate_price IS 'Calcula preço por quantidade de hóspedes (liga x1/x2/x3/x4) usando rate_calendar e flutuações por ocupação. Motor de reservas e página pública seguem essa liga. Suporta regras dinâmicas quando auto_apply_dynamic_rules está habilitado.';
