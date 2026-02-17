-- Configurações avançadas do motor de reservas: scripts, pixels, CSS customizado e webhooks

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_custom_scripts_head TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_custom_scripts_body TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_meta_pixel_id TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_google_analytics_id TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_custom_css TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_webhook_url TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_webhook_secret TEXT;

COMMENT ON COLUMN public.companies.booking_engine_custom_scripts_head IS 'HTML/JS injetado no <head> da página do motor de reservas.';
COMMENT ON COLUMN public.companies.booking_engine_custom_scripts_body IS 'HTML/JS injetado antes do </body> da página do motor de reservas.';
COMMENT ON COLUMN public.companies.booking_engine_meta_pixel_id IS 'ID do Meta (Facebook) Pixel para rastreamento.';
COMMENT ON COLUMN public.companies.booking_engine_google_analytics_id IS 'ID do Google Analytics (GA4, ex: G-XXXXXXXXXX) para rastreamento.';
COMMENT ON COLUMN public.companies.booking_engine_custom_css IS 'CSS customizado aplicado às páginas do motor de reservas.';
COMMENT ON COLUMN public.companies.booking_engine_webhook_url IS 'URL para envio de eventos (ex.: reserva criada/paga).';
COMMENT ON COLUMN public.companies.booking_engine_webhook_secret IS 'Secret opcional para assinar requisições ao webhook.';
