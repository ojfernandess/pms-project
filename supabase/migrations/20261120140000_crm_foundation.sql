-- LEGADO / espelho — NÃO aplicar via Supabase.
-- Produção Postgres: backend/scripts/migration/apply-crm.sh (ver APLICAR_CRM.md)
-- StayOS CRM Foundation (ETAPA 1)
-- Company-scoped CRM tables linked to operational clients; no reservation copies.

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

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive authenticated policies; company scoping enforced in app/Nest.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_contacts' AND policyname = 'crm_contacts_authenticated_all'
  ) THEN
    CREATE POLICY crm_contacts_authenticated_all ON public.crm_contacts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_contact_client_links' AND policyname = 'crm_links_authenticated_all'
  ) THEN
    CREATE POLICY crm_links_authenticated_all ON public.crm_contact_client_links
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_activities' AND policyname = 'crm_activities_authenticated_all'
  ) THEN
    CREATE POLICY crm_activities_authenticated_all ON public.crm_activities
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_consent' AND policyname = 'crm_consent_authenticated_all'
  ) THEN
    CREATE POLICY crm_consent_authenticated_all ON public.crm_consent
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_outbox_events' AND policyname = 'crm_outbox_authenticated_all'
  ) THEN
    CREATE POLICY crm_outbox_authenticated_all ON public.crm_outbox_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_audit_logs' AND policyname = 'crm_audit_authenticated_all'
  ) THEN
    CREATE POLICY crm_audit_authenticated_all ON public.crm_audit_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contact_client_links TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_consent TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_outbox_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_audit_logs TO authenticated, service_role;

-- Role permissions
UPDATE public.employee_roles
SET permissions = permissions || '{"crm": true, "crm_contacts": {"create": true, "read": true, "update": true}}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm": {"read": true}, "crm_contacts": {"read": true, "create": false, "update": false}}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm": false, "crm_contacts": false}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');

COMMENT ON TABLE public.crm_contacts IS 'StayOS CRM unified contact profile (company-scoped); links to operational clients';
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. Inclui crm, crm_contacts e demais módulos do PMS';

-- Public/motor-safe enqueue + sync (SECURITY DEFINER). Does not alter reservation RPCs.
CREATE OR REPLACE FUNCTION public.crm_enqueue_outbox(
  p_event_type TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_establishment_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := p_company_id;
  v_id UUID;
BEGIN
  IF v_company_id IS NULL AND p_establishment_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.establishments
    WHERE id = p_establishment_id;
  END IF;

  INSERT INTO public.crm_outbox_events (
    company_id, establishment_id, event_type, payload, idempotency_key
  ) VALUES (
    v_company_id, p_establishment_id, p_event_type, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = EXCLUDED.payload
  RETURNING id INTO v_id;

  -- Sync contact when client payload is present
  IF (p_event_type IN ('contact.upserted', 'booking.created'))
     AND v_company_id IS NOT NULL
     AND (p_payload ? 'client_id')
     AND COALESCE(p_payload->>'full_name', p_payload->>'guest_name', '') <> ''
  THEN
    PERFORM public.crm_upsert_contact_from_client(
      v_company_id,
      (p_payload->>'client_id')::uuid,
      p_establishment_id,
      COALESCE(p_payload->>'full_name', p_payload->>'guest_name'),
      p_payload->>'email',
      p_payload->>'phone',
      p_payload->>'document_type',
      p_payload->>'document_number',
      COALESCE(p_payload->>'source', p_event_type)
    );
  END IF;

  UPDATE public.crm_outbox_events
  SET processed_at = now(), error = NULL
  WHERE id = v_id AND processed_at IS NULL;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_upsert_contact_from_client(
  p_company_id UUID,
  p_client_id UUID,
  p_establishment_id UUID,
  p_full_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_document_number TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'pms_client'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  SELECT id INTO v_contact_id
  FROM public.crm_contacts
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND (
      (p_email IS NOT NULL AND lower(email) = lower(p_email))
      OR (p_document_number IS NOT NULL AND document_number = p_document_number)
      OR (p_phone IS NOT NULL AND phone = p_phone)
    )
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.crm_contacts (
      company_id, full_name, email, phone, whatsapp, document_type, document_number, source
    ) VALUES (
      p_company_id, p_full_name, p_email, p_phone, p_phone, p_document_type, p_document_number, p_source
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.crm_contacts SET
      full_name = COALESCE(p_full_name, full_name),
      email = COALESCE(p_email, email),
      phone = COALESCE(p_phone, phone),
      whatsapp = COALESCE(p_phone, whatsapp),
      document_type = COALESCE(p_document_type, document_type),
      document_number = COALESCE(p_document_number, document_number),
      source = COALESCE(p_source, source),
      updated_at = now()
    WHERE id = v_contact_id;
  END IF;

  INSERT INTO public.crm_contact_client_links (crm_contact_id, client_id, establishment_id)
  VALUES (v_contact_id, p_client_id, p_establishment_id)
  ON CONFLICT (crm_contact_id, client_id) DO UPDATE
    SET establishment_id = COALESCE(EXCLUDED.establishment_id, crm_contact_client_links.establishment_id);

  RETURN v_contact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_enqueue_outbox(TEXT, JSONB, TEXT, UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_upsert_contact_from_client(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
