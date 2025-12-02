-- Adicionar campos de logo e foto na tabela buildings
ALTER TABLE public.buildings
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.buildings.logo_url IS 'URL da logo do prédio/estabelecimento armazenada no bucket hotel-assets';
COMMENT ON COLUMN public.buildings.photo_url IS 'URL da foto do prédio/estabelecimento armazenada no bucket hotel-assets';

