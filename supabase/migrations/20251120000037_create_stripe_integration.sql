-- =====================================================
-- INTEGRAÇÃO STRIPE - ESTRUTURA COMPLETA
-- =====================================================

-- 1. Tabela de configuração global do Stripe (Super Admin)
CREATE TABLE IF NOT EXISTS public.stripe_global_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_enabled BOOLEAN DEFAULT false,
  test_mode BOOLEAN DEFAULT true,
  test_publishable_key TEXT,
  test_secret_key TEXT,
  live_publishable_key TEXT,
  live_secret_key TEXT,
  webhook_secret_test TEXT,
  webhook_secret_live TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000001')
);

-- Garantir apenas uma linha na tabela
INSERT INTO public.stripe_global_config (id, is_enabled, test_mode)
VALUES ('00000000-0000-0000-0000-000000000001', false, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de configuração Stripe por estabelecimento
CREATE TABLE IF NOT EXISTS public.stripe_establishment_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  stripe_account_id TEXT, -- ID da conta Stripe conectada
  stripe_customer_id TEXT, -- ID do cliente no Stripe
  test_publishable_key TEXT,
  test_secret_key TEXT,
  live_publishable_key TEXT,
  live_secret_key TEXT,
  webhook_secret_test TEXT,
  webhook_secret_live TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela de métodos de pagamento salvos (cartões)
CREATE TABLE IF NOT EXISTS public.stripe_payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  guest_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  stripe_payment_method_id TEXT NOT NULL, -- ID do método de pagamento no Stripe
  stripe_customer_id TEXT NOT NULL, -- ID do cliente no Stripe
  type TEXT NOT NULL DEFAULT 'card', -- card, bank_account, etc
  card_brand TEXT, -- visa, mastercard, etc
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela de transações/pagamentos Stripe
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  guest_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  status TEXT NOT NULL, -- succeeded, pending, failed, canceled, refunded
  payment_type TEXT NOT NULL, -- reservation_payment, extension, additional_fee, refund
  description TEXT,
  metadata JSONB,
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabela de reembolsos
CREATE TABLE IF NOT EXISTS public.stripe_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  payment_id UUID REFERENCES public.stripe_payments(id) ON DELETE CASCADE NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  stripe_refund_id TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  status TEXT NOT NULL, -- pending, succeeded, failed, canceled
  reason TEXT, -- requested_by_customer, duplicate, fraudulent
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tabela de webhooks recebidos
CREATE TABLE IF NOT EXISTS public.stripe_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_stripe_establishment_config_establishment ON public.stripe_establishment_config(establishment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payment_methods_establishment ON public.stripe_payment_methods(establishment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payment_methods_guest ON public.stripe_payment_methods(guest_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payment_methods_reservation ON public.stripe_payment_methods(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_establishment ON public.stripe_payments(establishment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_reservation ON public.stripe_payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_guest ON public.stripe_payments(guest_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_status ON public.stripe_payments(status);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_intent_id ON public.stripe_payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_refunds_payment ON public.stripe_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_refunds_reservation ON public.stripe_refunds(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stripe_refunds_status ON public.stripe_refunds(status);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_event_id ON public.stripe_webhooks(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_processed ON public.stripe_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_establishment ON public.stripe_webhooks(establishment_id);

-- Enable Row Level Security
ALTER TABLE public.stripe_global_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_establishment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies para stripe_global_config
DROP POLICY IF EXISTS "Authenticated users can read stripe global config" ON public.stripe_global_config;
DROP POLICY IF EXISTS "Only super admin can manage stripe global config" ON public.stripe_global_config;

-- Permitir que todos os usuários autenticados leiam a configuração global
-- (necessário para verificar se Stripe está habilitado)
CREATE POLICY "Authenticated users can read stripe global config"
  ON public.stripe_global_config FOR SELECT
  TO authenticated
  USING (true);

-- Apenas super admin pode gerenciar (INSERT, UPDATE, DELETE)
CREATE POLICY "Only super admin can manage stripe global config"
  ON public.stripe_global_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
      AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
      AND is_super_admin = true
    )
  );

-- RLS Policies para stripe_establishment_config
-- Remover todas as políticas existentes primeiro
DO $$ 
BEGIN
  -- Remover políticas existentes
  DROP POLICY IF EXISTS "Users can read their establishment stripe config" ON public.stripe_establishment_config;
  DROP POLICY IF EXISTS "Users can manage their establishment stripe config" ON public.stripe_establishment_config;
  DROP POLICY IF EXISTS "Authenticated users can read stripe establishment config" ON public.stripe_establishment_config;
  DROP POLICY IF EXISTS "Authenticated users can manage stripe establishment config" ON public.stripe_establishment_config;
END $$;

-- Permitir leitura para todos os usuários autenticados
-- (necessário para verificar se Stripe está configurado)
CREATE POLICY "Users can read their establishment stripe config"
  ON public.stripe_establishment_config FOR SELECT
  TO authenticated
  USING (true);

-- Apenas funcionários ou proprietários podem gerenciar
CREATE POLICY "Users can manage their establishment stripe config"
  ON public.stripe_establishment_config FOR ALL
  TO authenticated
  USING (
    -- Permitir acesso se o usuário é funcionário do estabelecimento
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
      AND is_active = true
    )
    OR
    -- Ou se o usuário é proprietário da empresa que possui o estabelecimento
    establishment_id IN (
      SELECT e.id FROM public.establishments e
      INNER JOIN public.companies c ON c.id = e.company_id
      INNER JOIN public.user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = auth.uid()
      AND uc.is_active = true
    )
  )
  WITH CHECK (
    -- Permitir acesso se o usuário é funcionário do estabelecimento
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
      AND is_active = true
    )
    OR
    -- Ou se o usuário é proprietário da empresa que possui o estabelecimento
    establishment_id IN (
      SELECT e.id FROM public.establishments e
      INNER JOIN public.companies c ON c.id = e.company_id
      INNER JOIN public.user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = auth.uid()
      AND uc.is_active = true
    )
  );

-- RLS Policies para stripe_payment_methods
DROP POLICY IF EXISTS "Users can read payment methods" ON public.stripe_payment_methods;
DROP POLICY IF EXISTS "Users can manage payment methods" ON public.stripe_payment_methods;

CREATE POLICY "Users can read payment methods"
  ON public.stripe_payment_methods FOR SELECT
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage payment methods"
  ON public.stripe_payment_methods FOR ALL
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para stripe_payments
DROP POLICY IF EXISTS "Users can read payments" ON public.stripe_payments;
DROP POLICY IF EXISTS "Users can manage payments" ON public.stripe_payments;

CREATE POLICY "Users can read payments"
  ON public.stripe_payments FOR SELECT
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage payments"
  ON public.stripe_payments FOR ALL
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para stripe_refunds
DROP POLICY IF EXISTS "Users can read refunds" ON public.stripe_refunds;
DROP POLICY IF EXISTS "Users can manage refunds" ON public.stripe_refunds;

CREATE POLICY "Users can read refunds"
  ON public.stripe_refunds FOR SELECT
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage refunds"
  ON public.stripe_refunds FOR ALL
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para stripe_webhooks (apenas leitura para usuários)
DROP POLICY IF EXISTS "Users can read webhooks" ON public.stripe_webhooks;

CREATE POLICY "Users can read webhooks"
  ON public.stripe_webhooks FOR SELECT
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
    )
  );

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_stripe_global_config_updated_at ON public.stripe_global_config;
CREATE TRIGGER update_stripe_global_config_updated_at
  BEFORE UPDATE ON public.stripe_global_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_stripe_establishment_config_updated_at ON public.stripe_establishment_config;
CREATE TRIGGER update_stripe_establishment_config_updated_at
  BEFORE UPDATE ON public.stripe_establishment_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_stripe_payment_methods_updated_at ON public.stripe_payment_methods;
CREATE TRIGGER update_stripe_payment_methods_updated_at
  BEFORE UPDATE ON public.stripe_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_stripe_payments_updated_at ON public.stripe_payments;
CREATE TRIGGER update_stripe_payments_updated_at
  BEFORE UPDATE ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_stripe_refunds_updated_at ON public.stripe_refunds;
CREATE TRIGGER update_stripe_refunds_updated_at
  BEFORE UPDATE ON public.stripe_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.stripe_global_config IS 'Configuração global do Stripe (apenas super admin)';
COMMENT ON TABLE public.stripe_establishment_config IS 'Configuração do Stripe por estabelecimento';
COMMENT ON TABLE public.stripe_payment_methods IS 'Métodos de pagamento salvos (cartões) dos hóspedes';
COMMENT ON TABLE public.stripe_payments IS 'Transações e pagamentos processados via Stripe';
COMMENT ON TABLE public.stripe_refunds IS 'Reembolsos processados via Stripe';
COMMENT ON TABLE public.stripe_webhooks IS 'Webhooks recebidos do Stripe para sincronização';

