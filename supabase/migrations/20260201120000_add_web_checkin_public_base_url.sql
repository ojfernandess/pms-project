-- URL pública do Web Check-in (domínio e caminho opcionais), sem o localizador no final.
-- Ex.: https://checkin.seudominio.com/Localizador  → link: .../Localizador/RSV123456
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS web_checkin_public_base_url TEXT;

COMMENT ON COLUMN public.site_settings.web_checkin_public_base_url IS
  'Base pública para links de Web Check-in (domínio/caminho). Se vazio, usa pms_base_url + /web-checkin.';