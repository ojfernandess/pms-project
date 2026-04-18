-- Migration: Criar tabela para configuração de horário de processamento de no-shows
-- Permite que cada estabelecimento configure seu horário de processamento automático

CREATE TABLE IF NOT EXISTS public.no_show_schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  schedule_time TIME NOT NULL DEFAULT '19:00:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_establishment_schedule UNIQUE (establishment_id)
);

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_no_show_schedule_config_establishment 
  ON public.no_show_schedule_config(establishment_id);

CREATE INDEX IF NOT EXISTS idx_no_show_schedule_config_active 
  ON public.no_show_schedule_config(is_active) WHERE is_active = true;

-- Comentários
COMMENT ON TABLE public.no_show_schedule_config IS 'Configuração de horário de processamento automático de no-shows por estabelecimento';
COMMENT ON COLUMN public.no_show_schedule_config.schedule_time IS 'Horário diário para processar no-shows (formato HH:mm:ss)';
COMMENT ON COLUMN public.no_show_schedule_config.is_active IS 'Se o processamento automático está ativo para este estabelecimento';

