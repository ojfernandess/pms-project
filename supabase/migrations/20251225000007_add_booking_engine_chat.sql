-- Adicionar campos de configuração do Chatwoot para o motor de reservas
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS booking_engine_chat_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_engine_chat_base_url TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_chat_website_token TEXT;

-- Comentários
COMMENT ON COLUMN public.companies.booking_engine_chat_enabled IS 'Habilita o chat Chatwoot no motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_chat_base_url IS 'URL base do Chatwoot (ex: https://app.agentslabs.cloud)';
COMMENT ON COLUMN public.companies.booking_engine_chat_website_token IS 'Token do website do Chatwoot para integração';

