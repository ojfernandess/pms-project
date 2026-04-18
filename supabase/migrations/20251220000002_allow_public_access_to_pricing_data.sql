-- ============================================
-- PERMITIR ACESSO PÚBLICO A DADOS DE PRECIFICAÇÃO
-- ============================================
-- Este migration permite que usuários anônimos acessem as tabelas necessárias
-- para calcular preços dos planos tarifários na página pública de reservas

-- ============================================
-- POLÍTICAS PARA TABELA PRICING_PLANS
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read pricing plans" ON public.pricing_plans;

-- Criar política que permite leitura pública de planos tarifários
-- Necessário para calcular preços na página pública de reservas
CREATE POLICY "Public can read pricing plans"
  ON public.pricing_plans FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- POLÍTICAS PARA TABELA DYNAMIC_PRICING_RULES
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read dynamic pricing rules" ON public.dynamic_pricing_rules;

-- Criar política que permite leitura pública de regras de precificação dinâmica
-- Necessário para calcular preços na página pública de reservas
CREATE POLICY "Public can read dynamic pricing rules"
  ON public.dynamic_pricing_rules FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- POLÍTICAS PARA TABELA RATE_RESTRICTIONS
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read rate restrictions" ON public.rate_restrictions;

-- Criar política que permite leitura pública de restrições de tarifa
-- Necessário para calcular preços na página pública de reservas
CREATE POLICY "Public can read rate restrictions"
  ON public.rate_restrictions FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- POLÍTICAS PARA TABELA HOTEL_SETTINGS
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read hotel settings for pricing" ON public.hotel_settings;

-- Criar política que permite leitura pública de configurações do hotel
-- Necessário para acessar configurações de planos tarifários públicos
CREATE POLICY "Public can read hotel settings for pricing"
  ON public.hotel_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- POLÍTICAS PARA TABELA RATE_CALENDAR
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read rate calendar" ON public.rate_calendar;

-- Criar política que permite leitura pública do calendário de tarifas
-- Necessário para calcular preços na página pública de reservas
CREATE POLICY "Public can read rate calendar"
  ON public.rate_calendar FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- MODIFICAR FUNÇÃO calculate_rate_price PARA USAR SECURITY DEFINER
-- ============================================
-- Isso garante que a função possa acessar todas as tabelas necessárias
-- mesmo que as políticas RLS sejam restritivas

-- Ler a definição atual da função
DO $$
DECLARE
  v_function_definition TEXT;
BEGIN
  -- Obter a definição atual da função
  SELECT pg_get_functiondef(oid) INTO v_function_definition
  FROM pg_proc
  WHERE proname = 'calculate_rate_price'
  AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  -- Se a função existe e não usa SECURITY DEFINER, recriá-la
  IF v_function_definition IS NOT NULL AND v_function_definition NOT LIKE '%SECURITY DEFINER%' THEN
    -- A função será recriada na próxima migration que a atualizar
    -- Por enquanto, apenas adicionamos as políticas RLS acima
    RAISE NOTICE 'Função calculate_rate_price encontrada. Políticas RLS criadas para permitir acesso público.';
  END IF;
END $$;

-- Comentários explicativos
COMMENT ON POLICY "Public can read pricing plans" ON public.pricing_plans IS 
'Permite leitura pública (anon) de planos tarifários. Necessário para calcular preços na página pública de reservas.';

COMMENT ON POLICY "Public can read dynamic pricing rules" ON public.dynamic_pricing_rules IS 
'Permite leitura pública (anon) de regras de precificação dinâmica. Necessário para calcular preços na página pública de reservas.';

COMMENT ON POLICY "Public can read rate restrictions" ON public.rate_restrictions IS 
'Permite leitura pública (anon) de restrições de tarifa. Necessário para calcular preços na página pública de reservas.';

COMMENT ON POLICY "Public can read hotel settings for pricing" ON public.hotel_settings IS 
'Permite leitura pública (anon) de configurações do hotel. Necessário para acessar configurações de planos tarifários públicos na página pública de reservas.';

COMMENT ON POLICY "Public can read rate calendar" ON public.rate_calendar IS 
'Permite leitura pública (anon) do calendário de tarifas. Necessário para calcular preços na página pública de reservas.';

