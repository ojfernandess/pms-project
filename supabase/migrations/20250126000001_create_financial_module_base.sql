-- Migration: Estrutura Base do Módulo Financeiro Completo
-- Data: 2025-01-26
-- Descrição: Cria tabelas para Contas a Receber, Contas a Pagar, Faturas, Conciliação Bancária e Auditoria

-- ============================================
-- 1. CONTAS A RECEBER (Accounts Receivable)
-- ============================================
CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  
  -- Dados do lançamento
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  
  -- Origem e tipo
  origin TEXT NOT NULL CHECK (origin IN ('reservation', 'prepayment', 'penalty', 'cancellation_penalty', 'no_show_penalty', 'extra_consumption', 'service_fee', 'other')),
  type TEXT NOT NULL CHECK (type IN ('reservation', 'penalty', 'service', 'extension', 'other')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices para Contas a Receber
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_establishment ON public.accounts_receivable(establishment_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_reservation ON public.accounts_receivable(reservation_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_client ON public.accounts_receivable(client_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON public.accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_due_date ON public.accounts_receivable(due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_origin ON public.accounts_receivable(origin);

-- ============================================
-- 2. CONTAS A PAGAR (Accounts Payable)
-- ============================================
CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Fornecedor/Credor
  supplier_name TEXT NOT NULL,
  supplier_document TEXT, -- CNPJ/CPF
  supplier_email TEXT,
  supplier_phone TEXT,
  
  -- Dados do lançamento
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  
  -- Tipo e categoria
  type TEXT NOT NULL CHECK (type IN ('ota_commission', 'gateway_fee', 'supplier', 'operational', 'tax', 'other')),
  category TEXT, -- Centro de custo
  
  -- Parcelamento
  installment_number INTEGER DEFAULT 1,
  total_installments INTEGER DEFAULT 1,
  parent_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL, -- Para parcelas
  
  -- Recorrência
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT, -- 'monthly', 'weekly', 'yearly'
  next_due_date DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices para Contas a Pagar
CREATE INDEX IF NOT EXISTS idx_accounts_payable_establishment ON public.accounts_payable(establishment_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_due_date ON public.accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_type ON public.accounts_payable(type);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_parent ON public.accounts_payable(parent_payable_id);

-- ============================================
-- 3. FATURAS / INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  
  -- Numeração
  invoice_number TEXT NOT NULL UNIQUE,
  series TEXT DEFAULT 'A',
  
  -- Dados da fatura
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  
  -- Tipo
  type TEXT NOT NULL CHECK (type IN ('reservation', 'penalty', 'service', 'refund', 'other')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'cancelled', 'overdue')),
  
  -- Dados do cliente (snapshot)
  client_name TEXT NOT NULL,
  client_document TEXT,
  client_email TEXT,
  client_address JSONB,
  
  -- Itens da fatura
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de {description, quantity, unit_price, total}
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  pdf_url TEXT, -- URL do PDF gerado
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ
);

-- Índices para Faturas
CREATE INDEX IF NOT EXISTS idx_invoices_establishment ON public.invoices(establishment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_reservation ON public.invoices(reservation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);

-- ============================================
-- 4. CONCILIAÇÃO BANCÁRIA (Bank Reconciliation)
-- ============================================
CREATE TABLE IF NOT EXISTS public.bank_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  bank_account_id UUID, -- Referência à conta bancária (será adicionada FK após criação da tabela bank_accounts)
  
  -- Dados da transação bancária
  bank_name TEXT NOT NULL,
  account_number TEXT,
  transaction_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit')),
  
  -- Dados importados
  import_source TEXT, -- 'ofx', 'cnab', 'csv', 'api', 'manual'
  import_file_name TEXT,
  import_date TIMESTAMPTZ,
  raw_data JSONB, -- Dados brutos da importação
  
  -- Matching
  matched_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  matched_accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  matched_accounts_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  
  -- Status de conciliação
  reconciliation_status TEXT NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'auto_matched', 'manual_matched', 'divergent', 'ignored')),
  matched_at TIMESTAMPTZ,
  matched_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Regras de matching aplicadas
  matching_rules JSONB, -- Array de regras que fizeram match
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  
  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantir que a coluna bank_account_id existe (caso a tabela já exista)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bank_reconciliation' 
    AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE public.bank_reconciliation 
    ADD COLUMN bank_account_id UUID;
  END IF;
END $$;

-- Índices para Conciliação Bancária
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_establishment ON public.bank_reconciliation(establishment_id);
-- Índice de bank_account_id será criado na migration 20250126000005_add_bank_account_fk.sql
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_status ON public.bank_reconciliation(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_date ON public.bank_reconciliation(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_payment ON public.bank_reconciliation(matched_payment_id);

-- ============================================
-- 5. CAIXA / FLUXO DIÁRIO (Daily Cash Flow)
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_cash_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Data e turno
  flow_date DATE NOT NULL,
  shift TEXT CHECK (shift IN ('morning', 'afternoon', 'night', 'full_day')),
  
  -- Valores
  opening_balance DECIMAL(10,2) DEFAULT 0,
  total_inflows DECIMAL(10,2) DEFAULT 0,
  total_outflows DECIMAL(10,2) DEFAULT 0,
  withdrawals DECIMAL(10,2) DEFAULT 0, -- Sangrias
  closing_balance DECIMAL(10,2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reconciled')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadados
  notes TEXT,
  metadata JSONB,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraint: um caixa por dia/turno/estabelecimento
  UNIQUE(establishment_id, flow_date, shift)
);

-- Tabela de movimentações do caixa
CREATE TABLE IF NOT EXISTS public.cash_flow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_cash_flow_id UUID NOT NULL REFERENCES public.daily_cash_flow(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Tipo de transação
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('inflow', 'outflow', 'withdrawal', 'refund')),
  
  -- Dados
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  
  -- Metadados
  metadata JSONB,
  notes TEXT,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para Caixa
CREATE INDEX IF NOT EXISTS idx_daily_cash_flow_establishment ON public.daily_cash_flow(establishment_id);
CREATE INDEX IF NOT EXISTS idx_daily_cash_flow_date ON public.daily_cash_flow(flow_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_transactions_flow ON public.cash_flow_transactions(daily_cash_flow_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_transactions_establishment ON public.cash_flow_transactions(establishment_id);

-- ============================================
-- 6. AUDITORIA FINANCEIRA
-- ============================================
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  
  -- Tipo de ação
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'approve', 'reject', 'reverse', 'refund')),
  
  -- Entidade afetada
  entity_type TEXT NOT NULL, -- 'payment', 'accounts_receivable', 'accounts_payable', 'invoice', etc.
  entity_id UUID NOT NULL,
  
  -- Dados da alteração
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[], -- Campos alterados
  
  -- Contexto
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Usuário
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para Auditoria
CREATE INDEX IF NOT EXISTS idx_financial_audit_establishment ON public.financial_audit_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_entity ON public.financial_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_user ON public.financial_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_date ON public.financial_audit_logs(created_at);

-- ============================================
-- 7. FUNÇÕES AUXILIARES
-- ============================================

-- Função para gerar número de fatura sequencial
CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_establishment_id UUID,
  p_series TEXT DEFAULT 'A'
) RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
  v_invoice_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Buscar último número da série no ano
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM public.invoices
  WHERE establishment_id = p_establishment_id
    AND series = p_series
    AND EXTRACT(YEAR FROM issue_date) = v_year;
  
  -- Formato: ESTABLISHMENT_ID-SERIES-ANO-SEQUENCIA
  v_invoice_number := LPAD(v_sequence::TEXT, 6, '0');
  v_invoice_number := CONCAT(p_series, '-', v_year, '-', v_invoice_number);
  
  RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar status de contas a receber vencidas
CREATE OR REPLACE FUNCTION update_overdue_receivables()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.accounts_receivable
  SET status = 'overdue',
      updated_at = NOW()
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE
    AND paid_amount < amount;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar status de contas a pagar vencidas
CREATE OR REPLACE FUNCTION update_overdue_payables()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.accounts_payable
  SET status = 'overdue',
      updated_at = NOW()
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE
    AND paid_amount < amount;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (ajustar conforme necessidade)
-- Usuários podem ver apenas dados do seu estabelecimento
-- Usa função helper para evitar recursão e seguir padrão do sistema
-- A função user_can_access_establishment já deve existir (criada em outras migrations)
-- Se não existir, será criada aqui

-- Criar função helper se não existir (para evitar erro se migration rodar antes)
-- Usar CREATE OR REPLACE diretamente (não dentro de DO block)
CREATE OR REPLACE FUNCTION public.user_can_access_establishment(
  p_user_id UUID,
  p_establishment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_access BOOLEAN := FALSE;
BEGIN
  -- Verificar se é super admin (se tabela existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'admin_users'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = p_user_id AND is_super_admin = true
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  -- Verificar se o usuário está associado à empresa do estabelecimento
  SELECT EXISTS (
    SELECT 1 FROM public.establishments e
    INNER JOIN public.user_companies uc ON uc.company_id = e.company_id
    WHERE e.id = p_establishment_id
    AND uc.user_id = p_user_id
    AND uc.is_active = true
  ) INTO v_can_access;
  
  RETURN v_can_access;
END;
$$;

-- Políticas RLS usando função helper
DO $$
BEGIN
  -- Contas a Receber
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_receivable' AND policyname = 'users_see_own_establishment_receivables'
  ) THEN
    CREATE POLICY users_see_own_establishment_receivables ON public.accounts_receivable
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_receivable' AND policyname = 'users_insert_own_establishment_receivables'
  ) THEN
    CREATE POLICY users_insert_own_establishment_receivables ON public.accounts_receivable
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_receivable' AND policyname = 'users_update_own_establishment_receivables'
  ) THEN
    CREATE POLICY users_update_own_establishment_receivables ON public.accounts_receivable
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Contas a Pagar
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_payable' AND policyname = 'users_see_own_establishment_payables'
  ) THEN
    CREATE POLICY users_see_own_establishment_payables ON public.accounts_payable
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_payable' AND policyname = 'users_insert_own_establishment_payables'
  ) THEN
    CREATE POLICY users_insert_own_establishment_payables ON public.accounts_payable
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'accounts_payable' AND policyname = 'users_update_own_establishment_payables'
  ) THEN
    CREATE POLICY users_update_own_establishment_payables ON public.accounts_payable
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Faturas
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'users_see_own_establishment_invoices'
  ) THEN
    CREATE POLICY users_see_own_establishment_invoices ON public.invoices
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'users_insert_own_establishment_invoices'
  ) THEN
    CREATE POLICY users_insert_own_establishment_invoices ON public.invoices
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'users_update_own_establishment_invoices'
  ) THEN
    CREATE POLICY users_update_own_establishment_invoices ON public.invoices
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Conciliação Bancária
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation' AND policyname = 'users_see_own_establishment_reconciliation'
  ) THEN
    CREATE POLICY users_see_own_establishment_reconciliation ON public.bank_reconciliation
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation' AND policyname = 'users_insert_own_establishment_reconciliation'
  ) THEN
    CREATE POLICY users_insert_own_establishment_reconciliation ON public.bank_reconciliation
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation' AND policyname = 'users_update_own_establishment_reconciliation'
  ) THEN
    CREATE POLICY users_update_own_establishment_reconciliation ON public.bank_reconciliation
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Caixa
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_cash_flow' AND policyname = 'users_see_own_establishment_cash_flow'
  ) THEN
    CREATE POLICY users_see_own_establishment_cash_flow ON public.daily_cash_flow
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_cash_flow' AND policyname = 'users_insert_own_establishment_cash_flow'
  ) THEN
    CREATE POLICY users_insert_own_establishment_cash_flow ON public.daily_cash_flow
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_cash_flow' AND policyname = 'users_update_own_establishment_cash_flow'
  ) THEN
    CREATE POLICY users_update_own_establishment_cash_flow ON public.daily_cash_flow
      FOR UPDATE USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      ) WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Transações de Caixa
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_flow_transactions' AND policyname = 'users_see_own_establishment_cash_transactions'
  ) THEN
    CREATE POLICY users_see_own_establishment_cash_transactions ON public.cash_flow_transactions
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_flow_transactions' AND policyname = 'users_insert_own_establishment_cash_transactions'
  ) THEN
    CREATE POLICY users_insert_own_establishment_cash_transactions ON public.cash_flow_transactions
      FOR INSERT WITH CHECK (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
  
  -- Auditoria
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_audit_logs' AND policyname = 'users_see_own_establishment_audit'
  ) THEN
    CREATE POLICY users_see_own_establishment_audit ON public.financial_audit_logs
      FOR SELECT USING (
        public.user_can_access_establishment(auth.uid(), establishment_id)
      );
  END IF;
