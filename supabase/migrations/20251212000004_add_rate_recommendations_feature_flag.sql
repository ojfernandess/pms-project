-- Adicionar feature flag para Recomendações de Preços
-- Permite que as recomendações de preços sejam habilitadas apenas para estabelecimentos específicos

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
      "email": {
        "enabled": false,
        "establishment_ids": []
      },
      "web_checkin": true,
      "channel_manager": true,
      "rate_recommendations": {
        "enabled": false,
        "establishment_ids": []
      }
    }'::jsonb;
  ELSE
    -- Adicionar rate_recommendations se não existir
    IF v_current_features->>'rate_recommendations' IS NULL THEN
      v_current_features := v_current_features || jsonb_build_object(
        'rate_recommendations',
        jsonb_build_object(
          'enabled',
          false,
          'establishment_ids',
          '[]'::jsonb
        )
      );
    -- Se rate_recommendations existe como boolean, converter para objeto
    ELSIF (v_current_features->'rate_recommendations')::text = 'true' OR (v_current_features->'rate_recommendations')::text = 'false' THEN
      v_current_features := v_current_features || jsonb_build_object(
        'rate_recommendations',
        jsonb_build_object(
          'enabled',
          CASE 
            WHEN (v_current_features->'rate_recommendations')::text = 'true' THEN true
            ELSE false
          END,
          'establishment_ids',
          '[]'::jsonb
        )
      );
    END IF;
  END IF;

  -- Atualizar site_settings
  UPDATE public.site_settings
  SET features_enabled = v_current_features
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;

COMMENT ON COLUMN public.site_settings.features_enabled IS 
  'Controle de funcionalidades habilitadas no sistema. Funcionalidades podem ser boolean (globais) ou objetos com enabled e establishment_ids/company_ids para controle por estabelecimento/empresa. Inclui: rate_recommendations (Recomendações de Preços).';

