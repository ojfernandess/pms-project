-- Adicionar campo quote_id à tabela stripe_payments
ALTER TABLE public.stripe_payments
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_stripe_payments_quote ON public.stripe_payments(quote_id);

-- Comentário
COMMENT ON COLUMN public.stripe_payments.quote_id IS 'ID do orçamento associado ao pagamento (quando payment_type = quote_payment)';