END $$;

-- ============================================
-- 9. TRIGGERS
-- ============================================

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas (remover se existir antes de criar)
DROP TRIGGER IF EXISTS update_accounts_receivable_updated_at ON public.accounts_receivable;
CREATE TRIGGER update_accounts_receivable_updated_at
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_payable_updated_at ON public.accounts_payable;
CREATE TRIGGER update_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bank_reconciliation_updated_at ON public.bank_reconciliation;
CREATE TRIGGER update_bank_reconciliation_updated_at
  BEFORE UPDATE ON public.bank_reconciliation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_cash_flow_updated_at ON public.daily_cash_flow;
CREATE TRIGGER update_daily_cash_flow_updated_at
  BEFORE UPDATE ON public.daily_cash_flow
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar status de contas a receber quando pago
CREATE OR REPLACE FUNCTION update_receivable_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_amount >= NEW.amount THEN
    NEW.status = 'paid';
    NEW.paid_date = COALESCE(NEW.paid_date, CURRENT_DATE);
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status = 'partial';
  ELSIF NEW.due_date < CURRENT_DATE THEN
    NEW.status = 'overdue';
  ELSE
    NEW.status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_receivable_status_trigger ON public.accounts_receivable;
CREATE TRIGGER update_receivable_status_trigger
  BEFORE INSERT OR UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION update_receivable_status();

