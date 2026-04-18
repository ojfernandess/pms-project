-- Migration: Permitir payment_id NULL em financial_refunds para estornos imediatos
-- Motivo: Ao estornar da tela de reserva, o pagamento é deletado. Com CASCADE,
-- o registro de estorno seria apagado. Com SET NULL, o estorno permanece com
-- payment_id = null após o delete do pagamento.

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Encontrar a FK de payment_id que referencia payments
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_attribute attr ON attr.attnum = ANY(con.conkey) AND attr.attrelid = con.conrelid
  WHERE con.conrelid = 'public.financial_refunds'::regclass
    AND con.contype = 'f'
    AND con.confrelid = 'public.payments'::regclass
    AND attr.attname = 'payment_id';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.financial_refunds DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Permitir NULL no payment_id
ALTER TABLE public.financial_refunds
  ALTER COLUMN payment_id DROP NOT NULL;

-- Recriar FK com ON DELETE SET NULL
ALTER TABLE public.financial_refunds
  ADD CONSTRAINT financial_refunds_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_refunds.payment_id IS 'ID do pagamento estornado. Pode ser NULL se o pagamento foi removido (estorno imediato da tela de reserva).';
