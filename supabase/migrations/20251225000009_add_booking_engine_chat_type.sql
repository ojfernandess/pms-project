-- Adiciona campo para tipo de chat (Chatwoot ou WhatsApp)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_chat_type TEXT DEFAULT 'chatwoot';

COMMENT ON COLUMN public.companies.booking_engine_chat_type IS
  'Tipo de chat para o motor de reservas: "chatwoot" ou "whatsapp"';

-- Atualizar registros existentes para manter compatibilidade
UPDATE public.companies
SET booking_engine_chat_type = 'chatwoot'
WHERE booking_engine_chat_type IS NULL;

