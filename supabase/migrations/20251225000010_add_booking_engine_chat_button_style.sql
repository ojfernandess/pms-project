-- Adiciona campo para estilo do botão do Chatwoot (nativo ou customizado)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_chat_button_style TEXT DEFAULT 'custom';

COMMENT ON COLUMN public.companies.booking_engine_chat_button_style IS
  'Estilo do botão do Chatwoot: "native" para botão nativo ou "custom" para botão customizado com efeito pulsante';

