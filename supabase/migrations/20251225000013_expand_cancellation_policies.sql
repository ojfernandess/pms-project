-- Migration: Expandir estrutura de políticas de cancelamento
-- Adiciona campos para múltiplas condições, não comparecimento e pré-pagamento

-- Adicionar campos para condições de cancelamento mais complexas
ALTER TABLE public.cancellation_policies 
  ADD COLUMN IF NOT EXISTS cancellation_fee_when TEXT, -- "em qualquer momento", "até X dias antes da chegada"
  ADD COLUMN IF NOT EXISTS cancellation_fee_after_deadline_type TEXT, -- Tipo de taxa após o prazo
  ADD COLUMN IF NOT EXISTS cancellation_fee_after_deadline_percentage INTEGER, -- Percentual após o prazo
  ADD COLUMN IF NOT EXISTS no_show_fee_type TEXT, -- "same_as_cancellation", "first_night", "percentage"
  ADD COLUMN IF NOT EXISTS no_show_fee_percentage INTEGER, -- Percentual para não comparecimento
  ADD COLUMN IF NOT EXISTS requires_prepayment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS prepayment_percentage INTEGER, -- Percentual do pré-pagamento
  ADD COLUMN IF NOT EXISTS prepayment_when TEXT, -- "before_free_cancellation_end", "after_free_cancellation_end"
  ADD COLUMN IF NOT EXISTS policy_summary TEXT, -- Resumo automático da política
  ADD COLUMN IF NOT EXISTS prepayment_summary TEXT; -- Resumo do pré-pagamento

-- Comentários
COMMENT ON COLUMN public.cancellation_policies.cancellation_fee_when IS 'Quando aplicar a taxa: "em qualquer momento" ou "até X dias antes da chegada"';
COMMENT ON COLUMN public.cancellation_policies.cancellation_fee_after_deadline_type IS 'Tipo de taxa após o prazo de cancelamento gratuito';
COMMENT ON COLUMN public.cancellation_policies.cancellation_fee_after_deadline_percentage IS 'Percentual cobrado após o prazo de cancelamento gratuito';
COMMENT ON COLUMN public.cancellation_policies.no_show_fee_type IS 'Tipo de taxa de não comparecimento: "same_as_cancellation", "first_night" ou "percentage"';
COMMENT ON COLUMN public.cancellation_policies.no_show_fee_percentage IS 'Percentual para não comparecimento quando tipo é "percentage"';
COMMENT ON COLUMN public.cancellation_policies.requires_prepayment IS 'Se exige pré-pagamento';
COMMENT ON COLUMN public.cancellation_policies.prepayment_percentage IS 'Percentual do pré-pagamento (0-100)';
COMMENT ON COLUMN public.cancellation_policies.prepayment_when IS 'Quando cobrar pré-pagamento: "before_free_cancellation_end" ou "after_free_cancellation_end"';

