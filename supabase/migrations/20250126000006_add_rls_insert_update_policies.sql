-- Migration: Adicionar Políticas RLS para INSERT e UPDATE
-- Data: 2025-01-26
-- Descrição: Adiciona políticas RLS para permitir INSERT e UPDATE nas tabelas financeiras

-- ============================================
-- POLÍTICAS RLS PARA INSERT E UPDATE
-- ============================================

DO $$
BEGIN
  -- Contas a Receber - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'accounts_receivable' 
    AND policyname = 'users_insert_own_establishment_receivables'
  ) THEN
    CREATE POLICY users_insert_own_establishment_receivables ON public.accounts_receivable
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Contas a Receber - UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'accounts_receivable' 
    AND policyname = 'users_update_own_establishment_receivables'
  ) THEN
    CREATE POLICY users_update_own_establishment_receivables ON public.accounts_receivable
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Contas a Pagar - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'accounts_payable' 
    AND policyname = 'users_insert_own_establishment_payables'
  ) THEN
    CREATE POLICY users_insert_own_establishment_payables ON public.accounts_payable
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Contas a Pagar - UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'accounts_payable' 
    AND policyname = 'users_update_own_establishment_payables'
  ) THEN
    CREATE POLICY users_update_own_establishment_payables ON public.accounts_payable
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Faturas - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' 
    AND policyname = 'users_insert_own_establishment_invoices'
  ) THEN
    CREATE POLICY users_insert_own_establishment_invoices ON public.invoices
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Faturas - UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' 
    AND policyname = 'users_update_own_establishment_invoices'
  ) THEN
    CREATE POLICY users_update_own_establishment_invoices ON public.invoices
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Conciliação Bancária - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bank_reconciliation' 
    AND policyname = 'users_insert_own_establishment_reconciliation'
  ) THEN
    CREATE POLICY users_insert_own_establishment_reconciliation ON public.bank_reconciliation
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Conciliação Bancária - UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bank_reconciliation' 
    AND policyname = 'users_update_own_establishment_reconciliation'
  ) THEN
    CREATE POLICY users_update_own_establishment_reconciliation ON public.bank_reconciliation
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Caixa - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_cash_flow' 
    AND policyname = 'users_insert_own_establishment_cash_flow'
  ) THEN
    CREATE POLICY users_insert_own_establishment_cash_flow ON public.daily_cash_flow
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Caixa - UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_cash_flow' 
    AND policyname = 'users_update_own_establishment_cash_flow'
  ) THEN
    CREATE POLICY users_update_own_establishment_cash_flow ON public.daily_cash_flow
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Transações de Caixa - INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cash_flow_transactions' 
    AND policyname = 'users_insert_own_establishment_cash_transactions'
  ) THEN
    CREATE POLICY users_insert_own_establishment_cash_transactions ON public.cash_flow_transactions
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
END $$;

COMMENT ON POLICY users_insert_own_establishment_receivables ON public.accounts_receivable IS 'Permite usuários inserirem contas a receber do seu estabelecimento';
COMMENT ON POLICY users_update_own_establishment_receivables ON public.accounts_receivable IS 'Permite usuários atualizarem contas a receber do seu estabelecimento';

