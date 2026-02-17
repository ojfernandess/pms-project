-- Coluna de configuração de tema (cores, fontes) do motor por empresa.
-- A UI em BookingEngineSettings salva em company; hotel_settings tem a mesma coluna por estabelecimento.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_theme_config JSONB;

COMMENT ON COLUMN public.companies.booking_engine_theme_config IS
  'Configurações de customização visual do motor de reservas em formato JSON (primaryColor, fontFamily, etc.).';
