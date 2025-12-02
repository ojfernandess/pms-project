-- =====================================================
-- NOVO SISTEMA TARIFÁRIO - ESTRUTURA COMPLETA
-- =====================================================
-- Este sistema substitui e expande o sistema anterior
-- mantendo compatibilidade com reservas existentes

-- 1. Atualizar tabela pricing_plans com novos campos
ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'Standard' CHECK (plan_type IN ('Standard', 'Promotional', 'Package', 'Corporate', 'Group')),
  ADD COLUMN IF NOT EXISTS base_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Criar índice para código
CREATE INDEX IF NOT EXISTS idx_pricing_plans_code ON public.pricing_plans(code);

-- 2. Tabela de Calendário de Tarifas (Rate Calendar)
CREATE TABLE IF NOT EXISTS public.rate_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  adult_price DECIMAL(10,2),
  child_price DECIMAL(10,2),
  occupancy_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_rate_calendar_entry UNIQUE (establishment_id, pricing_plan_id, category_id, date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rate_calendar_establishment ON public.rate_calendar(establishment_id);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_plan ON public.rate_calendar(pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_category ON public.rate_calendar(category_id);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_date ON public.rate_calendar(date);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_composite ON public.rate_calendar(establishment_id, pricing_plan_id, category_id, date);

-- 3. Tabela de Regras Dinâmicas de Precificação
CREATE TABLE IF NOT EXISTS public.dynamic_pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('occupancy', 'booking_velocity', 'day_of_week', 'advance_booking', 'local_event', 'custom')),
  trigger_condition JSONB NOT NULL, -- Ex: {"operator": ">", "value": 80, "field": "occupancy"}
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('percentage', 'fixed', 'multiplier')),
  adjustment_value DECIMAL(10,2) NOT NULL, -- +15% = 15, -12% = -12, R$ 50 = 50
  priority INTEGER NOT NULL DEFAULT 0, -- Ordem de aplicação (menor = maior prioridade)
  is_active BOOLEAN DEFAULT true,
  applicable_categories UUID[], -- NULL = todas as categorias
  applicable_plans UUID[], -- NULL = todos os planos
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dynamic_rules_establishment ON public.dynamic_pricing_rules(establishment_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_rules_active ON public.dynamic_pricing_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_dynamic_rules_priority ON public.dynamic_pricing_rules(priority);
CREATE INDEX IF NOT EXISTS idx_dynamic_rules_dates ON public.dynamic_pricing_rules(start_date, end_date);

-- 4. Tabela de Restrições de Tarifa
CREATE TABLE IF NOT EXISTS public.rate_restrictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  restriction_type TEXT NOT NULL CHECK (restriction_type IN ('stop_sell', 'min_los', 'max_los', 'cta', 'ctd', 'closed_to_arrival', 'closed_to_departure')),
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  value INTEGER, -- Para min_los/max_los: número de noites
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_restriction_dates CHECK (end_date >= start_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_establishment ON public.rate_restrictions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_type ON public.rate_restrictions(restriction_type);
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_plan ON public.rate_restrictions(pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_category ON public.rate_restrictions(category_id);
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_dates ON public.rate_restrictions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_active ON public.rate_restrictions(is_active);

-- 5. Tabela de Analytics e Métricas
CREATE TABLE IF NOT EXISTS public.rate_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL,
  adr DECIMAL(10,2), -- Average Daily Rate
  revpar DECIMAL(10,2), -- Revenue Per Available Room
  occupancy_percentage DECIMAL(5,2),
  revenue DECIMAL(10,2),
  bookings_count INTEGER DEFAULT 0,
  cancellations_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_analytics_entry UNIQUE (establishment_id, date, pricing_plan_id, category_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rate_analytics_establishment ON public.rate_analytics(establishment_id);
CREATE INDEX IF NOT EXISTS idx_rate_analytics_date ON public.rate_analytics(date);
CREATE INDEX IF NOT EXISTS idx_rate_analytics_plan ON public.rate_analytics(pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_rate_analytics_category ON public.rate_analytics(category_id);

-- Enable Row Level Security
ALTER TABLE public.rate_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies para rate_calendar
CREATE POLICY "Allow authenticated users to read rate calendar"
  ON public.rate_calendar FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage rate calendar"
  ON public.rate_calendar FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies para dynamic_pricing_rules
CREATE POLICY "Allow authenticated users to read dynamic rules"
  ON public.dynamic_pricing_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage dynamic rules"
  ON public.dynamic_pricing_rules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies para rate_restrictions
CREATE POLICY "Allow authenticated users to read rate restrictions"
  ON public.rate_restrictions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage rate restrictions"
  ON public.rate_restrictions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies para rate_analytics
CREATE POLICY "Allow authenticated users to read rate analytics"
  ON public.rate_analytics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage rate analytics"
  ON public.rate_analytics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_rate_calendar_updated_at
  BEFORE UPDATE ON public.rate_calendar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dynamic_rules_updated_at
  BEFORE UPDATE ON public.dynamic_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rate_restrictions_updated_at
  BEFORE UPDATE ON public.rate_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular preço com novo sistema
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
  v_rule RECORD;
  v_adjustment DECIMAL(10,2);
BEGIN
  -- 1. Buscar preço base do calendário
  SELECT base_price, adult_price, child_price, occupancy_percentage
  INTO v_base_price, v_adult_price, v_child_price, v_occupancy
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
  END IF;

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
      AND is_active = true
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
    -- Verificar condição do trigger
    -- Por enquanto, implementação básica - pode ser expandida
    IF v_rule.trigger_type = 'occupancy' AND v_occupancy IS NOT NULL THEN
      -- Aplicar ajuste
      IF v_rule.adjustment_type = 'percentage' THEN
        v_adjustment := v_final_price * (v_rule.adjustment_value / 100);
        v_final_price := v_final_price + v_adjustment;
      ELSIF v_rule.adjustment_type = 'fixed' THEN
        v_final_price := v_final_price + v_rule.adjustment_value;
      ELSIF v_rule.adjustment_type = 'multiplier' THEN
        v_final_price := v_final_price * v_rule.adjustment_value;
      END IF;
    END IF;
  END LOOP;

  -- Garantir que o preço não seja negativo
  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  RETURN v_final_price;
END;
$$ LANGUAGE plpgsql;

-- Comentários
COMMENT ON TABLE public.rate_calendar IS 'Calendário de tarifas por data, plano e categoria';
COMMENT ON TABLE public.dynamic_pricing_rules IS 'Regras dinâmicas de precificação baseadas em triggers';
COMMENT ON TABLE public.rate_restrictions IS 'Restrições de tarifa (stop sell, min LOS, etc)';
COMMENT ON TABLE public.rate_analytics IS 'Métricas e analytics de revenue management';


