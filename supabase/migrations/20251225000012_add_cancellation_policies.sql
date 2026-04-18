-- Migration: Adicionar tabela de políticas de cancelamento
-- Esta migration cria a estrutura completa para gerenciar políticas de cancelamento

-- Criar tabela de políticas de cancelamento
CREATE TABLE IF NOT EXISTS public.cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  has_free_cancellation BOOLEAN DEFAULT false,
  free_cancellation_deadline TEXT, -- Ex: "até 18:00 do dia da chegada", "até 7 dias antes da chegada"
  cancellation_fee_type TEXT DEFAULT 'first_night', -- 'first_night' ou 'percentage'
  cancellation_fee_percentage INTEGER, -- 0-100, usado quando fee_type é 'percentage'
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_cancellation_policies_establishment_id 
  ON public.cancellation_policies(establishment_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_policies_is_active 
  ON public.cancellation_policies(is_active);

-- Adicionar coluna de política de cancelamento na tabela de planos tarifários
ALTER TABLE public.pricing_plans 
  ADD COLUMN IF NOT EXISTS cancellation_policy_id UUID REFERENCES public.cancellation_policies(id) ON DELETE SET NULL;

-- Criar índice para a foreign key
CREATE INDEX IF NOT EXISTS idx_pricing_plans_cancellation_policy_id 
  ON public.pricing_plans(cancellation_policy_id);

-- Comentários
COMMENT ON TABLE public.cancellation_policies IS 'Políticas de cancelamento que podem ser associadas aos planos tarifários';
COMMENT ON COLUMN public.cancellation_policies.has_free_cancellation IS 'Se existe período de cancelamento sem custo';
COMMENT ON COLUMN public.cancellation_policies.free_cancellation_deadline IS 'Prazo para cancelamento sem custo (ex: "até 7 dias antes da chegada")';
COMMENT ON COLUMN public.cancellation_policies.cancellation_fee_type IS 'Tipo de taxa: "first_night" (primeira diária) ou "percentage" (percentual)';
COMMENT ON COLUMN public.cancellation_policies.cancellation_fee_percentage IS 'Percentual cobrado quando fee_type é "percentage" (0-100)';
COMMENT ON COLUMN public.pricing_plans.cancellation_policy_id IS 'Política de cancelamento associada ao plano tarifário';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_cancellation_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cancellation_policies_updated_at
  BEFORE UPDATE ON public.cancellation_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_cancellation_policies_updated_at();

