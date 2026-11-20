-- StayOS CRM ETAPA 2 — Pipelines, stages, deals (Kanban)
-- Conversão = vincular deal a reservations.id existente (não cria reserva).

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_company ON public.crm_pipelines(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_pipelines_company_default
  ON public.crm_pipelines(company_id)
  WHERE is_default = true AND is_active = true;

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  stage_key TEXT NOT NULL,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, stage_key),
  UNIQUE (pipeline_id, position)
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_pipeline ON public.crm_pipeline_stages(pipeline_id, position);

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  crm_contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  source TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  owner_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  lost_reason TEXT,
  converted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_company_stage ON public.crm_deals(company_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON public.crm_deals(pipeline_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON public.crm_deals(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_quote ON public.crm_deals(quote_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_reservation ON public.crm_deals(reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_deals_quote_unique
  ON public.crm_deals(quote_id)
  WHERE quote_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_pipelines' AND policyname = 'crm_pipelines_authenticated_all') THEN
    CREATE POLICY crm_pipelines_authenticated_all ON public.crm_pipelines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_pipeline_stages' AND policyname = 'crm_stages_authenticated_all') THEN
    CREATE POLICY crm_stages_authenticated_all ON public.crm_pipeline_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_deals' AND policyname = 'crm_deals_authenticated_all') THEN
    CREATE POLICY crm_deals_authenticated_all ON public.crm_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_stages TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated, service_role;

-- Default pipeline + stages for a company
CREATE OR REPLACE FUNCTION public.crm_ensure_default_pipeline(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
  v_stage RECORD;
BEGIN
  SELECT id INTO v_pipeline_id
  FROM public.crm_pipelines
  WHERE company_id = p_company_id AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    INSERT INTO public.crm_pipelines (company_id, name, is_default, is_active)
    VALUES (p_company_id, 'Vendas', true, true)
    RETURNING id INTO v_pipeline_id;

    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, position, stage_key, is_won, is_lost) VALUES
      (v_pipeline_id, 'Lead', 0, 'lead', false, false),
      (v_pipeline_id, 'Qualificado', 1, 'qualified', false, false),
      (v_pipeline_id, 'Proposta', 2, 'proposal', false, false),
      (v_pipeline_id, 'Ganho', 3, 'won', true, false),
      (v_pipeline_id, 'Perdido', 4, 'lost', false, true);
  END IF;

  RETURN v_pipeline_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_upsert_deal_from_quote(
  p_company_id UUID,
  p_establishment_id UUID,
  p_quote_id UUID,
  p_title TEXT,
  p_amount NUMERIC DEFAULT 0,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'quote',
  p_stage_key TEXT DEFAULT 'proposal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
  v_stage_id UUID;
  v_contact_id UUID;
  v_deal_id UUID;
BEGIN
  v_pipeline_id := public.crm_ensure_default_pipeline(p_company_id);

  SELECT id INTO v_stage_id
  FROM public.crm_pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND stage_key = COALESCE(p_stage_key, 'proposal')
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    SELECT id INTO v_stage_id
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = v_pipeline_id
    ORDER BY position
    LIMIT 1;
  END IF;

  IF p_client_id IS NOT NULL AND COALESCE(p_full_name, '') <> '' THEN
    v_contact_id := public.crm_upsert_contact_from_client(
      p_company_id, p_client_id, p_establishment_id,
      p_full_name, p_email, p_phone, NULL, NULL, p_source
    );
  ELSIF COALESCE(p_full_name, p_email, '') <> '' THEN
    SELECT id INTO v_contact_id
    FROM public.crm_contacts
    WHERE company_id = p_company_id AND deleted_at IS NULL
      AND (
        (p_email IS NOT NULL AND lower(email) = lower(p_email))
        OR (p_phone IS NOT NULL AND phone = p_phone)
      )
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      INSERT INTO public.crm_contacts (company_id, full_name, email, phone, whatsapp, source)
      VALUES (
        p_company_id,
        COALESCE(NULLIF(p_full_name, ''), COALESCE(p_email, 'Lead')),
        p_email, p_phone, p_phone, p_source
      )
      RETURNING id INTO v_contact_id;
    END IF;
  END IF;

  SELECT id INTO v_deal_id
  FROM public.crm_deals
  WHERE quote_id = p_quote_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_deal_id IS NULL THEN
    INSERT INTO public.crm_deals (
      company_id, pipeline_id, stage_id, crm_contact_id, title, amount,
      source, status, quote_id, establishment_id
    ) VALUES (
      p_company_id, v_pipeline_id, v_stage_id, v_contact_id,
      COALESCE(NULLIF(p_title, ''), 'Orçamento'),
      COALESCE(p_amount, 0), p_source, 'open', p_quote_id, p_establishment_id
    )
    RETURNING id INTO v_deal_id;
  ELSE
    UPDATE public.crm_deals SET
      title = COALESCE(NULLIF(p_title, ''), title),
      amount = COALESCE(p_amount, amount),
      crm_contact_id = COALESCE(v_contact_id, crm_contact_id),
      updated_at = now()
    WHERE id = v_deal_id;
  END IF;

  RETURN v_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_upsert_abandoned_lead(
  p_company_id UUID,
  p_establishment_id UUID,
  p_full_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT 0,
  p_checkin_date TEXT DEFAULT NULL,
  p_checkout_date TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
  v_stage_id UUID;
  v_contact_id UUID;
  v_deal_id UUID;
  v_title TEXT;
BEGIN
  IF COALESCE(p_email, p_phone, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Idempotency via outbox key when provided
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.crm_enqueue_outbox(
      'lead.abandoned',
      jsonb_build_object(
        'full_name', p_full_name,
        'email', p_email,
        'phone', p_phone,
        'amount', p_amount,
        'checkin_date', p_checkin_date,
        'checkout_date', p_checkout_date,
        'source', 'motor_abandon'
      ),
      p_idempotency_key,
      p_establishment_id,
      p_company_id
    );
  END IF;

  v_pipeline_id := public.crm_ensure_default_pipeline(p_company_id);
  SELECT id INTO v_stage_id FROM public.crm_pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND stage_key = 'lead' LIMIT 1;

  SELECT id INTO v_contact_id
  FROM public.crm_contacts
  WHERE company_id = p_company_id AND deleted_at IS NULL
    AND (
      (p_email IS NOT NULL AND lower(email) = lower(p_email))
      OR (p_phone IS NOT NULL AND phone = p_phone)
    )
  ORDER BY updated_at DESC LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.crm_contacts (company_id, full_name, email, phone, whatsapp, source)
    VALUES (p_company_id, COALESCE(NULLIF(p_full_name, ''), COALESCE(p_email, 'Lead')), p_email, p_phone, p_phone, 'motor_abandon')
    RETURNING id INTO v_contact_id;
  END IF;

  -- Avoid duplicate open abandoned leads for same contact in last 24h
  SELECT d.id INTO v_deal_id
  FROM public.crm_deals d
  WHERE d.company_id = p_company_id
    AND d.crm_contact_id = v_contact_id
    AND d.source = 'motor_abandon'
    AND d.status = 'open'
    AND d.deleted_at IS NULL
    AND d.created_at > now() - interval '24 hours'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_deal_id IS NOT NULL THEN
    RETURN v_deal_id;
  END IF;

  v_title := 'Abandono motor'
    || CASE WHEN p_checkin_date IS NOT NULL THEN ' · ' || p_checkin_date ELSE '' END;

  INSERT INTO public.crm_deals (
    company_id, pipeline_id, stage_id, crm_contact_id, title, amount,
    source, status, establishment_id, metadata
  ) VALUES (
    p_company_id, v_pipeline_id, v_stage_id, v_contact_id, v_title, COALESCE(p_amount, 0),
    'motor_abandon', 'open', p_establishment_id,
    jsonb_build_object('checkin_date', p_checkin_date, 'checkout_date', p_checkout_date)
  )
  RETURNING id INTO v_deal_id;

  RETURN v_deal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_ensure_default_pipeline(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_upsert_deal_from_quote(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_upsert_abandoned_lead(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Permissions
UPDATE public.employee_roles
SET permissions = permissions || '{"crm_deals": {"create": true, "read": true, "update": true}}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_deals": {"read": true}}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_deals": false}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');
