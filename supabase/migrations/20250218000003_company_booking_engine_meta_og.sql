-- Meta Description, Open Graph e Imagem OG por página do motor de reservas (por empresa)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_meta_description TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_og_title TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_og_description TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_og_image TEXT;

COMMENT ON COLUMN public.companies.booking_engine_meta_description IS 'Meta description da página do motor de reservas desta empresa (SEO).';
COMMENT ON COLUMN public.companies.booking_engine_og_title IS 'Título Open Graph para redes sociais (og:title).';
COMMENT ON COLUMN public.companies.booking_engine_og_description IS 'Descrição Open Graph para redes sociais (og:description).';
COMMENT ON COLUMN public.companies.booking_engine_og_image IS 'URL da imagem Open Graph para redes sociais (og:image).';
