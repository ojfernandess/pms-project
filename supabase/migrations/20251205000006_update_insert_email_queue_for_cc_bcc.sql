-- Atualizar função insert_email_queue para incluir CC e BCC
-- Mantém compatibilidade com chamadas antigas (p_event_type como TEXT)
-- IMPORTANTE: Parâmetros obrigatórios primeiro (sem DEFAULT), depois os opcionais (com DEFAULT)

-- Remover todas as versões existentes da função para evitar conflito
-- Usar CASCADE para remover dependências também
DROP FUNCTION IF EXISTS public.insert_email_queue CASCADE;

-- Criar a nova versão com suporte a CC e BCC
CREATE OR REPLACE FUNCTION public.insert_email_queue(
  p_template_id UUID,
  p_event_type TEXT,
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_subject TEXT,
  p_body_html TEXT,
  p_reservation_id UUID DEFAULT NULL,
  p_variables JSONB DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_cc_emails TEXT DEFAULT NULL,
  p_bcc_emails TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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
    cc_emails,
    bcc_emails,
    status,
    scheduled_at
  )
  VALUES (
    NULLIF(p_template_id, '00000000-0000-0000-0000-000000000000'::uuid), -- Converter UUID zero para NULL
    p_event_type::email_event_type, -- Cast TEXT para email_event_type
    p_recipient_email,
    NULLIF(p_recipient_name, ''), -- Converter string vazia para NULL
    p_subject,
    p_body_html,
    p_reservation_id,
    p_variables,
    p_priority,
    p_cc_emails,
    p_bcc_emails,
    'pending',
    NOW()
  )
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

COMMENT ON FUNCTION public.insert_email_queue IS 'Insere email na fila bypassando RLS. Usado por Edge Functions. Suporta CC e BCC.';

-- Garantir que a função possa ser executada por qualquer usuário
GRANT EXECUTE ON FUNCTION public.insert_email_queue TO anon, authenticated, public;

