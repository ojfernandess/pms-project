-- ============================================
-- CORRIGIR RECURSÃO INFINITA NAS POLÍTICAS RLS DE EMPLOYEES
-- ============================================
-- O problema: A política "Allow users to read employees from their establishments"
-- referencia public.establishments, que pode ter políticas que referenciam employees,
-- criando um ciclo de recursão.

-- Criar função helper para verificar se usuário pode acessar estabelecimento
-- Usa SECURITY DEFINER para evitar recursão na RLS
CREATE OR REPLACE FUNCTION public.user_can_access_establishment(
  p_user_id UUID,
  p_establishment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_access BOOLEAN := FALSE;
BEGIN
  -- Verificar se é super admin
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = p_user_id AND is_super_admin = true
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar se o usuário está associado à empresa do estabelecimento
  -- Usar SECURITY DEFINER para evitar recursão
  SELECT EXISTS (
    SELECT 1 FROM public.establishments e
    INNER JOIN public.user_companies uc ON uc.company_id = e.company_id
    WHERE e.id = p_establishment_id
    AND uc.user_id = p_user_id
  ) INTO v_can_access;
  
  RETURN v_can_access;
END;
$$;

-- Remover política antiga que causa recursão
DROP POLICY IF EXISTS "Allow users to read employees from their establishments" ON public.employees;

-- Criar nova política usando a função helper
CREATE POLICY "Allow users to read employees from their establishments"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_establishment(auth.uid(), establishment_id)
  );

-- Também permitir que funcionários leiam seus próprios registros
DROP POLICY IF EXISTS "Employees can read their own records" ON public.employees;

CREATE POLICY "Employees can read their own records"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Comentários
COMMENT ON FUNCTION public.user_can_access_establishment(UUID, UUID) IS 
'Verifica se um usuário pode acessar um estabelecimento, evitando recursão na RLS. Usa SECURITY DEFINER para bypassar políticas RLS durante a verificação.';

COMMENT ON POLICY "Allow users to read employees from their establishments" ON public.employees IS 
'Permite que usuários leiam funcionários dos estabelecimentos que podem acessar. Usa função helper para evitar recursão.';

COMMENT ON POLICY "Employees can read their own records" ON public.employees IS 
'Permite que funcionários leiam seus próprios registros, garantindo acesso mesmo se outras políticas falharem.';

