-- Escopo FNRH por categoria de quarto (ex.: excluir categorias de prédio sem obrigatoriedade)
ALTER TABLE public.establishment_fnrh_settings
  ADD COLUMN IF NOT EXISTS fnrh_category_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (fnrh_category_scope IN ('all', 'selected'));

ALTER TABLE public.establishment_fnrh_settings
  ADD COLUMN IF NOT EXISTS fnrh_category_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.establishment_fnrh_settings.fnrh_category_scope IS
  'all = FNRH aplica a todas as categorias; selected = apenas categorias em fnrh_category_ids.';
COMMENT ON COLUMN public.establishment_fnrh_settings.fnrh_category_ids IS
  'Quando scope=selected, apenas reservas com category_id nesta lista seguem fluxo FNRH.';

-- Recriar leitura pública
DROP FUNCTION IF EXISTS public.get_fnrh_settings_public(UUID);

CREATE OR REPLACE FUNCTION public.get_fnrh_settings_public(p_establishment_id UUID)
RETURNS TABLE (
  establishment_id UUID,
  enabled BOOLEAN,
  environment TEXT,
  base_url_override TEXT,
  api_username TEXT,
  password_configured BOOLEAN,
  cpf_solicitante TEXT,
  default_motivo_viagem_id TEXT,
  default_meio_transporte_id TEXT,
  default_raca_id TEXT,
  default_deficiencia_id TEXT,
  default_genero_id TEXT,
  situacao_hospede_inicial TEXT,
  auto_submit_on_web_checkin BOOLEAN,
  auto_submit_on_manual_checkin BOOLEAN,
  fnrh_category_scope TEXT,
  fnrh_category_ids UUID[],
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT public.user_can_access_establishment(v_uid, p_establishment_id) THEN
    RAISE EXCEPTION 'Sem permissão para este estabelecimento';
  END IF;

  RETURN QUERY
  SELECT
    s.establishment_id,
    s.enabled,
    s.environment,
    s.base_url_override,
    s.api_username,
    (sec.establishment_id IS NOT NULL AND length(trim(sec.api_password)) > 0) AS password_configured,
    s.cpf_solicitante,
    s.default_motivo_viagem_id,
    s.default_meio_transporte_id,
    s.default_raca_id,
    s.default_deficiencia_id,
    s.default_genero_id,
    s.situacao_hospede_inicial,
    s.auto_submit_on_web_checkin,
    s.auto_submit_on_manual_checkin,
    s.fnrh_category_scope,
    s.fnrh_category_ids,
    s.updated_at
  FROM public.establishment_fnrh_settings s
  LEFT JOIN public.establishment_fnrh_secrets sec ON sec.establishment_id = s.establishment_id
  WHERE s.establishment_id = p_establishment_id;
END;
$$;

COMMENT ON FUNCTION public.get_fnrh_settings_public(UUID) IS
  'Retorna configuração FNRH do estabelecimento sem expor a senha da API.';

-- Recriar upsert com escopo de categorias
DROP FUNCTION IF EXISTS public.upsert_fnrh_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.upsert_fnrh_settings(
  p_establishment_id UUID,
  p_enabled BOOLEAN,
  p_environment TEXT,
  p_base_url_override TEXT,
  p_api_username TEXT,
  p_api_password TEXT,
  p_cpf_solicitante TEXT,
  p_default_motivo_viagem_id TEXT,
  p_default_meio_transporte_id TEXT,
  p_default_raca_id TEXT,
  p_default_deficiencia_id TEXT,
  p_default_genero_id TEXT,
  p_situacao_hospede_inicial TEXT,
  p_auto_submit_on_web_checkin BOOLEAN,
  p_auto_submit_on_manual_checkin BOOLEAN,
  p_fnrh_category_scope TEXT,
  p_fnrh_category_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_pw TEXT;
  v_scope TEXT;
  v_ids UUID[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT public.user_can_access_establishment(v_uid, p_establishment_id) THEN
    RAISE EXCEPTION 'Sem permissão para este estabelecimento';
  END IF;

  v_scope := COALESCE(NULLIF(trim(p_fnrh_category_scope), ''), 'all');
  IF v_scope NOT IN ('all', 'selected') THEN
    v_scope := 'all';
  END IF;

  v_ids := COALESCE(p_fnrh_category_ids, '{}');

  INSERT INTO public.establishment_fnrh_settings (
    establishment_id,
    enabled,
    environment,
    base_url_override,
    api_username,
    cpf_solicitante,
    default_motivo_viagem_id,
    default_meio_transporte_id,
    default_raca_id,
    default_deficiencia_id,
    default_genero_id,
    situacao_hospede_inicial,
    auto_submit_on_web_checkin,
    auto_submit_on_manual_checkin,
    fnrh_category_scope,
    fnrh_category_ids
  )
  VALUES (
    p_establishment_id,
    COALESCE(p_enabled, false),
    COALESCE(NULLIF(trim(p_environment), ''), 'production'),
    NULLIF(trim(p_base_url_override), ''),
    NULLIF(trim(p_api_username), ''),
    COALESCE(NULLIF(trim(p_cpf_solicitante), ''), ''),
    NULLIF(trim(p_default_motivo_viagem_id), ''),
    NULLIF(trim(p_default_meio_transporte_id), ''),
    NULLIF(trim(p_default_raca_id), ''),
    NULLIF(trim(p_default_deficiencia_id), ''),
    NULLIF(trim(p_default_genero_id), ''),
    COALESCE(NULLIF(trim(p_situacao_hospede_inicial), ''), 'CHECKIN_REALIZADO'),
    COALESCE(p_auto_submit_on_web_checkin, true),
    COALESCE(p_auto_submit_on_manual_checkin, true),
    v_scope,
    v_ids
  )
  ON CONFLICT (establishment_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    environment = EXCLUDED.environment,
    base_url_override = EXCLUDED.base_url_override,
    api_username = EXCLUDED.api_username,
    cpf_solicitante = EXCLUDED.cpf_solicitante,
    default_motivo_viagem_id = EXCLUDED.default_motivo_viagem_id,
    default_meio_transporte_id = EXCLUDED.default_meio_transporte_id,
    default_raca_id = EXCLUDED.default_raca_id,
    default_deficiencia_id = EXCLUDED.default_deficiencia_id,
    default_genero_id = EXCLUDED.default_genero_id,
    situacao_hospede_inicial = EXCLUDED.situacao_hospede_inicial,
    auto_submit_on_web_checkin = EXCLUDED.auto_submit_on_web_checkin,
    auto_submit_on_manual_checkin = EXCLUDED.auto_submit_on_manual_checkin,
    fnrh_category_scope = EXCLUDED.fnrh_category_scope,
    fnrh_category_ids = EXCLUDED.fnrh_category_ids,
    updated_at = NOW();

  v_pw := NULLIF(trim(p_api_password), '');
  IF v_pw IS NOT NULL THEN
    INSERT INTO public.establishment_fnrh_secrets (establishment_id, api_password)
    VALUES (p_establishment_id, v_pw)
    ON CONFLICT (establishment_id) DO UPDATE SET
      api_password = EXCLUDED.api_password,
      updated_at = NOW();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_fnrh_settings IS
  'Atualiza configuração FNRH; senha da API só é alterada quando p_api_password não é vazio.';

GRANT EXECUTE ON FUNCTION public.get_fnrh_settings_public(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_fnrh_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, UUID[]
) TO authenticated;
