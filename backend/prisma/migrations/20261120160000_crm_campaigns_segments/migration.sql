-- StayOS CRM ETAPA 4 — Segmentos, campanhas, recipients (+ consentimento)
-- Envio assíncrono via fila BullMQ (crm); não cria segundo canal WhatsApp.

CREATE TABLE IF NOT EXISTS public.crm_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_segments_company ON public.crm_segments(company_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES public.crm_segments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_company ON public.crm_campaigns(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON public.crm_campaigns(status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.crm_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  crm_contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  skip_reason TEXT,
  error TEXT,
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, crm_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign ON public.crm_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_contact ON public.crm_campaign_recipients(crm_contact_id);

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_segments' AND policyname = 'crm_segments_authenticated_all') THEN
    CREATE POLICY crm_segments_authenticated_all ON public.crm_segments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_campaigns' AND policyname = 'crm_campaigns_authenticated_all') THEN
    CREATE POLICY crm_campaigns_authenticated_all ON public.crm_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_campaign_recipients' AND policyname = 'crm_recipients_authenticated_all') THEN
    CREATE POLICY crm_recipients_authenticated_all ON public.crm_campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_segments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaigns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_recipients TO authenticated, service_role;

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_campaigns": {"create": true, "read": true, "update": true}}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_campaigns": {"read": true}}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_campaigns": false}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');
