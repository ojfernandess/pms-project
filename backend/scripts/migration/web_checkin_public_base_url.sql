-- URL pública do Web Check-in (domínio, sem localizador). Ex.: https://checkin.seudominio.com → .../RSV154684
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS web_checkin_public_base_url TEXT;

COMMENT ON COLUMN public.site_settings.web_checkin_public_base_url IS
  'Base pública para links de Web Check-in (domínio). Se vazio, usa pms_base_url + /web-checkin.';