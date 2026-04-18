-- Adicionar campo de feature flags (funcionalidades) na tabela site_settings
-- Permite controlar quais funcionalidades estão habilitadas no sistema

ALTER TABLE public.site_settings 
  ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '{
    "api_integrations": true,
    "stripe": true,
    "email": true,
    "web_checkin": true,
    "channel_manager": true
  }'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.site_settings.features_enabled IS 
  'Controle de funcionalidades habilitadas no sistema. Cada chave representa uma funcionalidade e o valor (true/false) indica se está ativa.';

-- Atualizar registro existente se necessário
UPDATE public.site_settings
SET features_enabled = COALESCE(
  features_enabled,
  '{
    "api_integrations": true,
    "stripe": true,
    "email": true,
    "web_checkin": true,
    "channel_manager": true
  }'::jsonb
)
WHERE id = '00000000-0000-0000-0000-000000000001';

