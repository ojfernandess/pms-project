-- Adiciona campo LinkedIn para o motor de reservas

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_social_linkedin TEXT;

COMMENT ON COLUMN public.companies.booking_engine_social_linkedin IS
  'URL do LinkedIn exibido no rodapé do motor de reservas';

