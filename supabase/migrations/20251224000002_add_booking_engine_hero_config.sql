-- Adiciona campos para configurar imagem e título do hero do motor de reservas

ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS booking_engine_title TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_image TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_title TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_subtitle TEXT;

COMMENT ON COLUMN public.hotel_settings.booking_engine_title IS
  'Título exibido no header do motor de reservas';
COMMENT ON COLUMN public.hotel_settings.booking_engine_hero_image IS
  'URL da imagem de background do hero section do motor de reservas';
COMMENT ON COLUMN public.hotel_settings.booking_engine_hero_title IS
  'Título principal do hero section do motor de reservas';
COMMENT ON COLUMN public.hotel_settings.booking_engine_hero_subtitle IS
  'Subtítulo do hero section do motor de reservas';

-- Adicionar também na tabela companies para configuração por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_title TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_image TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_title TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_hero_subtitle TEXT;

COMMENT ON COLUMN public.companies.booking_engine_title IS
  'Título exibido no header do motor de reservas (configuração por empresa)';
COMMENT ON COLUMN public.companies.booking_engine_hero_image IS
  'URL da imagem de background do hero section do motor de reservas (configuração por empresa)';
COMMENT ON COLUMN public.companies.booking_engine_hero_title IS
  'Título principal do hero section do motor de reservas (configuração por empresa)';
COMMENT ON COLUMN public.companies.booking_engine_hero_subtitle IS
  'Subtítulo do hero section do motor de reservas (configuração por empresa)';

