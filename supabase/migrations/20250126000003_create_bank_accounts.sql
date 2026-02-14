-- Migration: Cadastro de Contas Bancárias
-- Data: 2025-01-26
-- Descrição: Tabela para cadastrar contas bancárias dos estabelecimentos

-- ============================================
-- TABELA: Contas Bancárias
-- ============================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Dados do banco
  bank_name TEXT NOT NULL, -- Nome do banco (ex: Banco do Brasil, Itaú)
  bank_code TEXT, -- Código do banco (ex: 001, 341)
  agency_number TEXT NOT NULL, -- Número da agência
  agency_digit TEXT, -- Dígito verificador da agência
  account_number TEXT NOT NULL, -- Número da conta
  account_digit TEXT, -- Dígito verificador da conta
  account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'investment', 'other')), -- Tipo de conta
  
  -- Dados do titular
  holder_name TEXT NOT NULL, -- Nome do titular
  holder_document TEXT, -- CPF/CNPJ do titular
  holder_type TEXT CHECK (holder_type IN ('individual', 'company')), -- Tipo de titular
  
  -- Configurações
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Conta padrão do estabelecimento
  currency TEXT DEFAULT 'BRL', -- Moeda
  
  -- Integração
  integration_type TEXT, -- 'ofx', 'cnab', 'api', 'manual'
  integration_config JSONB, -- Configurações de integração (credenciais, etc)
  
  -- Metadados
  notes TEXT,
  metadata JSONB,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bank_accounts_establishment ON public.bank_accounts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_default ON public.bank_accounts(establishment_id, is_default) WHERE is_default = true;

-- Constraint: Apenas uma conta padrão por estabelecimento
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_unique_default 
ON public.bank_accounts(establishment_id) 
WHERE is_default = true AND is_active = true;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Política RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bank_accounts' 
    AND policyname = 'users_see_own_establishment_bank_accounts'
  ) THEN
    CREATE POLICY users_see_own_establishment_bank_accounts ON public.bank_accounts
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bank_accounts' 
    AND policyname = 'users_manage_own_establishment_bank_accounts'
  ) THEN
    CREATE POLICY users_manage_own_establishment_bank_accounts ON public.bank_accounts
      FOR ALL USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
END $$;

-- Comentários
COMMENT ON TABLE public.bank_accounts IS 'Contas bancárias dos estabelecimentos para conciliação';
COMMENT ON COLUMN public.bank_accounts.bank_code IS 'Código do banco (ex: 001 para Banco do Brasil, 341 para Itaú)';
COMMENT ON COLUMN public.bank_accounts.account_type IS 'Tipo de conta: checking (corrente), savings (poupança), investment (investimento)';
COMMENT ON COLUMN public.bank_accounts.integration_type IS 'Tipo de integração: ofx, cnab, api ou manual';
COMMENT ON COLUMN public.bank_accounts.integration_config IS 'Configurações de integração (credenciais, endpoints, etc) em formato JSON';

