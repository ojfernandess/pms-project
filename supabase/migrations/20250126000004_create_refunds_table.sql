-- Migration: Tabela de Estornos
-- Data: 2025-01-26
-- Descrição: Tabela para gerenciar estornos de pagamentos

CREATE TABLE IF NOT EXISTS public.financial_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Referências
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  
  -- Dados do estorno
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'cancelled')),
  refund_method TEXT NOT NULL DEFAULT 'original' CHECK (refund_method IN ('original', 'bank_transfer', 'credit', 'other')),
  
  -- Processamento
  refund_date DATE,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  
  -- Aprovação
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Rejeição
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_refunds_establishment ON public.financial_refunds(establishment_id);
CREATE INDEX IF NOT EXISTS idx_financial_refunds_payment ON public.financial_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_financial_refunds_status ON public.financial_refunds(status);
CREATE INDEX IF NOT EXISTS idx_financial_refunds_receivable ON public.financial_refunds(accounts_receivable_id);

-- Trigger para updated_at
CREATE TRIGGER update_financial_refunds_updated_at
  BEFORE UPDATE ON public.financial_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.financial_refunds ENABLE ROW LEVEL SECURITY;

-- Política RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'financial_refunds' 
    AND policyname = 'users_see_own_establishment_refunds'
  ) THEN
    CREATE POLICY users_see_own_establishment_refunds ON public.financial_refunds
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'financial_refunds' 
    AND policyname = 'users_manage_own_establishment_refunds'
  ) THEN
    CREATE POLICY users_manage_own_establishment_refunds ON public.financial_refunds
      FOR ALL USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
END $$;

COMMENT ON TABLE public.financial_refunds IS 'Estornos de pagamentos com aprovação e auditoria';
COMMENT ON COLUMN public.financial_refunds.refund_method IS 'Método de estorno: original (mesmo método do pagamento), bank_transfer, credit, other';

