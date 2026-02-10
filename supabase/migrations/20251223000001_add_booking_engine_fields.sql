-- Adiciona campos para configuração do Motor de Reservas por estabelecimento

ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS booking_engine_theme TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS booking_engine_theme_config JSONB,
  ADD COLUMN IF NOT EXISTS booking_engine_custom_domain TEXT UNIQUE;

COMMENT ON COLUMN public.hotel_settings.booking_engine_theme IS
  'Tema visual do motor de reservas (default, modern, luxury, minimal, dark, etc.)';

COMMENT ON COLUMN public.hotel_settings.booking_engine_theme_config IS
  'Configurações de customização visual do motor de reservas em formato JSON (cores, fontes, etc.)';

COMMENT ON COLUMN public.hotel_settings.booking_engine_custom_domain IS
  'Domínio personalizado para o motor de reservas (ex.: reservas.hotelx.com.br)';


