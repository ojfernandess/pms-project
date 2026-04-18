-- Função helper para verificar se o usuário é gerente de um estabelecimento
-- Usa SECURITY DEFINER para evitar recursão na RLS
CREATE OR REPLACE FUNCTION public.is_manager_of_establishment(
  p_user_id UUID,
  p_establishment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_manager BOOLEAN := FALSE;
  v_is_super_admin BOOLEAN := FALSE;
BEGIN
  -- Verificar se é super admin
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = p_user_id AND is_super_admin = true
  ) INTO v_is_super_admin;
  
  IF v_is_super_admin THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar se é gerente do estabelecimento
  SELECT EXISTS (
    SELECT 1 FROM public.employees emp
    INNER JOIN public.employee_roles er ON er.id = emp.role_id
    WHERE emp.user_id = p_user_id
    AND emp.establishment_id = p_establishment_id
    AND emp.is_active = true
    AND er.code = 'manager'
  ) INTO v_is_manager;
  
  RETURN v_is_manager;
END;
$$;

-- Remover políticas antigas que causam recursão
DROP POLICY IF EXISTS "Allow managers to manage employees" ON public.employees;

-- Criar nova política usando a função helper
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'employees' 
    AND policyname = 'Allow managers to manage employees'
  ) THEN
    CREATE POLICY "Allow managers to manage employees"
      ON public.employees FOR ALL
      TO authenticated
      USING (
        public.is_manager_of_establishment(auth.uid(), establishment_id)
      )
      WITH CHECK (
        public.is_manager_of_establishment(auth.uid(), establishment_id)
      );
  END IF;
END $$;

-- Comentário explicativo
COMMENT ON FUNCTION public.is_manager_of_establishment(UUID, UUID) IS 'Verifica se um usuário é gerente de um estabelecimento, evitando recursão na RLS';

-- Política adicional: Permitir que usuários associados à empresa criem funcionários
-- Isso permite criar o primeiro funcionário (gerente) ao criar um estabelecimento
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'employees' 
    AND policyname = 'Allow company users to create employees'
  ) THEN
    CREATE POLICY "Allow company users to create employees"
      ON public.employees FOR INSERT
      TO authenticated
      WITH CHECK (
        -- Verificar se o usuário está associado à empresa do estabelecimento
        EXISTS (
          SELECT 1 FROM public.establishments e
          INNER JOIN public.user_companies uc ON uc.company_id = e.company_id
          WHERE e.id = employees.establishment_id
          AND uc.user_id = auth.uid()
        )
        -- OU se é super admin
        OR EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.is_super_admin = true
        )
      );
  END IF;
END $$;

