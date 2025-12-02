-- Criar tabela simplificada de tarifários
CREATE TABLE IF NOT EXISTS public.simplified_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.ota_channels(id) ON DELETE SET NULL, -- NULL = balcão/direto
  channel_type TEXT DEFAULT 'direct', -- 'direct', 'ota', 'booking', 'airbnb', etc
  start_date DATE,
  end_date DATE,
  days_of_week INTEGER[], -- Array de dias da semana (0=domingo, 6=sábado), NULL = todos os dias
  price DECIMAL(10,2), -- Preço fixo
  price_multiplier DECIMAL(5,2) DEFAULT 1.0, -- Multiplicador do preço base
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_pricing_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_pricing_multiplier CHECK (price_multiplier > 0)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_establishment ON public.simplified_pricing(establishment_id);
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_plan ON public.simplified_pricing(pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_category ON public.simplified_pricing(category_id);
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_channel ON public.simplified_pricing(channel_id);
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_dates ON public.simplified_pricing(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_simplified_pricing_active ON public.simplified_pricing(is_active);

-- Enable Row Level Security
ALTER TABLE public.simplified_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read simplified pricing"
  ON public.simplified_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage simplified pricing"
  ON public.simplified_pricing FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_simplified_pricing_updated_at
  BEFORE UPDATE ON public.simplified_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

