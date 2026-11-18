-- Informações configuráveis para a página de check-in concluído (Wi-Fi, chegada, estacionamento, personalizado)
ALTER TABLE public.establishment_services
  ADD COLUMN IF NOT EXISTS checkin_guest_info_type TEXT,
  ADD COLUMN IF NOT EXISTS checkin_guest_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checkin_display_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'establishment_services_checkin_guest_info_type_check'
  ) THEN
    ALTER TABLE public.establishment_services
      ADD CONSTRAINT establishment_services_checkin_guest_info_type_check
      CHECK (
        checkin_guest_info_type IS NULL
        OR checkin_guest_info_type IN ('wifi', 'arrival', 'parking', 'custom')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_establishment_services_checkin_guest_info
  ON public.establishment_services (establishment_id, checkin_display_order)
  WHERE checkin_guest_info_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishment_services_building_checkin_guest_info
  ON public.establishment_services (building_id, checkin_display_order)
  WHERE checkin_guest_info_type IS NOT NULL AND building_id IS NOT NULL;

COMMENT ON COLUMN public.establishment_services.checkin_guest_info_type IS
  'Quando preenchido, exibe na página de check-in concluído: wifi | arrival | parking | custom';
COMMENT ON COLUMN public.establishment_services.checkin_guest_config IS
  'Campos estruturados por tipo (rede/senha, título/texto, etc.). Suporta variáveis {{guest_name}}, {{room_password}}, …';
COMMENT ON COLUMN public.establishment_services.checkin_display_order IS
  'Ordem de exibição na página de check-in concluído (menor primeiro)';