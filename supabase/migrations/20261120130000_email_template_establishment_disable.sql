-- Permite desativar envio de um template por estabelecimento (is_active=false → não envia, sem fallback global).

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
  LIMIT 1;

  IF FOUND AND v_override.is_active IS NOT TRUE THEN
    RETURN NULL;
  END IF;

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
  'Template efetivo: personalização do estabelecimento, padrão global, ou NULL se desativado no estabelecimento.';

COMMENT ON COLUMN public.establishment_email_templates.is_active IS
  'false = estabelecimento desativou o envio deste evento (não usa o template global). true = envia (custom ou global conforme use_custom_template).';
