-- StayOS CRM ETAPA 6 — B2B (empresas/parceiros), fidelidade, permissões relatórios

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  document_number TEXT,
  partner_type TEXT NOT NULL DEFAULT 'corporate',
  email TEXT,
  phone TEXT,
  address TEXT,
  commercial_owner TEXT,
  notes TEXT,
  commercial_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON public.crm_companies(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_companies_document ON public.crm_companies(company_id, document_number);

CREATE TABLE IF NOT EXISTS public.crm_company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  role TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_company_id, crm_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_company_contacts_contact ON public.crm_company_contacts(crm_contact_id);

CREATE TABLE IF NOT EXISTS public.crm_loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  points_per_currency NUMERIC(12, 4) NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'BRL',
  tiers JSONB NOT NULL DEFAULT '[
    {"key":"bronze","name":"Bronze","min_points":0},
    {"key":"silver","name":"Prata","min_points":500},
    {"key":"gold","name":"Ouro","min_points":1500},
    {"key":"platinum","name":"Platinum","min_points":4000}
  ]'::jsonb,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_loyalty_programs_company_active
  ON public.crm_loyalty_programs(company_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.crm_loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.crm_loyalty_programs(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  points_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lifetime_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tier_key TEXT NOT NULL DEFAULT 'bronze',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, crm_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_loyalty_accounts_company ON public.crm_loyalty_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_loyalty_accounts_contact ON public.crm_loyalty_accounts(crm_contact_id);

CREATE TABLE IF NOT EXISTS public.crm_loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.crm_loyalty_accounts(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  tx_type TEXT NOT NULL,
  points NUMERIC(14, 2) NOT NULL,
  reservation_id UUID,
  idempotency_key TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_loyalty_tx_idempotency
  ON public.crm_loyalty_transactions(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_loyalty_tx_account ON public.crm_loyalty_transactions(account_id, created_at DESC);

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_loyalty_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_companies' AND policyname = 'crm_companies_auth') THEN
    CREATE POLICY crm_companies_auth ON public.crm_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_company_contacts' AND policyname = 'crm_company_contacts_auth') THEN
    CREATE POLICY crm_company_contacts_auth ON public.crm_company_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_loyalty_programs' AND policyname = 'crm_loyalty_programs_auth') THEN
    CREATE POLICY crm_loyalty_programs_auth ON public.crm_loyalty_programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_loyalty_accounts' AND policyname = 'crm_loyalty_accounts_auth') THEN
    CREATE POLICY crm_loyalty_accounts_auth ON public.crm_loyalty_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_loyalty_transactions' AND policyname = 'crm_loyalty_tx_auth') THEN
    CREATE POLICY crm_loyalty_tx_auth ON public.crm_loyalty_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_companies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_company_contacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_loyalty_programs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_loyalty_accounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_loyalty_transactions TO authenticated, service_role;

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_b2b": {"create": true, "read": true, "update": true}, "crm_loyalty": {"create": true, "read": true, "update": true}, "crm_reports": {"read": true}}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_b2b": {"read": true}, "crm_loyalty": {"read": true}, "crm_reports": {"read": true}}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_b2b": false, "crm_loyalty": false, "crm_reports": false}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');