-- Trigger similar para contas a pagar
CREATE OR REPLACE FUNCTION update_payable_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_amount >= NEW.amount THEN
    NEW.status = 'paid';
    NEW.paid_date = COALESCE(NEW.paid_date, CURRENT_DATE);
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status = 'partial';
  ELSIF NEW.due_date < CURRENT_DATE THEN
    NEW.status = 'overdue';
  ELSE
    NEW.status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payable_status_trigger ON public.accounts_payable;
CREATE TRIGGER update_payable_status_trigger
  BEFORE INSERT OR UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION update_payable_status();

COMMENT ON TABLE public.accounts_receivable IS 'Contas a receber - geração automática a partir de reservas, multas, etc.';
COMMENT ON TABLE public.accounts_payable IS 'Contas a pagar - fornecedores, comissões OTA, taxas gateway';
COMMENT ON TABLE public.invoices IS 'Faturas/Invoices - documentos fiscais estruturados';
COMMENT ON TABLE public.bank_reconciliation IS 'Conciliação bancária - importação e matching de transações';
COMMENT ON TABLE public.daily_cash_flow IS 'Caixa/Fluxo diário - controle de entradas e saídas';
COMMENT ON TABLE public.cash_flow_transactions IS 'Transações do caixa - movimentações diárias';
COMMENT ON TABLE public.financial_audit_logs IS 'Auditoria financeira - logs de todas as alterações';

