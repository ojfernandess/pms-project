-- Adicionar feature flag para Centralização de Clientes (client_deduplication)
-- Permite controlar se a funcionalidade está habilitada por estabelecimento

DO $$
DECLARE
  v_current_features JSONB;
BEGIN
  -- Buscar features_enabled atual
  SELECT features_enabled INTO v_current_features
  FROM public.site_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1;

  -- Se não existir, criar estrutura padrão
  IF v_current_features IS NULL THEN
    v_current_features := '{
      "api_integrations": true,
      "stripe": true,
      "email": true,
      "web_checkin": true,
      "channel_manager": true,
      "client_deduplication": {
        "enabled": false,
        "establishment_ids": []
      }
    }'::jsonb;
  ELSE
    -- Adicionar client_deduplication se não existir
    IF NOT (v_current_features ? 'client_deduplication') THEN
      v_current_features := v_current_features || '{
        "client_deduplication": {
          "enabled": false,
          "establishment_ids": []
        }
      }'::jsonb;
    END IF;
  END IF;

  -- Atualizar site_settings
  UPDATE public.site_settings
  SET features_enabled = v_current_features
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;

-- Comentário explicativo
COMMENT ON COLUMN public.site_settings.features_enabled IS 
  'Controle de funcionalidades habilitadas no sistema. Cada chave representa uma funcionalidade e o valor (true/false) indica se está ativa. Inclui: api_integrations, stripe, email, web_checkin, channel_manager, stay_reviews, dynamic_pricing_automation, client_deduplication.';

