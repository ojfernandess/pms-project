-- Adicionar coluna installments à tabela payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1 NOT NULL;

-- Comentário na coluna
COMMENT ON COLUMN public.payments.installments IS 'Número de parcelas do pagamento. Padrão: 1 (à vista)';

-- Atualizar registros existentes para ter 1 parcela (à vista)
UPDATE public.payments 
SET installments = 1 
WHERE installments IS NULL;

