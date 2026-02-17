-- ============================================
-- SEO: Slugs em entidades + robots.txt em site_settings
-- ============================================
-- 1) Slug em establishments (URL amigável para /reservar/:slug)
-- 2) Slug em room_categories (URL amigável por estabelecimento)
-- 3) robots_txt em site_settings (editor no admin)
-- companies.booking_engine_slug já existe (motor de reservas)

-- Estabelecimentos: slug único global (uma URL /reservar/:slug por estabelecimento)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_slug_unique
  ON public.establishments(slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishments_slug ON public.establishments(slug);

COMMENT ON COLUMN public.establishments.slug IS
  'Slug único para URL amigável na página de reserva pública (/reservar/:slug). Gerado a partir do nome, editável, sem acentos e caracteres especiais.';

-- Categorias de quarto: slug único por estabelecimento (evita conflito entre hotéis)
ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_categories_establishment_slug
  ON public.room_categories(establishment_id, slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_categories_slug ON public.room_categories(establishment_id, slug);

COMMENT ON COLUMN public.room_categories.slug IS
  'Slug para URL amigável da categoria no motor de reservas. Único por establishment_id.';

-- site_settings: armazenar robots.txt editável
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS robots_txt TEXT;

COMMENT ON COLUMN public.site_settings.robots_txt IS
  'Conteúdo do arquivo robots.txt (editável no painel admin SEO). Se vazio, não é servido.';
