-- Adicionar feature flag para sistema de avaliações (stay_reviews)
-- Permite ativar/desativar o sistema de avaliações globalmente

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
      "stay_reviews": false
    }'::jsonb;
  ELSE
    -- Adicionar stay_reviews se não existir
    IF NOT (v_current_features ? 'stay_reviews') THEN
      v_current_features := v_current_features || '{"stay_reviews": false}'::jsonb;
    END IF;
  END IF;

  -- Atualizar site_settings
  UPDATE public.site_settings
  SET features_enabled = v_current_features
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;

-- Comentário
COMMENT ON COLUMN public.site_settings.features_enabled IS 
  'Controle de funcionalidades habilitadas no sistema. Cada chave representa uma funcionalidade e o valor (true/false) indica se está ativa. Inclui: api_integrations, stripe, email, web_checkin, channel_manager, stay_reviews.';

