-- Origem: supabase migrations 20260407000100 + 20260407000200
-- Aplicar no arranque do backend via apply-order.txt

-- Credenciais de API por empresa (client_id/client_secret)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.company_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_api_credentials_company_id
  ON public.company_api_credentials(company_id);

CREATE INDEX IF NOT EXISTS idx_company_api_credentials_active
  ON public.company_api_credentials(is_active);

ALTER TABLE public.company_api_credentials ENABLE ROW LEVEL SECURITY;

-- Sem políticas explícitas: acesso apenas por service role e funções SECURITY DEFINER.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_company_api_credentials_updated_at
      ON public.company_api_credentials;
    CREATE TRIGGER update_company_api_credentials_updated_at
      BEFORE UPDATE ON public.company_api_credentials
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE public.company_api_credentials IS
  'Credenciais de API por empresa para integrações externas (client_id + hash do client_secret).';

COMMENT ON COLUMN public.company_api_credentials.client_id IS
  'Identificador público da integração da empresa.';

COMMENT ON COLUMN public.company_api_credentials.client_secret_hash IS
  'Hash SHA-256 do client_secret (o secret em texto é mostrado apenas na rotação/geração).';

CREATE OR REPLACE FUNCTION public.rotate_company_api_credentials(
  p_company_id UUID
) RETURNS TABLE (
  company_id UUID,
  client_id TEXT,
  client_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_has_access BOOLEAN;
  v_flag_enabled BOOLEAN;
  v_client_id TEXT;
  v_client_secret TEXT;
  v_secret_hash TEXT;
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

  SELECT public.company_has_feature_access('api_integrations', p_company_id)
  INTO v_flag_enabled;

  IF COALESCE(v_flag_enabled, false) = false THEN
    RAISE EXCEPTION 'Funcionalidade api_integrations desativada para esta empresa';
  END IF;

  v_client_id := 'cid_' || encode(gen_random_bytes(16), 'hex');
  v_client_secret := 'cs_' || encode(gen_random_bytes(32), 'hex');
  v_secret_hash := encode(digest(v_client_secret, 'sha256'), 'hex');

  INSERT INTO public.company_api_credentials (
    company_id,
    client_id,
    client_secret_hash,
    is_active,
    last_used_at,
    created_by
  )
  VALUES (
    p_company_id,
    v_client_id,
    v_secret_hash,
    true,
    NULL,
    v_uid
  )
  ON CONFLICT (company_id)
  DO UPDATE SET
    client_id = EXCLUDED.client_id,
    client_secret_hash = EXCLUDED.client_secret_hash,
    is_active = true,
    last_used_at = NULL,
    created_by = EXCLUDED.created_by,
    updated_at = NOW();

  RETURN QUERY
  SELECT p_company_id, v_client_id, v_client_secret;
END;
$$;

COMMENT ON FUNCTION public.rotate_company_api_credentials(UUID) IS
  'Gera/rotaciona credenciais de API da empresa. Requer usuário autenticado vinculado à empresa e feature api_integrations ativa.';

CREATE OR REPLACE FUNCTION public.get_company_api_credentials_status(
  p_company_id UUID
) RETURNS TABLE (
  company_id UUID,
  client_id TEXT,
  is_active BOOLEAN,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_has_access BOOLEAN;
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

  RETURN QUERY
  SELECT
    c.company_id,
    c.client_id,
    c.is_active,
    c.last_used_at,
    c.updated_at
  FROM public.company_api_credentials c
  WHERE c.company_id = p_company_id
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_company_api_credentials_status(UUID) IS
  'Retorna metadados não sensíveis das credenciais de API da empresa para uso no painel.';

GRANT EXECUTE ON FUNCTION public.rotate_company_api_credentials(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_api_credentials_status(UUID) TO authenticated;


-- Log de chamadas ? API p?blica por empresa (company-public-api)
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
  'Hist?rico resumido de chamadas ? Edge Function company-public-api por empresa.';

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
    RAISE EXCEPTION 'Usu?rio n?o autenticado';
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
    RAISE EXCEPTION 'Sem permiss?o para esta empresa';
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
    RAISE EXCEPTION 'Usu?rio n?o autenticado';
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
    RAISE EXCEPTION 'Sem permiss?o para esta empresa';
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
  'Lista ?ltimas chamadas ? API p?blica da empresa (painel).';

GRANT EXECUTE ON FUNCTION public.set_company_api_credentials_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_api_request_logs(UUID, INTEGER) TO authenticated;
