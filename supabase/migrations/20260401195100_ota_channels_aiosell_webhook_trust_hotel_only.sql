-- Webhook Aiosell: quando o CM não envia credenciais (ex.: Stay OS), permitir só hotelCode no body.
ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS aiosell_webhook_trust_hotel_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ota_channels.aiosell_webhook_trust_hotel_only IS
  'Se true, aceita POST do webhook só com hotelCode (sem Basic/secret/query). Menos seguro — usar só se necessário.';
