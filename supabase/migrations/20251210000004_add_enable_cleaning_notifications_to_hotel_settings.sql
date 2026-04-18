-- Migration: Adicionar campo enable_cleaning_notifications em hotel_settings
-- Permite ativar/desativar notificações de limpeza por estabelecimento

-- Adicionar coluna enable_cleaning_notifications se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'hotel_settings' 
        AND column_name = 'enable_cleaning_notifications'
    ) THEN
        ALTER TABLE public.hotel_settings 
        ADD COLUMN enable_cleaning_notifications BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Comentário
COMMENT ON COLUMN public.hotel_settings.enable_cleaning_notifications IS 
  'Controla se as notificações de limpeza (cleaning_required) devem ser geradas automaticamente quando um check-out passa do horário. Padrão: true (ativado).';

