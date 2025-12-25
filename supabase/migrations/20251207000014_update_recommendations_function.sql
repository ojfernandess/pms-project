-- Atualizar função de recomendações para usar configurações do rate_system_settings
-- Remover função antiga se existir
DROP FUNCTION IF EXISTS generate_rate_recommendations(UUID, DATE, UUID);
DROP FUNCTION IF EXISTS generate_rate_recommendations(UUID, DATE);

CREATE OR REPLACE FUNCTION generate_rate_recommendations(
  p_establishment_id UUID,
  p_start_date DATE,
  p_end_date DATE,
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
  auto_apply BOOLEAN,
  category_id UUID,
  category_name TEXT,
  date DATE
) AS $$
DECLARE
  v_category RECORD;
  v_date DATE;
  v_occupancy NUMERIC;
  v_current_price NUMERIC;
  v_suggested_price NUMERIC;
  v_revenue_impact NUMERIC;
  v_available_rooms INTEGER;
  v_occupied_rooms INTEGER;
  v_settings_json JSONB;
  v_enable_recommendations BOOLEAN := false;
  v_high_occupancy_threshold NUMERIC := 90;
  v_low_occupancy_threshold NUMERIC := 30;
  v_price_increase_percentage NUMERIC := 15;
  v_price_decrease_percentage NUMERIC := 10;
BEGIN
  -- Buscar configurações do estabelecimento
  SELECT rate_system_settings INTO v_settings_json
  FROM hotel_settings
  WHERE establishment_id = p_establishment_id
  LIMIT 1;

  -- Verificar se recomendações estão habilitadas
  IF v_settings_json IS NOT NULL THEN
    IF v_settings_json ? 'enable_recommendations' THEN
      IF jsonb_typeof(v_settings_json->'enable_recommendations') = 'boolean' THEN
        v_enable_recommendations := (v_settings_json->>'enable_recommendations')::boolean;
      ELSIF v_settings_json->>'enable_recommendations' = 'true' OR v_settings_json->>'enable_recommendations' = '1' THEN
        v_enable_recommendations := true;
      END IF;
    END IF;

    -- Buscar thresholds configurados
    IF v_settings_json ? 'recommendation_threshold_occupancy' THEN
      v_high_occupancy_threshold := COALESCE((v_settings_json->>'recommendation_threshold_occupancy')::NUMERIC, 90);
    END IF;

    IF v_settings_json ? 'recommendation_threshold_low_occupancy' THEN
      v_low_occupancy_threshold := COALESCE((v_settings_json->>'recommendation_threshold_low_occupancy')::NUMERIC, 30);
    END IF;

    IF v_settings_json ? 'price_increase_percentage' THEN
      v_price_increase_percentage := COALESCE((v_settings_json->>'price_increase_percentage')::NUMERIC, 15);
    END IF;

    IF v_settings_json ? 'price_decrease_percentage' THEN
      v_price_decrease_percentage := COALESCE((v_settings_json->>'price_decrease_percentage')::NUMERIC, 10);
    END IF;
  END IF;

  -- Se recomendações não estão habilitadas, retornar vazio
  IF NOT v_enable_recommendations THEN
    RETURN;
  END IF;

  -- Iterar sobre categorias
  FOR v_category IN
    SELECT * FROM room_categories
    WHERE establishment_id = p_establishment_id
    AND (p_category_id IS NULL OR id = p_category_id)
  LOOP
    -- Iterar sobre o período de datas
    FOR v_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::DATE
    LOOP
      -- Calcular ocupação para esta data
      SELECT COUNT(*) INTO v_occupied_rooms
      FROM reservations
      WHERE reservations.establishment_id = p_establishment_id
      AND reservations.category_id = v_category.id
      AND v_date >= reservations.checkin_date
      AND v_date < reservations.checkout_date
      AND reservations.status != 'cancelled';
      
      SELECT COUNT(*) INTO v_available_rooms
      FROM rooms
      WHERE rooms.establishment_id = p_establishment_id
      AND rooms.category_id = v_category.id;
      
      IF v_available_rooms > 0 THEN
        v_occupancy := (v_occupied_rooms::NUMERIC / v_available_rooms::NUMERIC) * 100;
        
        -- Buscar preço atual
        SELECT rate_calendar.base_price INTO v_current_price
        FROM rate_calendar
        WHERE rate_calendar.establishment_id = p_establishment_id
        AND rate_calendar.category_id = v_category.id
        AND rate_calendar.date = v_date
        LIMIT 1;
        
        IF v_current_price IS NULL THEN
          v_current_price := COALESCE(v_category.base_price, 0);
        END IF;

        IF v_current_price > 0 THEN
          -- Recomendação: Alta ocupação
          IF v_occupancy >= v_high_occupancy_threshold THEN
            v_suggested_price := v_current_price * (1 + (v_price_increase_percentage / 100));
            v_revenue_impact := (v_suggested_price - v_current_price) * (v_available_rooms - v_occupied_rooms);
            
            RETURN QUERY SELECT
              'recommendation'::TEXT,
              'high'::TEXT,
              format('Ocupação para %s em %s%%. Sugerir aumento de %s%% na tarifa.', 
                to_char(v_date, 'DD/MM'), 
                ROUND(v_occupancy)::TEXT, 
                ROUND(v_price_increase_percentage)::TEXT)::TEXT,
              ARRAY[v_date]::DATE[],
              v_current_price,
              v_suggested_price,
              v_revenue_impact,
              false::BOOLEAN,
              v_category.id,
              v_category.name,
              v_date;
          END IF;
          
          -- Recomendação: Baixa ocupação
          IF v_occupancy < v_low_occupancy_threshold THEN
            v_suggested_price := v_current_price * (1 - (v_price_decrease_percentage / 100));
            v_revenue_impact := (v_suggested_price - v_current_price) * (v_available_rooms - v_occupied_rooms);
            
            RETURN QUERY SELECT
              'recommendation'::TEXT,
              'medium'::TEXT,
              format('Ocupação para %s em %s%%. Sugerir redução de %s%% na tarifa para aumentar demanda.', 
                to_char(v_date, 'DD/MM'), 
                ROUND(v_occupancy)::TEXT, 
                ROUND(v_price_decrease_percentage)::TEXT)::TEXT,
              ARRAY[v_date]::DATE[],
              v_current_price,
              v_suggested_price,
              v_revenue_impact,
              false::BOOLEAN,
              v_category.id,
              v_category.name,
              v_date;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_rate_recommendations IS 
  'Gera recomendações de ajuste de preços baseadas em ocupação, usando configurações do rate_system_settings. Retorna recomendações apenas se enable_recommendations estiver habilitado.';

