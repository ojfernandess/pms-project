-- Adicionar suporte a seleção de estabelecimentos para o sistema de e-mail
-- Permite que o sistema de e-mail seja habilitado apenas para estabelecimentos específicos

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
      "channel_manager": true
    }'::jsonb;
  ELSE
    -- Converter email de boolean para objeto se necessário
    IF v_current_features->>'email' IS NULL OR (v_current_features->'email')::text = 'true' OR (v_current_features->'email')::text = 'false' THEN
      -- Se email é boolean ou não existe, converter para objeto
      v_current_features := v_current_features || jsonb_build_object(
        'email',
        jsonb_build_object(
          'enabled',
          CASE 
            WHEN v_current_features->>'email' IS NULL THEN true
            WHEN (v_current_features->'email')::text = 'true' THEN true
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

-- Comentário explicativo
COMMENT ON COLUMN public.site_settings.features_enabled IS 
  'Controle de funcionalidades habilitadas no sistema. Funcionalidades podem ser boolean (globais) ou objetos com enabled e establishment_ids/company_ids para controle por estabelecimento/empresa.';

