-- Migration: Adicionar campo timezone em hotel_settings
-- Permite configurar o fuso horário do estabelecimento para cálculos corretos de datas/horas

-- Verificar se a coluna já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'hotel_settings' 
    AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.hotel_settings 
    ADD COLUMN timezone TEXT DEFAULT 'America/Sao_Paulo';
    
    COMMENT ON COLUMN public.hotel_settings.timezone IS 'Fuso horário do estabelecimento (ex: America/Sao_Paulo, America/New_York). Usado para cálculos de datas/horas locais. Padrão: America/Sao_Paulo (UTC-3)';
  END IF;
END $$;

-- Atualizar registros existentes para usar o padrão se estiverem NULL
UPDATE public.hotel_settings
SET timezone = 'America/Sao_Paulo'
WHERE timezone IS NULL;

