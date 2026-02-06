-- Corrigir establishment_ids do template reservation.multiple.created para NULL
-- Isso garante que o template esteja disponível para todos os estabelecimentos

UPDATE public.email_templates
SET establishment_ids = NULL::jsonb
WHERE event_type = 'reservation.multiple.created'::email_event_type
  AND (establishment_ids = '[]'::jsonb OR establishment_ids IS NULL OR establishment_ids = 'null'::jsonb);

-- Comentário
COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template reservation.multiple.created é usado para enviar email quando múltiplas reservas são criadas em uma única transação (ex: reservas públicas com múltiplas categorias). O establishment_ids deve ser NULL para estar disponível para todos os estabelecimentos.';

