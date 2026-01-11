-- Ajustar função de recomendações para buscar preço do plano BAR (ou primeiro plano ativo)
-- Isso garante que o "Preço Atual" seja atualizado corretamente após aplicar o preço sugerido

-- Remover função antiga para permitir alteração do tipo de retorno
DROP FUNCTION IF EXISTS generate_rate_recommendations(UUID, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS generate_rate_recommendations(UUID, DATE, DATE);

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
  date DATE,
  pricing_plan_id UUID,
  pricing_plan_name TEXT
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
  v_default_plan_id UUID;
  v_default_plan_name TEXT;
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

  -- Buscar plano padrão (BAR) ou primeiro plano ativo
  -- Isso garante que sempre busquemos o preço do mesmo plano que será usado ao aplicar a recomendação
  SELECT id, name INTO v_default_plan_id, v_default_plan_name
  FROM pricing_plans
  WHERE establishment_id = p_establishment_id
    AND code = 'BAR'
    AND is_active = true
  LIMIT 1;

  -- Se não encontrou BAR, buscar primeiro plano ativo
  IF v_default_plan_id IS NULL THEN
    SELECT id, name INTO v_default_plan_id, v_default_plan_name
    FROM pricing_plans
    WHERE establishment_id = p_establishment_id
      AND is_active = true
    ORDER BY sort_order ASC, name ASC
    LIMIT 1;
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
        
        -- Buscar preço atual do plano padrão (BAR ou primeiro ativo)
        -- Isso garante que sempre busquemos o preço do mesmo plano que será usado ao aplicar
        IF v_default_plan_id IS NOT NULL THEN
          SELECT rate_calendar.base_price INTO v_current_price
          FROM rate_calendar
          WHERE rate_calendar.establishment_id = p_establishment_id
          AND rate_calendar.category_id = v_category.id
          AND rate_calendar.pricing_plan_id = v_default_plan_id
          AND rate_calendar.date = v_date
          LIMIT 1;
        ELSE
          -- Se não há plano ativo, buscar qualquer preço (fallback)
          SELECT rate_calendar.base_price INTO v_current_price
          FROM rate_calendar
          WHERE rate_calendar.establishment_id = p_establishment_id
          AND rate_calendar.category_id = v_category.id
          AND rate_calendar.date = v_date
          LIMIT 1;
        END IF;
        
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
              v_date,
              v_default_plan_id,
              COALESCE(v_default_plan_name, 'Plano Tarifário')::TEXT;
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
              v_date,
              v_default_plan_id,
              COALESCE(v_default_plan_name, 'Plano Tarifário')::TEXT;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_rate_recommendations IS 
  'Gera recomendações de ajuste de preços baseadas em ocupação, usando configurações do rate_system_settings. Busca o preço atual do plano BAR (ou primeiro plano ativo) para garantir consistência com a aplicação de recomendações. Retorna recomendações apenas se enable_recommendations estiver habilitado.';

