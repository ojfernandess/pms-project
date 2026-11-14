-- Feature flags por empresa / estabelecimento (bundled para cutover sem Supabase)

CREATE OR REPLACE FUNCTION public.company_has_feature_access(
  p_feature_key TEXT,
  p_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_feature_config JSONB;
  v_features_enabled JSONB;
BEGIN
  SELECT features_enabled INTO v_features_enabled
  FROM public.site_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_features_enabled IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (v_features_enabled ? p_feature_key) THEN
    RETURN false;
  END IF;

  v_feature_config := v_features_enabled->p_feature_key;

  IF jsonb_typeof(v_feature_config) = 'boolean' THEN
    RETURN v_feature_config::boolean;
  END IF;

  IF jsonb_typeof(v_feature_config) = 'object' THEN
    IF COALESCE((v_feature_config->>'enabled')::boolean, false) = false THEN
      RETURN false;
    END IF;

    IF v_feature_config ? 'company_ids' THEN
      RETURN p_company_id::text = ANY(
        SELECT jsonb_array_elements_text(v_feature_config->'company_ids')
      );
    END IF;

    IF v_feature_config ? 'establishment_ids' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.establishments e
        WHERE e.company_id = p_company_id
          AND e.id::text = ANY(
            SELECT jsonb_array_elements_text(v_feature_config->'establishment_ids')
          )
      );
    END IF;

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.company_has_feature_access IS
  'Verifica acesso da empresa à feature. Suporta boolean global, objeto com company_ids e objeto com establishment_ids.';

GRANT EXECUTE ON FUNCTION public.company_has_feature_access(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_feature_access(TEXT, UUID) TO anon;