-- Função para aplicar preço sugerido de uma recomendação ao tarifário
CREATE OR REPLACE FUNCTION apply_recommendation_price(
  p_establishment_id UUID,
  p_category_id UUID,
  p_pricing_plan_id UUID,
  p_date DATE,
  p_suggested_price NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_entry RECORD;
BEGIN
  -- Verificar se já existe uma entrada no rate_calendar
  SELECT * INTO v_existing_entry
  FROM rate_calendar
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND pricing_plan_id = p_pricing_plan_id
    AND date = p_date
  LIMIT 1;

  IF v_existing_entry IS NOT NULL THEN
    -- Atualizar entrada existente
    UPDATE rate_calendar
    SET base_price = p_suggested_price,
        updated_at = NOW()
    WHERE establishment_id = p_establishment_id
      AND category_id = p_category_id
      AND pricing_plan_id = p_pricing_plan_id
      AND date = p_date;
  ELSE
    -- Criar nova entrada
    INSERT INTO rate_calendar (
      establishment_id,
      category_id,
      pricing_plan_id,
      date,
      base_price,
      created_at,
      updated_at
    ) VALUES (
      p_establishment_id,
      p_category_id,
      p_pricing_plan_id,
      p_date,
      p_suggested_price,
      NOW(),
      NOW()
    );
  END IF;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_recommendation_price IS 
  'Aplica o preço sugerido de uma recomendação ao tarifário (rate_calendar) para a categoria, plano e data especificados.';

