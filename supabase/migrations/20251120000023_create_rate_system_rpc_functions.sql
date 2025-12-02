-- ============================================
-- RPC Functions para Sistema Tarifário
-- ============================================

-- 1. Função para calcular breakdown de tarifa
CREATE OR REPLACE FUNCTION calculate_rate_breakdown(
  p_establishment_id UUID,
  p_category_id UUID,
  p_pricing_plan_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_adults INTEGER DEFAULT 1,
  p_children INTEGER DEFAULT 0
)
RETURNS TABLE (
  date DATE,
  base_price NUMERIC,
  adjustments JSONB,
  final_price NUMERIC,
  restrictions JSONB
) AS $$
DECLARE
  v_date DATE;
  v_base_price NUMERIC;
  v_final_price NUMERIC;
  v_adjustments JSONB := '[]'::JSONB;
  v_restrictions JSONB := '{}'::JSONB;
BEGIN
  FOR v_date IN SELECT generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day')::DATE
  LOOP
    -- Calcular preço base
    SELECT calculate_rate_price(
      p_establishment_id,
      p_category_id,
      p_pricing_plan_id,
      v_date,
      p_adults,
      p_children
    ) INTO v_base_price;
    
    -- Buscar restrições ativas
    SELECT jsonb_build_object(
      'stop_sell', EXISTS(
        SELECT 1 FROM rate_restrictions
        WHERE establishment_id = p_establishment_id
        AND category_id = p_category_id
        AND restriction_type = 'stop_sell'
        AND is_active = true
        AND v_date BETWEEN start_date AND end_date
      ),
      'min_los', (
        SELECT value FROM rate_restrictions
        WHERE establishment_id = p_establishment_id
        AND category_id = p_category_id
        AND restriction_type = 'min_los'
        AND is_active = true
        AND v_date BETWEEN start_date AND end_date
        ORDER BY value DESC
        LIMIT 1
      ),
      'cta', EXISTS(
        SELECT 1 FROM rate_restrictions
        WHERE establishment_id = p_establishment_id
        AND category_id = p_category_id
        AND restriction_type = 'cta'
        AND is_active = true
        AND v_date = start_date
      ),
      'ctd', EXISTS(
        SELECT 1 FROM rate_restrictions
        WHERE establishment_id = p_establishment_id
        AND category_id = p_category_id
        AND restriction_type = 'ctd'
        AND is_active = true
        AND v_date = end_date
      )
    ) INTO v_restrictions;
    
    v_final_price := v_base_price;
    
    RETURN QUERY SELECT v_date, v_base_price, v_adjustments, v_final_price, v_restrictions;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Função para aplicar regras dinâmicas em lote
