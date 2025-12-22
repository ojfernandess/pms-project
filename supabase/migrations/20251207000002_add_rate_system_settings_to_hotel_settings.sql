-- =====================================================
-- ADICIONAR COLUNA rate_system_settings À hotel_settings
-- =====================================================

-- Adicionar coluna rate_system_settings (JSONB) para armazenar configurações do sistema tarifário
ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS rate_system_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hotel_settings.rate_system_settings IS 'Configurações do sistema tarifário (auto_apply_dynamic_rules, auto_sync_channels, etc.) em formato JSON';

