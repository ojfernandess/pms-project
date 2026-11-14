-- Origem: supabase/migrations/20251120000008_create_activity_logs.sql
-- Requer tabela public.activity_logs

CREATE OR REPLACE FUNCTION public.log_activity(
  p_establishment_id UUID,
  p_user_id UUID,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_description TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_entity_code TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    establishment_id,
    user_id,
    action_type,
    entity_type,
    entity_id,
    entity_code,
    description,
    old_values,
    new_values,
    metadata
  ) VALUES (
    p_establishment_id,
    p_user_id,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_entity_code,
    p_description,
    p_old_values,
    p_new_values,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.log_activity IS 'Registra entrada em activity_logs (bundled cutover).';

GRANT EXECUTE ON FUNCTION public.log_activity(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, JSONB
) TO authenticated, service_role;