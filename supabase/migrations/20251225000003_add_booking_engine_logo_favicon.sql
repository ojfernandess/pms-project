-- Adicionar campos para logo e favicon do motor de reservas

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_logo TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_favicon TEXT;

COMMENT ON COLUMN public.companies.booking_engine_logo IS
  'URL do logo exibido no motor de reservas (configuração por empresa)';
COMMENT ON COLUMN public.companies.booking_engine_favicon IS
  'URL do favicon exibido no motor de reservas (configuração por empresa)';

