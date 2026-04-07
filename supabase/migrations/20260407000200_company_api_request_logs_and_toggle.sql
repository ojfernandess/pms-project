-- Log de chamadas à API pública por empresa (company-public-api)
CREATE TABLE IF NOT EXISTS public.company_api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  http_method TEXT NOT NULL DEFAULT '',
  action TEXT,
  status_code INTEGER NOT NULL,
  response_snippet TEXT,
  client_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_api_request_logs_company_created
  ON public.company_api_request_logs(company_id, created_at DESC);

ALTER TABLE public.company_api_request_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.company_api_request_logs IS
  'Histórico resumido de chamadas à Edge Function company-public-api por empresa.';

CREATE OR REPLACE FUNCTION public.set_company_api_credentials_active(
  p_company_id UUID,
  p_is_active BOOLEAN
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_has_access BOOLEAN;
  v_flag_enabled BOOLEAN;
  v_updated INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    WHERE uc.user_id = v_uid
      AND uc.company_id = p_company_id
      AND COALESCE(uc.is_active, true) = true
  )
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Sem permissão para esta empresa';
  END IF;

  IF p_is_active = true THEN
    SELECT public.company_has_feature_access('api_integrations', p_company_id)
    INTO v_flag_enabled;
    IF COALESCE(v_flag_enabled, false) = false THEN
      RAISE EXCEPTION 'Funcionalidade api_integrations desativada para esta empresa';
    END IF;
  END IF;

  UPDATE public.company_api_credentials
  SET is_active = p_is_active,
      updated_at = NOW()
  WHERE company_id = p_company_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Nenhuma credencial de API cadastrada para esta empresa';
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.set_company_api_credentials_active(UUID, BOOLEAN) IS
  'Ativa ou desativa credenciais de API da empresa. Reativar exige feature api_integrations.';

CREATE OR REPLACE FUNCTION public.get_company_api_request_logs(
  p_company_id UUID,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  id UUID,
  company_id UUID,
  http_method TEXT,
  action TEXT,
  status_code INTEGER,
  response_snippet TEXT,
  client_ip TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_has_access BOOLEAN;
  v_lim INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    WHERE uc.user_id = v_uid
      AND uc.company_id = p_company_id
      AND COALESCE(uc.is_active, true) = true
  )
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Sem permissão para esta empresa';
  END IF;

  v_lim := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));

  RETURN QUERY
  SELECT
    l.id,
    l.company_id,
    l.http_method,
    l.action,
    l.status_code,
    l.response_snippet,
    l.client_ip,
    l.created_at
  FROM public.company_api_request_logs l
  WHERE l.company_id = p_company_id
  ORDER BY l.created_at DESC
  LIMIT v_lim;
END;
$$;

COMMENT ON FUNCTION public.get_company_api_request_logs(UUID, INTEGER) IS
  'Lista últimas chamadas à API pública da empresa (painel).';

GRANT EXECUTE ON FUNCTION public.set_company_api_credentials_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_api_request_logs(UUID, INTEGER) TO authenticated;
