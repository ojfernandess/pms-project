-- =====================================================
-- MELHORIAS NO SISTEMA TARIFÁRIO - MÉTRICAS E INTELIGÊNCIA
-- =====================================================

-- 1. Adicionar campos de métricas ao rate_calendar
ALTER TABLE public.rate_calendar
  ADD COLUMN IF NOT EXISTS projected_occupancy DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_rate DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demand_score DECIMAL(5,2) DEFAULT 0; -- Score de demanda baseado em histórico

-- 2. Tabela de eventos locais
CREATE TABLE IF NOT EXISTS public.local_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  event_type TEXT CHECK (event_type IN ('conference', 'festival', 'sports', 'holiday', 'other')),
  impact_level TEXT CHECK (impact_level IN ('low', 'medium', 'high', 'very_high')) DEFAULT 'medium',
  expected_demand_increase DECIMAL(5,2) DEFAULT 0, -- Percentual de aumento esperado
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_event_dates CHECK (end_date >= start_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_local_events_establishment ON public.local_events(establishment_id);
CREATE INDEX IF NOT EXISTS idx_local_events_dates ON public.local_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_local_events_active ON public.local_events(is_active);

-- 3. Tabela de preços de concorrentes (opcional)
CREATE TABLE IF NOT EXISTS public.competitor_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  competitor_name TEXT NOT NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  source TEXT, -- 'manual', 'api', 'scraping'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_competitor_price UNIQUE (establishment_id, competitor_name, category_id, date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_competitor_prices_establishment ON public.competitor_prices(establishment_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_category ON public.competitor_prices(category_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_date ON public.competitor_prices(date);

-- 4. Atualizar dynamic_pricing_rules para suportar novos triggers
ALTER TABLE public.dynamic_pricing_rules
  ADD COLUMN IF NOT EXISTS use_occupancy BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_pickup_rate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_competitor_prices BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_local_events BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_demand_history BOOLEAN DEFAULT false;

-- 5. Função para calcular métricas de ocupação
CREATE OR REPLACE FUNCTION public.calculate_occupancy_metrics(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE
) RETURNS TABLE (
  total_rooms INTEGER,
  occupied_rooms INTEGER,
  current_occupancy DECIMAL(5,2),
  projected_occupancy DECIMAL(5,2)
) AS $$
DECLARE
  v_total_rooms INTEGER;
  v_occupied_rooms INTEGER;
  v_projected_occupied INTEGER;
BEGIN
  -- Contar quartos da categoria (a coluna is_active não existe na tabela rooms)
  SELECT COUNT(*) INTO v_total_rooms
  FROM public.rooms
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id;

  IF v_total_rooms = 0 THEN
    RETURN QUERY SELECT 0, 0, 0.0, 0.0;
    RETURN;
  END IF;

  -- Contar quartos ocupados (checkin <= date < checkout)
  SELECT COUNT(*) INTO v_occupied_rooms
  FROM public.reservations
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND status != 'cancelled'
    AND checkin_date <= p_date
    AND checkout_date > p_date;

  -- Calcular ocupação projetada (incluindo reservas futuras)
  SELECT COUNT(*) INTO v_projected_occupied
  FROM public.reservations
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND status != 'cancelled'
    AND checkin_date <= p_date
    AND checkout_date > p_date
    AND created_at >= (p_date - INTERVAL '30 days');

  RETURN QUERY SELECT
    v_total_rooms,
    v_occupied_rooms,
    CASE WHEN v_total_rooms > 0 THEN (v_occupied_rooms::DECIMAL / v_total_rooms::DECIMAL) * 100 ELSE 0 END,
    CASE WHEN v_total_rooms > 0 THEN (v_projected_occupied::DECIMAL / v_total_rooms::DECIMAL) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

-- 6. Função para calcular pickup rate
CREATE OR REPLACE FUNCTION public.calculate_pickup_rate(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE,
  p_days_back INTEGER DEFAULT 7
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_bookings_count INTEGER;
  v_pickup_rate DECIMAL(10,2);
BEGIN
  SELECT COUNT(*) INTO v_bookings_count
  FROM public.reservations
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND checkin_date = p_date
    AND status != 'cancelled'
    AND created_at >= (p_date - (p_days_back || ' days')::INTERVAL);

  v_pickup_rate := CASE WHEN p_days_back > 0 THEN v_bookings_count::DECIMAL / p_days_back::DECIMAL ELSE 0 END;

  RETURN v_pickup_rate;
END;
$$ LANGUAGE plpgsql;

-- 7. Função para calcular score de demanda baseado em histórico
CREATE OR REPLACE FUNCTION public.calculate_demand_score(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE
) RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_historical_bookings DECIMAL(10,2);
  v_historical_revenue DECIMAL(10,2);
  v_avg_bookings DECIMAL(10,2);
  v_avg_revenue DECIMAL(10,2);
  v_demand_score DECIMAL(5,2);
  v_day_of_year INTEGER;
BEGIN
  -- Obter dia do ano (1-365)
  v_day_of_year := EXTRACT(DOY FROM p_date);

  -- Buscar histórico dos últimos 2 anos para o mesmo dia do ano (±7 dias)
  SELECT 
    AVG(booking_count),
    AVG(revenue)
  INTO v_avg_bookings, v_avg_revenue
  FROM (
    SELECT 
      COUNT(*) as booking_count,
      SUM(COALESCE(paid_amount, total_amount, 0)) as revenue
    FROM public.reservations
    WHERE establishment_id = p_establishment_id
      AND category_id = p_category_id
      AND status != 'cancelled'
      AND EXTRACT(DOY FROM checkin_date) BETWEEN v_day_of_year - 7 AND v_day_of_year + 7
      AND checkin_date < p_date
      AND checkin_date >= (p_date - INTERVAL '2 years')
    GROUP BY checkin_date
  ) historical_data;

  -- Buscar dados atuais
  SELECT 
    COUNT(*),
    SUM(COALESCE(paid_amount, total_amount, 0))
  INTO v_historical_bookings, v_historical_revenue
  FROM public.reservations
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND status != 'cancelled'
    AND checkin_date = p_date;

  -- Calcular score (0-100)
  -- Baseado em comparação com histórico
  IF v_avg_bookings > 0 THEN
    v_demand_score := LEAST(100, GREATEST(0, (v_historical_bookings / v_avg_bookings) * 50));
  ELSE
    v_demand_score := 50; -- Score neutro se não há histórico
  END IF;

  RETURN v_demand_score;
END;
$$ LANGUAGE plpgsql;

-- 8. Atualizar função calculate_rate_price para considerar métricas
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

    -- Calcular métricas se não estão no calendário
    SELECT 
      current_occupancy,
      projected_occupancy
    INTO v_occupancy, v_projected_occupancy
    FROM public.calculate_occupancy_metrics(p_establishment_id, p_category_id, p_date);

    v_pickup_rate := public.calculate_pickup_rate(p_establishment_id, p_category_id, p_date);
  END IF;

  -- Calcular score de demanda
  v_demand_score := public.calculate_demand_score(p_establishment_id, p_category_id, p_date);

  -- Verificar eventos locais (verificar se a tabela existe)
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
    -- Verificar se a regra está ativa
    -- A coluna is_active existe na tabela, mas pode ser NULL
    -- Se for NULL ou true, considerar ativa
    IF v_rule.is_active IS NOT NULL AND v_rule.is_active = false THEN
      CONTINUE;
    END IF;
    
    -- Verificar condições do trigger
    DECLARE
      v_should_apply BOOLEAN := false;
    BEGIN
      -- Trigger: Ocupação
      IF v_rule.use_occupancy AND v_rule.trigger_type = 'occupancy' THEN
        IF v_occupancy IS NOT NULL THEN
          -- Verificar condição do trigger (ex: occupancy > 80)
          -- Por enquanto, aplicação simples
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

-- Enable Row Level Security
ALTER TABLE public.local_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies para local_events
DROP POLICY IF EXISTS "Allow authenticated users to read local events" ON public.local_events;
CREATE POLICY "Allow authenticated users to read local events"
  ON public.local_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage local events" ON public.local_events;
CREATE POLICY "Allow authenticated users to manage local events"
  ON public.local_events FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies para competitor_prices
DROP POLICY IF EXISTS "Allow authenticated users to read competitor prices" ON public.competitor_prices;
CREATE POLICY "Allow authenticated users to read competitor prices"
  ON public.competitor_prices FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage competitor prices" ON public.competitor_prices;
CREATE POLICY "Allow authenticated users to manage competitor prices"
  ON public.competitor_prices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_local_events_updated_at ON public.local_events;
CREATE TRIGGER update_local_events_updated_at
  BEFORE UPDATE ON public.local_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_competitor_prices_updated_at ON public.competitor_prices;
CREATE TRIGGER update_competitor_prices_updated_at
  BEFORE UPDATE ON public.competitor_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.local_events IS 'Eventos locais que impactam demanda';
COMMENT ON TABLE public.competitor_prices IS 'Preços de concorrentes para comparação';
COMMENT ON FUNCTION public.calculate_occupancy_metrics IS 'Calcula métricas de ocupação atual e projetada';
COMMENT ON FUNCTION public.calculate_pickup_rate IS 'Calcula velocidade de reservas (pickup rate)';
COMMENT ON FUNCTION public.calculate_demand_score IS 'Calcula score de demanda baseado em histórico';

