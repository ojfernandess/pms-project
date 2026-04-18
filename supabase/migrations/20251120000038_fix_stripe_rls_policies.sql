-- Corrigir políticas RLS para stripe_establishment_config
-- Este script garante que as políticas sejam criadas corretamente

-- Primeiro, desabilitar RLS temporariamente para limpar políticas
ALTER TABLE public.stripe_establishment_config DISABLE ROW LEVEL SECURITY;

-- Remover todas as políticas existentes (se houver)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Remover todas as políticas da tabela
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'stripe_establishment_config'
  ) LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.stripe_establishment_config';
  END LOOP;
END $$;

-- Reabilitar RLS
ALTER TABLE public.stripe_establishment_config ENABLE ROW LEVEL SECURITY;

-- Criar política de leitura (permitir todos os usuários autenticados)
-- Usar uma verificação explícita de autenticação
CREATE POLICY "Users can read their establishment stripe config"
  ON public.stripe_establishment_config FOR SELECT
  TO authenticated
  USING (
    -- Verificar se o usuário está autenticado
    auth.uid() IS NOT NULL
  );

-- Criar política de gerenciamento (apenas funcionários ou proprietários)
CREATE POLICY "Users can manage their establishment stripe config"
  ON public.stripe_establishment_config FOR ALL
  TO authenticated
  USING (
    -- Permitir acesso se o usuário é funcionário do estabelecimento
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
      AND is_active = true
    )
    OR
    -- Ou se o usuário é proprietário da empresa que possui o estabelecimento
    establishment_id IN (
      SELECT e.id FROM public.establishments e
      INNER JOIN public.companies c ON c.id = e.company_id
      INNER JOIN public.user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = auth.uid()
      AND uc.is_active = true
    )
  )
  WITH CHECK (
    -- Permitir acesso se o usuário é funcionário do estabelecimento
    establishment_id IN (
      SELECT establishment_id FROM public.employees
      WHERE user_id = auth.uid()
      AND is_active = true
    )
    OR
    -- Ou se o usuário é proprietário da empresa que possui o estabelecimento
    establishment_id IN (
      SELECT e.id FROM public.establishments e
      INNER JOIN public.companies c ON c.id = e.company_id
      INNER JOIN public.user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = auth.uid()
      AND uc.is_active = true
    )
  );

