-- Migration: Adicionar campo map_reservation_hover_preview em hotel_settings
-- Permite ativar/desativar o thumbnail de preview ao passar o mouse sobre reservas no Mapa de Reservas

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'hotel_settings'
        AND column_name = 'map_reservation_hover_preview'
    ) THEN
        ALTER TABLE public.hotel_settings
        ADD COLUMN map_reservation_hover_preview BOOLEAN DEFAULT true;
    END IF;
END $$;

COMMENT ON COLUMN public.hotel_settings.map_reservation_hover_preview IS
  'Controla se o thumbnail com informações da reserva deve aparecer ao passar o mouse no Mapa de Reservas. Padrão: true (ativado).';
