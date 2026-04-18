-- Tabela de temporadas/períodos
CREATE TABLE IF NOT EXISTS public.pricing_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  multiplier DECIMAL(5,2) DEFAULT 1.0, -- multiplicador do preço base (1.0 = 100%, 1.5 = 150%)
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date),
  CONSTRAINT valid_multiplier CHECK (multiplier > 0)
);

-- Tabela de regras de precificação
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE,
  season_id UUID REFERENCES public.pricing_seasons(id) ON DELETE CASCADE,
  day_of_week INTEGER, -- 0-6 (domingo=0, segunda=1, ..., sábado=6), NULL = todos os dias
  price_override DECIMAL(10,2), -- preço fixo ou NULL para usar multiplier
  multiplier DECIMAL(5,2), -- multiplicador adicional (aplicado após season multiplier)
  min_stay_nights INTEGER, -- mínimo de noites para aplicar a regra
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  CONSTRAINT valid_min_stay CHECK (min_stay_nights IS NULL OR min_stay_nights > 0)
);

-- Tabela de descontos/promoções
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' ou 'fixed'
  discount_value DECIMAL(10,2) NOT NULL, -- porcentagem (0-100) ou valor fixo
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  min_stay_nights INTEGER,
  max_stay_nights INTEGER,
  applicable_categories UUID[], -- NULL = todas as categorias
  is_active BOOLEAN DEFAULT true,
  usage_limit INTEGER, -- NULL = ilimitado
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_promotion_dates CHECK (end_date >= start_date),
  CONSTRAINT valid_discount_value CHECK (discount_value >= 0),
  CONSTRAINT valid_discount_percentage CHECK (
    discount_type != 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
  ),
  CONSTRAINT valid_stay_nights CHECK (
    min_stay_nights IS NULL OR max_stay_nights IS NULL OR max_stay_nights >= min_stay_nights
  )
);

-- Enable Row Level Security
ALTER TABLE public.pricing_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read pricing seasons"
  ON public.pricing_seasons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage pricing seasons"
  ON public.pricing_seasons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read pricing rules"
  ON public.pricing_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage pricing rules"
  ON public.pricing_rules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read promotions"
  ON public.promotions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage promotions"
  ON public.promotions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_pricing_seasons_updated_at
  BEFORE UPDATE ON public.pricing_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular preço com tarifário dinâmico
CREATE OR REPLACE FUNCTION public.calculate_dynamic_price(
  p_category_id UUID,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_promotion_code TEXT DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price DECIMAL(10,2);
  v_nights INTEGER;
  v_total_price DECIMAL(10,2) := 0;
  v_date DATE;
  v_day_price DECIMAL(10,2);
  v_season_multiplier DECIMAL(5,2);
  v_rule_multiplier DECIMAL(5,2);
  v_rule_override DECIMAL(10,2);
  v_day_of_week INTEGER;
  v_promotion_discount DECIMAL(10,2) := 0;
  v_promotion_record RECORD;
BEGIN
  -- Obter preço base da categoria
  SELECT base_price INTO v_base_price
  FROM public.room_categories
  WHERE id = p_category_id;

  IF v_base_price IS NULL THEN
    RETURN 0;
  END IF;

  -- Calcular número de noites
  v_nights := p_checkout_date - p_checkin_date;

  -- Processar cada dia da estadia
  v_date := p_checkin_date;
  WHILE v_date < p_checkout_date LOOP
    v_day_price := v_base_price;
    v_season_multiplier := 1.0;
    v_rule_multiplier := 1.0;
    v_rule_override := NULL;
    v_day_of_week := EXTRACT(DOW FROM v_date);

    -- Verificar se há temporada ativa para esta data
    SELECT multiplier INTO v_season_multiplier
    FROM public.pricing_seasons
    WHERE is_active = true
      AND start_date <= v_date
      AND end_date >= v_date
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_season_multiplier IS NULL THEN
      v_season_multiplier := 1.0;
    END IF;

    -- Aplicar multiplicador da temporada
    v_day_price := v_day_price * v_season_multiplier;

    -- Verificar regras de precificação
    SELECT price_override, multiplier INTO v_rule_override, v_rule_multiplier
    FROM public.pricing_rules
    WHERE category_id = p_category_id
      AND (season_id IS NULL OR season_id IN (
        SELECT id FROM public.pricing_seasons
        WHERE is_active = true
          AND start_date <= v_date
          AND end_date >= v_date
      ))
      AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
      AND (min_stay_nights IS NULL OR min_stay_nights <= v_nights)
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- Aplicar regra (override tem prioridade sobre multiplier)
    IF v_rule_override IS NOT NULL THEN
      v_day_price := v_rule_override;
    ELSIF v_rule_multiplier IS NOT NULL THEN
      v_day_price := v_day_price * v_rule_multiplier;
    END IF;

    v_total_price := v_total_price + v_day_price;
    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  -- Aplicar promoção se fornecida
  IF p_promotion_code IS NOT NULL THEN
    SELECT * INTO v_promotion_record
    FROM public.promotions
    WHERE code = p_promotion_code
      AND is_active = true
      AND start_date <= p_checkin_date
      AND end_date >= p_checkout_date
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND (applicable_categories IS NULL OR p_category_id = ANY(applicable_categories))
      AND (min_stay_nights IS NULL OR v_nights >= min_stay_nights)
      AND (max_stay_nights IS NULL OR v_nights <= max_stay_nights);

    IF v_promotion_record IS NOT NULL THEN
      IF v_promotion_record.discount_type = 'percentage' THEN
        v_promotion_discount := v_total_price * (v_promotion_record.discount_value / 100);
      ELSE
        v_promotion_discount := LEAST(v_promotion_record.discount_value, v_total_price);
      END IF;
      v_total_price := v_total_price - v_promotion_discount;
    END IF;
  END IF;

  RETURN GREATEST(v_total_price, 0);
END;
$$;

