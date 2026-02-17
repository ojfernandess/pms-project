-- ============================================
-- SEO por domínio / por empresa (motor de reservas)
-- Cada domínio personalizado ou página do motor tem seu próprio SEO
-- ============================================

-- Domínio customizado (ex: hotel-a.com) – identifica a empresa quando a requisição vem desse host
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS seo_custom_domain TEXT;

-- URL base para SEO quando usa domínio customizado (ex: https://hotel-a.com)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS seo_base_url TEXT;

-- robots.txt específico da empresa (opcional; se null, usa padrão ou site_settings)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS robots_txt TEXT;

-- Índice para resolução rápida por domínio (host normalizado sem porta)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_seo_custom_domain
  ON public.companies(LOWER(TRIM(seo_custom_domain))) WHERE seo_custom_domain IS NOT NULL AND TRIM(seo_custom_domain) <> '';

COMMENT ON COLUMN public.companies.seo_custom_domain IS 'Domínio que identifica esta empresa para SEO (ex: hotel-a.com). Requisições com Host igual a este domínio usam sitemap/robots desta empresa.';
COMMENT ON COLUMN public.companies.seo_base_url IS 'URL base para links no sitemap quando a empresa usa domínio customizado (ex: https://hotel-a.com).';
COMMENT ON COLUMN public.companies.robots_txt IS 'Conteúdo do robots.txt desta empresa. Se null, usa padrão ou site_settings.robots_txt.';
