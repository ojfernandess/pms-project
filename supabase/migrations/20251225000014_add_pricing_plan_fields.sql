-- Migration: Adicionar campos completos aos planos tarifários
-- Adiciona campos para acomodações, tarifa base, plano de refeições, etc.

-- Adicionar campos aos pricing_plans
ALTER TABLE public.pricing_plans 
  ADD COLUMN IF NOT EXISTS requires_card BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_plan_id_for_rate UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meal_plan TEXT,
  ADD COLUMN IF NOT EXISTS min_nights INTEGER,
  ADD COLUMN IF NOT EXISTS max_nights INTEGER,
  ADD COLUMN IF NOT EXISTS label TEXT, -- Rótulo que aparece no motor de reservas
  ADD COLUMN IF NOT EXISTS immediate_confirmation BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_in_booking_engine BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_engine_label TEXT, -- Label no motor de reservas
  ADD COLUMN IF NOT EXISTS fluctuation_type TEXT CHECK (fluctuation_type IN ('percentage', 'fixed', NULL)), -- Tipo de flutuação: 'percentage' ou 'fixed'
  ADD COLUMN IF NOT EXISTS fluctuation_value DECIMAL(10,2); -- Valor da flutuação (pode ser negativo)

-- Criar tabela de relacionamento entre planos e categorias (acomodações)
CREATE TABLE IF NOT EXISTS public.pricing_plan_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_plan_category UNIQUE (pricing_plan_id, category_id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_pricing_plan_categories_plan 
  ON public.pricing_plan_categories(pricing_plan_id);

CREATE INDEX IF NOT EXISTS idx_pricing_plan_categories_category 
  ON public.pricing_plan_categories(category_id);

-- Comentários
COMMENT ON COLUMN public.pricing_plans.requires_card IS 'Se exige cartão no motor de reservas';
COMMENT ON COLUMN public.pricing_plans.base_plan_id_for_rate IS 'Plano tarifário base para cálculo de tarifa';
COMMENT ON COLUMN public.pricing_plans.meal_plan IS 'Plano de refeições (ex: Café da manhã, Meia pensão, etc.)';
COMMENT ON COLUMN public.pricing_plans.min_nights IS 'Mínimo de diárias';
COMMENT ON COLUMN public.pricing_plans.max_nights IS 'Máximo de diárias';
COMMENT ON COLUMN public.pricing_plans.label IS 'Rótulo que aparece no motor de reservas';
COMMENT ON COLUMN public.pricing_plans.immediate_confirmation IS 'Se a confirmação é imediata';
COMMENT ON COLUMN public.pricing_plans.available_in_booking_engine IS 'Se está disponível no motor de reservas';
COMMENT ON COLUMN public.pricing_plans.booking_engine_label IS 'Label específico para o motor de reservas';
COMMENT ON COLUMN public.pricing_plans.fluctuation_type IS 'Tipo de flutuação: percentage (percentual) ou fixed (valor fixo em R$)';
COMMENT ON COLUMN public.pricing_plans.fluctuation_value IS 'Valor da flutuação (pode ser negativo para desconto, positivo para acréscimo)';

