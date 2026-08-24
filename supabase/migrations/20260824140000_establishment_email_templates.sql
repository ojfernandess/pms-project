-- Templates de e-mail personalizados por estabelecimento (override sobre padrão global)

CREATE TABLE IF NOT EXISTS public.establishment_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  event_type public.email_event_type NOT NULL,
  parent_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  use_custom_template BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  logo_url TEXT,
  primary_color TEXT,
  footer_text TEXT,
  cc_emails TEXT,
  bcc_emails TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT establishment_email_templates_unique_event UNIQUE (establishment_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_establishment_email_templates_establishment
  ON public.establishment_email_templates(establishment_id);

CREATE INDEX IF NOT EXISTS idx_establishment_email_templates_event
  ON public.establishment_email_templates(event_type);

CREATE TRIGGER update_establishment_email_templates_updated_at
  BEFORE UPDATE ON public.establishment_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.establishment_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS establishment_email_templates_select ON public.establishment_email_templates;
CREATE POLICY establishment_email_templates_select
  ON public.establishment_email_templates
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

DROP POLICY IF EXISTS establishment_email_templates_manage ON public.establishment_email_templates;
CREATE POLICY establishment_email_templates_manage
  ON public.establishment_email_templates
  FOR ALL
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

COMMENT ON TABLE public.establishment_email_templates IS
  'Overrides de templates de e-mail por estabelecimento. Quando use_custom_template=false, usa o template global padrão.';

-- Helper: template global ativo permitido para o estabelecimento
CREATE OR REPLACE FUNCTION public.email_template_allows_establishment(
  p_establishment_ids JSONB,
  p_establishment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_establishment_ids IS NULL THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(p_establishment_ids) = 'array' AND jsonb_array_length(p_establishment_ids) = 0 THEN
    RETURN FALSE;
  END IF;

  IF jsonb_typeof(p_establishment_ids) = 'array' THEN
    RETURN p_establishment_ids @> to_jsonb(p_establishment_id::text);
  END IF;

  RETURN TRUE;
END;
$$;

-- Resolve template efetivo: override do estabelecimento + fallback global
CREATE OR REPLACE FUNCTION public.get_resolved_email_template(
  p_event_type public.email_event_type,
  p_establishment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global public.email_templates%ROWTYPE;
  v_override public.establishment_email_templates%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT *
  INTO v_global
  FROM public.email_templates et
  WHERE et.event_type = p_event_type
    AND et.is_active = TRUE
    AND (
      p_establishment_id IS NULL
      OR public.email_template_allows_establishment(et.establishment_ids, p_establishment_id)
    )
  ORDER BY et.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_establishment_id IS NULL THEN
    RETURN to_jsonb(v_global);
  END IF;

  SELECT *
  INTO v_override
  FROM public.establishment_email_templates eet
  WHERE eet.establishment_id = p_establishment_id
    AND eet.event_type = p_event_type
    AND eet.is_active = TRUE
  LIMIT 1;

  IF NOT FOUND OR v_override.use_custom_template IS NOT TRUE THEN
    RETURN to_jsonb(v_global);
  END IF;

  v_result := to_jsonb(v_global);

  IF v_override.parent_template_id IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('parent_template_id', v_override.parent_template_id);
  END IF;

  v_result := v_result || jsonb_build_object(
    'is_establishment_override', TRUE,
    'establishment_template_id', v_override.id,
    'name', COALESCE(v_override.name, v_global.name),
    'subject', COALESCE(v_override.subject, v_global.subject),
    'body_html', COALESCE(v_override.body_html, v_global.body_html),
    'body_text', COALESCE(v_override.body_text, v_global.body_text),
    'variables', COALESCE(v_override.variables, v_global.variables),
    'logo_url', COALESCE(v_override.logo_url, v_global.logo_url),
    'primary_color', COALESCE(v_override.primary_color, v_global.primary_color),
    'footer_text', COALESCE(v_override.footer_text, v_global.footer_text),
    'cc_emails', COALESCE(v_override.cc_emails, v_global.cc_emails),
    'bcc_emails', COALESCE(v_override.bcc_emails, v_global.bcc_emails)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_resolved_email_template IS
  'Retorna template de e-mail efetivo: personalizado do estabelecimento ou padrão global.';

GRANT EXECUTE ON FUNCTION public.get_resolved_email_template(public.email_event_type, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resolved_email_template(public.email_event_type, UUID) TO service_role;
