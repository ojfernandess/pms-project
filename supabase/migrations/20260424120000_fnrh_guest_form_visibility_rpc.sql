-- Visibilidade do formulário FNRH no check-in web (hóspede anon): integração ativa + categoria no escopo.
CREATE OR REPLACE FUNCTION public.get_fnrh_guest_form_visibility(
  p_establishment_id UUID,
  p_category_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_scope TEXT;
  v_ids UUID[];
BEGIN
  SELECT s.enabled,
         COALESCE(s.fnrh_category_scope, 'all'),
         s.fnrh_category_ids
  INTO v_enabled, v_scope, v_ids
  FROM public.establishment_fnrh_settings s
  WHERE s.establishment_id = p_establishment_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN false;
  END IF;

  IF v_scope IS NULL OR v_scope = 'all' THEN
    RETURN true;
  END IF;

  IF v_scope = 'selected' THEN
    IF v_ids IS NULL OR COALESCE(array_length(v_ids, 1), 0) = 0 THEN
      RETURN false;
    END IF;
    IF p_category_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN p_category_id = ANY(v_ids);
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.get_fnrh_guest_form_visibility(UUID, UUID) IS
  'Se o bloco FNRH deve aparecer no check-in web (anon): enabled e categoria no escopo.';

GRANT EXECUTE ON FUNCTION public.get_fnrh_guest_form_visibility(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_fnrh_guest_form_visibility(UUID, UUID) TO authenticated;
