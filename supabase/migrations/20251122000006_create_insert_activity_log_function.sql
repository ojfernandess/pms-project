-- Função para inserir log de atividade bypassando RLS
-- Usada por Edge Functions que usam Service Role Key

-- Verificar se a função já existe e removê-la
DROP FUNCTION IF EXISTS public.insert_activity_log(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.insert_activity_log(
  p_establishment_id UUID,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_description TEXT,
  p_user_id UUID DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_entity_code TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypassa RLS
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    establishment_id,
    user_id,
    action_type,
    entity_type,
    description,
    entity_id,
    entity_code,
    old_values,
    new_values,
    metadata,
    created_at
  ) VALUES (
    p_establishment_id,
    p_user_id,
    p_action_type, -- TEXT, não precisa de cast
    p_entity_type, -- TEXT, não precisa de cast
    p_description,
    p_entity_id,
    p_entity_code,
    p_old_values,
    p_new_values,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não falhar
    RAISE WARNING 'Erro ao inserir log de atividade: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Comentário
COMMENT ON FUNCTION public.insert_activity_log IS 'Insere log de atividade bypassando RLS. Usado por Edge Functions.';

