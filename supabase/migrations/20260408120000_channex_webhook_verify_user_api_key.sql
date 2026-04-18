-- Validação opcional do webhook Channex: cabeçalho user-api-key deve coincidir com channex_api_key do canal.
ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS channex_webhook_verify_user_api_key BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ota_channels.channex_webhook_verify_user_api_key IS
  'Quando true, a edge function channex-reservation-webhook exige o header user-api-key igual à channex_api_key (alinhado à API Channex / webhook protected).';
