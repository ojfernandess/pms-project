-- StayOS CRM Foundation (ETAPA 1)
-- Mirrors supabase/migrations/20261120140000_crm_foundation.sql

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  document_type TEXT,
  document_number TEXT,
  source TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification TEXT,
  owner_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_id ON public.crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_email ON public.crm_contacts(company_id, email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_phone ON public.crm_contacts(company_id, phone);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_document ON public.crm_contacts(company_id, document_number);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_deleted_at ON public.crm_contacts(deleted_at);

CREATE TABLE IF NOT EXISTS public.crm_contact_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_contact_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_client_links_client ON public.crm_contact_client_links(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_client_links_contact ON public.crm_contact_client_links(crm_contact_id);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON public.crm_activities(crm_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_company ON public.crm_activities(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_contact_id, channel, purpose)
);

CREATE INDEX IF NOT EXISTS idx_crm_consent_contact ON public.crm_consent(crm_contact_id);

CREATE TABLE IF NOT EXISTS public.crm_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_outbox_unprocessed ON public.crm_outbox_events(processed_at, created_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_outbox_company ON public.crm_outbox_events(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_user_id UUID,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_company ON public.crm_audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_contact ON public.crm_audit_logs(crm_contact_id, created_at DESC);
