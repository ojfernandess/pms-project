-- Adicionar campo para fotos do estabelecimento na página pública
-- Permite adicionar múltiplas fotos do hotel/estabelecimento para exibir na página pública de reservas

ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS establishment_photos TEXT[] DEFAULT '{}';

-- Comentário
COMMENT ON COLUMN public.hotel_settings.establishment_photos IS 
'Array de URLs de fotos do estabelecimento para exibição na página pública de reservas.';

