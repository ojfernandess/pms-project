-- Integração FNRH (Ficha Nacional de Registro de Hóspedes) — configuração por estabelecimento,
-- segredos apenas para service role, log de auditoria e idempotência.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Configuração não sensível (UI / políticas RLS)
CREATE TABLE IF NOT EXISTS public.establishment_fnrh_settings (
  establishment_id UUID PRIMARY KEY REFERENCES public.establishments(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'homologation')),
  base_url_override TEXT NULL,
  api_username TEXT NULL,
  cpf_solicitante TEXT NOT NULL DEFAULT '',
  default_motivo_viagem_id TEXT NULL,
  default_meio_transporte_id TEXT NULL,
  default_raca_id TEXT NULL DEFAULT 'NAOINFORMAR',
  default_deficiencia_id TEXT NULL DEFAULT 'NAO',
  default_genero_id TEXT NULL DEFAULT 'NAOINFORMADO',
  situacao_hospede_inicial TEXT NOT NULL DEFAULT 'CHECKIN_REALIZADO',
  auto_submit_on_web_checkin BOOLEAN NOT NULL DEFAULT true,
  auto_submit_on_manual_checkin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.establishment_fnrh_settings IS
  'Parâmetros públicos da integração FNRH por estabelecimento (credenciais em establishment_fnrh_secrets).';

-- Senha da API (Basic Auth) — sem políticas RLS para usuários; apenas service role acessa.
CREATE TABLE IF NOT EXISTS public.establishment_fnrh_secrets (
  establishment_id UUID PRIMARY KEY REFERENCES public.establishments(id) ON DELETE CASCADE,
  api_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.establishment_fnrh_secrets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.establishment_fnrh_secrets IS
  'Senha da API FNRH (Basic Auth). Não expor ao cliente; leitura apenas via service role ou RPC SECURITY DEFINER.';

DROP TRIGGER IF EXISTS update_establishment_fnrh_settings_updated_at ON public.establishment_fnrh_settings;
CREATE TRIGGER update_establishment_fnrh_settings_updated_at
  BEFORE UPDATE ON public.establishment_fnrh_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_establishment_fnrh_secrets_updated_at ON public.establishment_fnrh_secrets;
CREATE TRIGGER update_establishment_fnrh_secrets_updated_at
  BEFORE UPDATE ON public.establishment_fnrh_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log de envio / idempotência (hash do pedido, sem corpo completo — LGPD)
CREATE TABLE IF NOT EXISTS public.fnrh_submission_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  web_checkin_id UUID REFERENCES public.web_checkin(id) ON DELETE SET NULL,
  operation TEXT NOT NULL DEFAULT 'hospedagem_registrar',
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  http_status INT NULL,
  fnrh_reserva_id TEXT NULL,
  error_message TEXT NULL,
  request_sha256 TEXT NULL,
  response_summary JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fnrh_submission_log_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fnrh_submission_log_est_res
  ON public.fnrh_submission_log(establishment_id, reservation_id);

COMMENT ON TABLE public.fnrh_submission_log IS
  'Auditoria de envios FNRH: status, código HTTP, resumo; idempotência por chave derivada da reserva.';

ALTER TABLE public.fnrh_submission_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fnrh_submission_log_select_establishment"
  ON public.fnrh_submission_log FOR SELECT TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

-- Cache opcional de domínios FNRH (evita chamadas repetidas à API de listas)
CREATE TABLE IF NOT EXISTS public.fnrh_domain_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (establishment_id, cache_key)
);

ALTER TABLE public.fnrh_domain_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fnrh_domain_cache_select_establishment"
  ON public.fnrh_domain_cache FOR SELECT TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "fnrh_domain_cache_all_establishment"
  ON public.fnrh_domain_cache FOR ALL TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

ALTER TABLE public.establishment_fnrh_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "establishment_fnrh_settings_select"
  ON public.establishment_fnrh_settings FOR SELECT TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "establishment_fnrh_settings_insert"
  ON public.establishment_fnrh_settings FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "establishment_fnrh_settings_update"
  ON public.establishment_fnrh_settings FOR UPDATE TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "establishment_fnrh_settings_delete"
  ON public.establishment_fnrh_settings FOR DELETE TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

-- Leitura segura para o painel (sem senha)
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
    s.updated_at
  FROM public.establishment_fnrh_settings s
  LEFT JOIN public.establishment_fnrh_secrets sec ON sec.establishment_id = s.establishment_id
  WHERE s.establishment_id = p_establishment_id;
END;
$$;

COMMENT ON FUNCTION public.get_fnrh_settings_public(UUID) IS
  'Retorna configuração FNRH do estabelecimento sem expor a senha da API.';

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
  p_auto_submit_on_manual_checkin BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_pw TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT public.user_can_access_establishment(v_uid, p_establishment_id) THEN
    RAISE EXCEPTION 'Sem permissão para este estabelecimento';
  END IF;

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
    auto_submit_on_manual_checkin
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
    COALESCE(p_auto_submit_on_manual_checkin, true)
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

GRANT EXECUTE ON FUNCTION public.get_fnrh_settings_public(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_fnrh_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated;
