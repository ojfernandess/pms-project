-- Channel Manager: múltiplas credenciais por estabelecimento/prédio (Bukly HotelCode)
-- Permite mais de um canal Bukly (ou CM) no mesmo establishment, tipicamente um por building.

ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ota_channels_building_id ON public.ota_channels(building_id);

-- Nome global único impede 2º "Bukly" no mesmo hotel → escopo por establishment
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ota_channels'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%(name)%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%establishment_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.ota_channels DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.ota_channels_name_key;
DROP INDEX IF EXISTS public.ota_channels_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS ota_channels_establishment_name_uidx
  ON public.ota_channels (establishment_id, name)
  WHERE establishment_id IS NOT NULL;

-- Evita dois Bukly ativos com o mesmo HotelCode no mesmo establishment
CREATE UNIQUE INDEX IF NOT EXISTS ota_channels_bukly_hotel_per_est_uidx
  ON public.ota_channels (establishment_id, bukly_hotel_id)
  WHERE channel_manager_type = 'bukly'
    AND bukly_hotel_id IS NOT NULL
    AND COALESCE(is_active, true) = true
    AND establishment_id IS NOT NULL;

-- Um canal Bukly ativo por prédio (quando building_id informado)
CREATE UNIQUE INDEX IF NOT EXISTS ota_channels_bukly_building_uidx
  ON public.ota_channels (establishment_id, building_id)
  WHERE channel_manager_type = 'bukly'
    AND building_id IS NOT NULL
    AND COALESCE(is_active, true) = true
    AND establishment_id IS NOT NULL;

COMMENT ON COLUMN public.ota_channels.building_id IS
  'Opcional: prédio deste canal. Em Bukly, cada prédio pode ter HotelCode + Basic Auth próprios (OTA HotelRef@HotelCode). NULL = todos os prédios (comportamento legado).';
