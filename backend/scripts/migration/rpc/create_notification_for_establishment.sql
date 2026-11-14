-- Origem: supabase/migrations/20251120000030_create_notifications.sql
-- Requer: notifications, notification_type, notification_priority

CREATE OR REPLACE FUNCTION public.create_notification_for_establishment(
  p_establishment_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_priority notification_priority DEFAULT 'medium',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_user_ids UUID[] := ARRAY[]::UUID[];
  v_user_id UUID;
BEGIN
  FOR v_user IN
    SELECT DISTINCT uc.user_id AS id
    FROM public.user_companies uc
    INNER JOIN public.establishments e ON e.company_id = uc.company_id
    WHERE e.id = p_establishment_id
      AND uc.is_active = true
      AND uc.user_id IS NOT NULL
  LOOP
    IF v_user.id IS NOT NULL THEN
      v_user_ids := array_append(v_user_ids, v_user.id);
    END IF;
  END LOOP;

  FOR v_user IN
    SELECT DISTINCT e.user_id
    FROM public.employees e
    WHERE e.establishment_id = p_establishment_id
      AND e.is_active = true
      AND e.user_id IS NOT NULL
  LOOP
    IF NOT (v_user.user_id = ANY(v_user_ids)) THEN
      v_user_ids := array_append(v_user_ids, v_user.user_id);
    END IF;
  END LOOP;

  FOREACH v_user_id IN ARRAY v_user_ids
  LOOP
    INSERT INTO public.notifications (
      establishment_id,
      user_id,
      type,
      priority,
      title,
      message,
      metadata
    ) VALUES (
      p_establishment_id,
      v_user_id,
      p_type,
      p_priority,
      p_title,
      p_message,
      p_metadata
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.create_notification_for_establishment IS
  'Cria notificação para usuários do estabelecimento (empresa + funcionários).';

GRANT EXECUTE ON FUNCTION public.create_notification_for_establishment(
  UUID, notification_type, TEXT, TEXT, notification_priority, JSONB
) TO authenticated, service_role;