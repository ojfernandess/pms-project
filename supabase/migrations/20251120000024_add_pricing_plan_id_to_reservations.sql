-- Adicionar pricing_plan_id à tabela reservations
-- Esta coluna permite associar uma reserva a um plano tarifário específico

ALTER TABLE public.reservations
ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_reservations_pricing_plan_id ON public.reservations(pricing_plan_id);

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.reservations.pricing_plan_id IS 'Plano tarifário utilizado para calcular o preço da reserva';

