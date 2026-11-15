-- RPCs credenciais API (ASCII UTF-8). Requer public.company_api_credentials e auth.uid().
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.rotate_company_api_credentials(
  p_company_id UUID
) RETURNS TABLE (
  company_id UUID,
  client_id TEXT,
  client_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    RAISE EXCEPTION 'Usuario nao autenticado';
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
    RAISE EXCEPTION 'Sem permissao para esta empresa';
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
    RAISE EXCEPTION 'Usuario nao autenticado';
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
    RAISE EXCEPTION 'Sem permissao para esta empresa';
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

GRANT EXECUTE ON FUNCTION public.rotate_company_api_credentials(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_api_credentials_status(UUID) TO authenticated;