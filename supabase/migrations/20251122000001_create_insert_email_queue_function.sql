-- Função para inserir na fila de emails bypassando RLS
-- Usada por Edge Functions que usam Service Role Key

CREATE OR REPLACE FUNCTION public.insert_email_queue(
  p_template_id UUID,
  p_event_type TEXT,
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_subject TEXT,
  p_body_html TEXT,
  p_reservation_id UUID DEFAULT NULL,
  p_variables JSONB DEFAULT NULL,
  p_priority INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypassa RLS
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  INSERT INTO public.email_queue (
    template_id,
    event_type,
    recipient_email,
    recipient_name,
    subject,
    body_html,
    reservation_id,
    variables,
    priority,
    status,
    scheduled_at
  ) VALUES (
    p_template_id,
    p_event_type::email_event_type, -- Cast TEXT para email_event_type
    p_recipient_email,
    p_recipient_name,
    p_subject,
    p_body_html,
    p_reservation_id,
    p_variables,
    p_priority,
    'pending',
    NOW()
  )
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

-- Comentário
COMMENT ON FUNCTION public.insert_email_queue IS 'Insere email na fila bypassando RLS. Usado por Edge Functions.';

