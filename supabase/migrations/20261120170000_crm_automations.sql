-- StayOS CRM ETAPA 5 — Automações (triggers / conditions / actions) + templates

CREATE TABLE IF NOT EXISTS public.crm_automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_key TEXT,
  trigger_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_automations_company ON public.crm_automations(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crm_automations_trigger ON public.crm_automations(trigger_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.crm_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_automation ON public.crm_automation_runs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_company ON public.crm_automation_runs(company_id, created_at DESC);

ALTER TABLE public.crm_automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_automation_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_automation_templates' AND policyname = 'crm_auto_templates_auth') THEN
    CREATE POLICY crm_auto_templates_auth ON public.crm_automation_templates FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_automations' AND policyname = 'crm_automations_auth') THEN
    CREATE POLICY crm_automations_auth ON public.crm_automations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_automation_runs' AND policyname = 'crm_auto_runs_auth') THEN
    CREATE POLICY crm_auto_runs_auth ON public.crm_automation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON public.crm_automation_templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_automations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_automation_runs TO authenticated, service_role;

-- Templates iniciais do sistema
INSERT INTO public.crm_automation_templates (template_key, name, description, trigger_type, conditions, actions)
VALUES
  (
    'welcome_after_booking',
    'Boas-vindas após reserva',
    'Cria atividade de sistema no contato quando booking.created chega ao CRM',
    'booking.created',
    '[]'::jsonb,
    '[{"type":"create_activity","activity_type":"system","subject":"Boas-vindas","body":"Reserva capturada no CRM. Preparar comunicação de confirmação."}]'::jsonb
  ),
  (
    'note_on_motor_abandon',
    'Nota em abandono do motor',
    'Registra interação quando lead.abandoned é detectado',
    'lead.abandoned',
    '[]'::jsonb,
    '[{"type":"create_activity","activity_type":"system","subject":"Abandono motor","body":"Lead abandonou o funil do motor. Considerar follow-up."}]'::jsonb
  ),
  (
    'tag_deal_won',
    'Marcar atividade em deal ganho',
    'Quando deal.won / booking convertido, registra atividade comercial',
    'deal.won',
    '[]'::jsonb,
    '[{"type":"create_activity","activity_type":"system","subject":"Deal ganho","body":"Oportunidade convertida / vinculada a reserva."}]'::jsonb
  ),
  (
    'checkout_followup_note',
    'Follow-up pós check-out',
    'Após booking.checked_out, cria nota para follow-up / avaliação',
    'booking.checked_out',
    '[]'::jsonb,
    '[{"type":"create_activity","activity_type":"system","subject":"Pós check-out","body":"Hóspede fez check-out. Avaliar envio de pesquisa / fidelidade."}]'::jsonb
  )
ON CONFLICT (template_key) DO NOTHING;

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_automations": {"create": true, "read": true, "update": true}}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_automations": {"read": true}}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{"crm_automations": false}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');
