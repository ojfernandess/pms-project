-- Migration: Adicionar Foreign Key de bank_account_id em bank_reconciliation
-- Data: 2025-01-26
-- Descrição: Adiciona FK após criação da tabela bank_accounts

-- Adicionar constraint de FK se a tabela bank_accounts existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'bank_accounts'
  ) THEN
    -- Garantir que a coluna bank_account_id existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'bank_reconciliation' 
      AND column_name = 'bank_account_id'
    ) THEN
      ALTER TABLE public.bank_reconciliation 
      ADD COLUMN bank_account_id UUID;
    END IF;
    
    -- Remover constraint se existir
    ALTER TABLE public.bank_reconciliation 
    DROP CONSTRAINT IF EXISTS bank_reconciliation_bank_account_id_fkey;
    
    -- Adicionar FK
    ALTER TABLE public.bank_reconciliation
    ADD CONSTRAINT bank_reconciliation_bank_account_id_fkey
    FOREIGN KEY (bank_account_id) 
    REFERENCES public.bank_accounts(id) 
    ON DELETE SET NULL;
    
    -- Criar índice se não existir
    CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_bank_account 
    ON public.bank_reconciliation(bank_account_id);
  END IF;
END $$;

