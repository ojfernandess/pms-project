-- Adiciona campos de redes sociais para o motor de reservas

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_social_facebook TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_social_twitter TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_social_youtube TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_social_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_social_website TEXT;

COMMENT ON COLUMN public.companies.booking_engine_social_instagram IS
  'URL do Instagram exibido no rodapé do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_social_facebook IS
  'URL do Facebook exibido no rodapé do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_social_twitter IS
  'URL do Twitter/X exibido no rodapé do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_social_youtube IS
  'URL do YouTube exibido no rodapé do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_social_website IS
  'URL do site oficial exibido no rodapé do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_social_whatsapp IS
  'Link de WhatsApp exibido no rodapé do motor de reservas (ex: https://wa.me/...)';


