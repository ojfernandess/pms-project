-- Adicionar suporte a funcionalidades por empresa em features_enabled
-- Permite que funcionalidades sejam habilitadas para empresas específicas

-- Atualizar estrutura de features_enabled para suportar:
-- - Boolean (true/false) para funcionalidades globais
-- - Objeto { enabled: boolean, company_ids: string[] } para funcionalidades por empresa

-- Adicionar nova funcionalidade: dynamic_pricing_automation
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
      "dynamic_pricing_automation": {
        "enabled": false,
        "company_ids": []
      }
    }'::jsonb;
  ELSE
    -- Adicionar dynamic_pricing_automation se não existir
    IF NOT (v_current_features ? 'dynamic_pricing_automation') THEN
      v_current_features := v_current_features || '{
        "dynamic_pricing_automation": {
          "enabled": false,
          "company_ids": []
        }
      }'::jsonb;
    END IF;
  END IF;

  -- Atualizar site_settings
  UPDATE public.site_settings
  SET features_enabled = v_current_features
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;

-- Função helper para verificar se uma empresa tem acesso a uma funcionalidade
CREATE OR REPLACE FUNCTION public.company_has_feature_access(
  p_feature_key TEXT,
  p_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_feature_config JSONB;
  v_features_enabled JSONB;
BEGIN
  -- Buscar features_enabled
  SELECT features_enabled INTO v_features_enabled
  FROM public.site_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_features_enabled IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar se a funcionalidade existe
  IF NOT (v_features_enabled ? p_feature_key) THEN
    RETURN false;
  END IF;

  v_feature_config := v_features_enabled->p_feature_key;

  -- Se for boolean, retornar o valor diretamente (funcionalidade global)
  IF jsonb_typeof(v_feature_config) = 'boolean' THEN
    RETURN v_feature_config::boolean;
  END IF;

  -- Se for objeto, verificar enabled e company_ids
  IF jsonb_typeof(v_feature_config) = 'object' THEN
    -- Verificar se está habilitado
    IF (v_feature_config->>'enabled')::boolean = false THEN
      RETURN false;
    END IF;

    -- Verificar se a empresa está na lista
    IF v_feature_config ? 'company_ids' THEN
      RETURN p_company_id::text = ANY(
        SELECT jsonb_array_elements_text(v_feature_config->'company_ids')
      );
    END IF;

    -- Se não há company_ids, significa que está habilitado para todas as empresas
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comentário
COMMENT ON FUNCTION public.company_has_feature_access IS 
  'Verifica se uma empresa tem acesso a uma funcionalidade específica. Retorna true se a funcionalidade está habilitada globalmente (boolean) ou se a empresa está na lista de empresas permitidas.';

