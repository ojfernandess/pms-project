-- Helper RLS / RPCs (bundled). Ausente em dumps parciais do Easypanel.

CREATE OR REPLACE FUNCTION public.user_can_access_establishment(
  p_user_id UUID,
  p_establishment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_access BOOLEAN := FALSE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = p_user_id AND is_super_admin = true
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.establishments e
    INNER JOIN public.user_companies uc ON uc.company_id = e.company_id
    WHERE e.id = p_establishment_id
      AND uc.user_id = p_user_id
      AND COALESCE(uc.is_active, true) = true
  ) INTO v_can_access;

  RETURN v_can_access;
END;
$$;

COMMENT ON FUNCTION public.user_can_access_establishment(UUID, UUID) IS
  'Verifica se o usuário pode acessar o estabelecimento (super admin ou user_companies).';

GRANT EXECUTE ON FUNCTION public.user_can_access_establishment(UUID, UUID) TO authenticated, service_role;