-- =====================================================
-- SCRIPT DE TESTE PARA VERIFICAR CONFIGURAÇÃO E REGRAS
-- =====================================================
-- Execute este script no SQL Editor do Supabase para verificar:
-- 1. Se a configuração auto_apply_dynamic_rules está habilitada
-- 2. Se existem regras dinâmicas ativas
-- 3. Se as regras estão sendo encontradas para uma categoria/plano/data específica

-- IMPORTANTE: Substitua os valores abaixo pelos seus IDs reais
DO $$
DECLARE
  v_establishment_id UUID := 'b4a0a862-55ea-40ed-a149-a64ebca326be'; -- Substitua pelo seu establishment_id
  v_category_id UUID := '769842af-e7c4-4a18-9888-6dd1aa728647'; -- Substitua pela sua category_id
  v_plan_id UUID := '4527ed6e-5ae1-46c7-b0fa-fb39b62349e2'; -- Substitua pelo seu plan_id
  v_test_date DATE := '2025-12-29'; -- Data de teste
  v_settings_json JSONB;
  v_auto_apply_rules BOOLEAN := false;
  v_rules_count INTEGER := 0;
BEGIN
  -- 1. Verificar configuração
  RAISE NOTICE '=== VERIFICANDO CONFIGURAÇÃO ===';
  
  SELECT rate_system_settings INTO v_settings_json
  FROM public.hotel_settings
  WHERE establishment_id = v_establishment_id
  LIMIT 1;

  IF v_settings_json IS NULL THEN
    RAISE NOTICE 'ERRO: Nenhuma configuração encontrada para o establishment_id %', v_establishment_id;
  ELSIF v_settings_json = '{}'::jsonb THEN
    RAISE NOTICE 'ERRO: rate_system_settings está vazio (JSON vazio)';
  ELSE
    RAISE NOTICE 'Configuração encontrada: %', v_settings_json;
    
    IF v_settings_json ? 'auto_apply_dynamic_rules' THEN
      RAISE NOTICE 'Chave auto_apply_dynamic_rules existe';
      RAISE NOTICE 'Valor: %', v_settings_json->>'auto_apply_dynamic_rules';
      RAISE NOTICE 'Tipo JSON: %', jsonb_typeof(v_settings_json->'auto_apply_dynamic_rules');
      
      -- Tentar diferentes formas de verificar
      IF jsonb_typeof(v_settings_json->'auto_apply_dynamic_rules') = 'boolean' THEN
        v_auto_apply_rules := (v_settings_json->>'auto_apply_dynamic_rules')::boolean;
        RAISE NOTICE 'Interpretado como boolean: %', v_auto_apply_rules;
      ELSIF jsonb_typeof(v_settings_json->'auto_apply_dynamic_rules') = 'string' THEN
        IF v_settings_json->>'auto_apply_dynamic_rules' = 'true' OR
           v_settings_json->>'auto_apply_dynamic_rules' = '1' OR
           v_settings_json->>'auto_apply_dynamic_rules' = 'True' THEN
          v_auto_apply_rules := true;
          RAISE NOTICE 'Interpretado como string "true": %', v_auto_apply_rules;
        ELSE
          v_auto_apply_rules := false;
          RAISE NOTICE 'Interpretado como string "false": %', v_auto_apply_rules;
        END IF;
      ELSE
        BEGIN
          v_auto_apply_rules := (v_settings_json->>'auto_apply_dynamic_rules')::boolean;
          RAISE NOTICE 'Convertido para boolean: %', v_auto_apply_rules;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE NOTICE 'ERRO ao converter para boolean: %', SQLERRM;
            v_auto_apply_rules := false;
        END;
      END IF;
    ELSE
      RAISE NOTICE 'ERRO: Chave auto_apply_dynamic_rules NÃO existe no JSON';
      v_auto_apply_rules := false;
    END IF;
  END IF;

  RAISE NOTICE 'Resultado final: auto_apply_dynamic_rules = %', v_auto_apply_rules;

  -- 2. Verificar regras dinâmicas
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICANDO REGRAS DINÂMICAS ===';
  
  SELECT COUNT(*) INTO v_rules_count
  FROM public.dynamic_pricing_rules
  WHERE establishment_id = v_establishment_id
    AND is_active = true;

  RAISE NOTICE 'Total de regras ativas: %', v_rules_count;

  IF v_rules_count > 0 THEN
    RAISE NOTICE 'Regras encontradas para a data %:', v_test_date;
    
    FOR v_rule IN
      SELECT 
        id,
        name,
        trigger_type,
        adjustment_type,
        adjustment_value,
        priority,
        start_date,
        end_date,
        applicable_categories,
        applicable_plans,
        is_active
      FROM public.dynamic_pricing_rules
      WHERE establishment_id = v_establishment_id
        AND is_active = true
        AND (start_date IS NULL OR start_date <= v_test_date)
        AND (end_date IS NULL OR end_date >= v_test_date)
      ORDER BY priority ASC
    LOOP
      RAISE NOTICE '  - Regra: % (ID: %)', v_rule.name, v_rule.id;
      RAISE NOTICE '    Tipo: %, Ajuste: % %, Prioridade: %', 
        v_rule.trigger_type, 
        v_rule.adjustment_type,
        v_rule.adjustment_value,
        v_rule.priority;
      RAISE NOTICE '    Período: % a %', 
        COALESCE(v_rule.start_date::text, 'sem início'),
        COALESCE(v_rule.end_date::text, 'sem fim');
      
      -- Verificar se aplica à categoria
      IF v_rule.applicable_categories IS NULL OR 
         array_length(v_rule.applicable_categories, 1) IS NULL OR
         array_length(v_rule.applicable_categories, 1) = 0 OR
         v_category_id = ANY(v_rule.applicable_categories) THEN
        RAISE NOTICE '    ✓ Aplica à categoria %', v_category_id;
      ELSE
        RAISE NOTICE '    ✗ NÃO aplica à categoria %', v_category_id;
      END IF;
      
      -- Verificar se aplica ao plano
      IF v_rule.applicable_plans IS NULL OR 
         array_length(v_rule.applicable_plans, 1) IS NULL OR
         array_length(v_rule.applicable_plans, 1) = 0 OR
         v_plan_id = ANY(v_rule.applicable_plans) THEN
        RAISE NOTICE '    ✓ Aplica ao plano %', v_plan_id;
      ELSE
        RAISE NOTICE '    ✗ NÃO aplica ao plano %', v_plan_id;
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'ERRO: Nenhuma regra ativa encontrada!';
  END IF;

  -- 3. Testar a função calculate_rate_price
  RAISE NOTICE '';
  RAISE NOTICE '=== TESTANDO FUNÇÃO calculate_rate_price ===';
  
  DECLARE
    v_result DECIMAL(10,2);
  BEGIN
    SELECT public.calculate_rate_price(
      v_establishment_id,
      v_category_id,
      v_plan_id,
      v_test_date,
      1, -- adults
      0  -- children
    ) INTO v_result;
    
    RAISE NOTICE 'Preço calculado para %: R$ %', v_test_date, v_result;
  END;

END $$;