CREATE OR REPLACE FUNCTION apply_dynamic_rules_batch(
  p_establishment_id UUID,
  p_date_range DATERANGE,
  p_category_ids UUID[] DEFAULT NULL,
  p_rule_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_rule RECORD;
  v_date DATE;
  v_category_id UUID;
  v_rate_entry RECORD;
  v_new_price NUMERIC;
  v_base_price NUMERIC;
BEGIN
  -- Se não especificou regras, usar todas as ativas
  FOR v_rule IN
    SELECT * FROM dynamic_pricing_rules
    WHERE establishment_id = p_establishment_id
    AND is_active = true
    AND (p_rule_ids IS NULL OR id = ANY(p_rule_ids))
    AND (
      start_date IS NULL OR start_date <= UPPER(p_date_range)
    )
    AND (
      end_date IS NULL OR end_date >= LOWER(p_date_range)
    )
    ORDER BY priority ASC
  LOOP
    -- Iterar sobre as datas
    FOR v_date IN SELECT generate_series(LOWER(p_date_range), UPPER(p_date_range) - INTERVAL '1 day', INTERVAL '1 day')::DATE
    LOOP
      -- Verificar se a data está no período da regra
      IF (v_rule.start_date IS NULL OR v_date >= v_rule.start_date) AND
         (v_rule.end_date IS NULL OR v_date <= v_rule.end_date) THEN
        
        -- Iterar sobre categorias
        FOR v_category_id IN
          SELECT id FROM room_categories
          WHERE establishment_id = p_establishment_id
          AND (p_category_ids IS NULL OR id = ANY(p_category_ids))
          AND (v_rule.applicable_categories IS NULL OR id = ANY(v_rule.applicable_categories::UUID[]))
        LOOP
          -- Buscar entrada no rate_calendar
          SELECT * INTO v_rate_entry
          FROM rate_calendar
          WHERE establishment_id = p_establishment_id
          AND category_id = v_category_id
          AND date = v_date
          AND (v_rule.applicable_plans IS NULL OR pricing_plan_id = ANY(v_rule.applicable_plans::UUID[]))
          LIMIT 1;
          
          -- Se não encontrou, buscar preço base da categoria
          IF v_rate_entry IS NULL THEN
            SELECT base_price INTO v_base_price
            FROM room_categories
            WHERE id = v_category_id;
          ELSE
            v_base_price := v_rate_entry.base_price;
          END IF;
          
          -- Aplicar ajuste
          IF v_rule.adjustment_type = 'percentage' THEN
            v_new_price := v_base_price * (1 + v_rule.adjustment_value / 100);
          ELSIF v_rule.adjustment_type = 'fixed' THEN
            v_new_price := v_base_price + v_rule.adjustment_value;
          ELSIF v_rule.adjustment_type = 'multiplier' THEN
            v_new_price := v_base_price * v_rule.adjustment_value;
          ELSE
            v_new_price := v_base_price;
          END IF;
          
          -- Garantir que o preço não seja negativo
          v_new_price := GREATEST(0, v_new_price);
          
          -- Atualizar ou inserir no rate_calendar
          INSERT INTO rate_calendar (
            establishment_id,
            pricing_plan_id,
            category_id,
            date,
            base_price
          )
          VALUES (
            p_establishment_id,
            COALESCE(v_rate_entry.pricing_plan_id, (SELECT id FROM pricing_plans WHERE establishment_id = p_establishment_id AND code = 'BAR' LIMIT 1)),
            v_category_id,
            v_date,
            v_new_price
          )
          ON CONFLICT (establishment_id, pricing_plan_id, category_id, date)
          DO UPDATE SET base_price = v_new_price;
          
          v_updated_count := v_updated_count + 1;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Função para buscar restrições ativas
CREATE OR REPLACE FUNCTION get_active_restrictions(
  p_establishment_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_category_id UUID DEFAULT NULL,
  p_pricing_plan_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  restriction_type TEXT,
  start_date DATE,
  end_date DATE,
  category_id UUID,
  pricing_plan_id UUID,
  value NUMERIC,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.restriction_type,
    r.start_date,
    r.end_date,
    r.category_id,
    r.pricing_plan_id,
    r.value,
    r.notes
  FROM rate_restrictions r
  WHERE r.establishment_id = p_establishment_id
  AND r.is_active = true
  AND (
    (r.start_date <= p_end_date AND r.end_date >= p_start_date)
  )
  AND (p_category_id IS NULL OR r.category_id = p_category_id OR r.category_id IS NULL)
  AND (p_pricing_plan_id IS NULL OR r.pricing_plan_id = p_pricing_plan_id OR r.pricing_plan_id IS NULL)
  ORDER BY r.start_date, r.restriction_type;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para gerar recomendações automáticas
CREATE OR REPLACE FUNCTION generate_rate_recommendations(
  p_establishment_id UUID,
  p_date DATE,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  type TEXT,
  priority TEXT,
  message TEXT,
  affected_dates DATE[],
  current_price NUMERIC,
  suggested_price NUMERIC,
  estimated_revenue_impact NUMERIC,
  auto_apply BOOLEAN
) AS $$
DECLARE
  v_category RECORD;
  v_occupancy NUMERIC;
  v_current_price NUMERIC;
  v_suggested_price NUMERIC;
  v_revenue_impact NUMERIC;
  v_available_rooms INTEGER;
  v_occupied_rooms INTEGER;
BEGIN
  -- Iterar sobre categorias
  FOR v_category IN
    SELECT * FROM room_categories
    WHERE establishment_id = p_establishment_id
    AND (p_category_id IS NULL OR id = p_category_id)
  LOOP
    -- Calcular ocupação
    SELECT COUNT(*) INTO v_occupied_rooms
    FROM reservations
    WHERE establishment_id = p_establishment_id
    AND category_id = v_category.id
    AND p_date >= checkin_date
    AND p_date < checkout_date
    AND status != 'cancelled';
    
    SELECT COUNT(*) INTO v_available_rooms
    FROM rooms
    WHERE establishment_id = p_establishment_id
    AND category_id = v_category.id;
    
    IF v_available_rooms > 0 THEN
      v_occupancy := (v_occupied_rooms::NUMERIC / v_available_rooms::NUMERIC) * 100;
      
      -- Buscar preço atual
      SELECT base_price INTO v_current_price
      FROM rate_calendar
      WHERE establishment_id = p_establishment_id
      AND category_id = v_category.id
      AND date = p_date
      LIMIT 1;
      
      IF v_current_price IS NULL THEN
        v_current_price := v_category.base_price;
      END IF;
      
      -- Recomendação: Alta ocupação (>90%)
      IF v_occupancy >= 90 THEN
        v_suggested_price := v_current_price * 1.15; -- Aumento de 15%
        v_revenue_impact := (v_suggested_price - v_current_price) * (v_available_rooms - v_occupied_rooms);
        
        RETURN QUERY SELECT
          'recommendation'::TEXT,
          'high'::TEXT,
          format('Ocupação para %s em %.0f%%. Sugerir aumento de 15%% na tarifa.', 
            to_char(p_date, 'DD/MM'), v_occupancy)::TEXT,
          ARRAY[p_date]::DATE[],
          v_current_price,
          v_suggested_price,
          v_revenue_impact,
          false::BOOLEAN;
      END IF;
      
      -- Recomendação: Baixa ocupação (<30%)
      IF v_occupancy < 30 THEN
        v_suggested_price := v_current_price * 0.90; -- Redução de 10%
        v_revenue_impact := (v_suggested_price - v_current_price) * (v_available_rooms - v_occupied_rooms);
        
        RETURN QUERY SELECT
          'recommendation'::TEXT,
          'medium'::TEXT,
          format('Ocupação para %s em %.0f%%. Sugerir redução de 10%% na tarifa para aumentar demanda.', 
            to_char(p_date, 'DD/MM'), v_occupancy)::TEXT,
          ARRAY[p_date]::DATE[],
          v_current_price,
          v_suggested_price,
          v_revenue_impact,
          false::BOOLEAN;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. Função para atualização em lote do rate_calendar
CREATE OR REPLACE FUNCTION bulk_update_rate_calendar(
  p_establishment_id UUID,
  p_updates JSONB
)
RETURNS INTEGER AS $$
DECLARE
  v_update JSONB;
  v_updated_count INTEGER := 0;
BEGIN
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    INSERT INTO rate_calendar (
      establishment_id,
      pricing_plan_id,
      category_id,
      date,
      base_price,
      adult_price,
      child_price
    )
    VALUES (
      p_establishment_id,
      (v_update->>'pricing_plan_id')::UUID,
      (v_update->>'category_id')::UUID,
      (v_update->>'date')::DATE,
      (v_update->>'base_price')::NUMERIC,
      (v_update->>'adult_price')::NUMERIC,
      (v_update->>'child_price')::NUMERIC
    )
    ON CONFLICT (establishment_id, pricing_plan_id, category_id, date)
    DO UPDATE SET
      base_price = EXCLUDED.base_price,
      adult_price = EXCLUDED.adult_price,
      child_price = EXCLUDED.child_price;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_rate_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION apply_dynamic_rules_batch TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_restrictions TO authenticated;
GRANT EXECUTE ON FUNCTION generate_rate_recommendations TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_rate_calendar TO authenticated;

