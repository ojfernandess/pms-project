-- =====================================================
-- CORRIGIR ACESSO PÚBLICO À TABELA rate_inventory
-- =====================================================
-- Garantir que a página pública de reserva possa acessar rate_inventory
-- O erro 406 (Not Acceptable) indica problema com RLS

-- 1. Remover todas as políticas existentes para recriar na ordem correta
DROP POLICY IF EXISTS "Allow authenticated users to read rate inventory" ON public.rate_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to manage rate inventory" ON public.rate_inventory;
DROP POLICY IF EXISTS "Public can read rate inventory" ON public.rate_inventory;

-- 2. Criar política pública PRIMEIRO (mais permissiva)
-- Isso garante que usuários anônimos possam ler
CREATE POLICY "Public can read rate inventory"
  ON public.rate_inventory FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. Criar política para usuários autenticados lerem
CREATE POLICY "Allow authenticated users to read rate inventory"
  ON public.rate_inventory FOR SELECT
  TO authenticated
  USING (true);

-- 4. Criar política para usuários autenticados gerenciarem (INSERT, UPDATE, DELETE)
CREATE POLICY "Allow authenticated users to manage rate inventory"
  ON public.rate_inventory FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Verificar se RLS está habilitado
ALTER TABLE public.rate_inventory ENABLE ROW LEVEL SECURITY;

-- 6. Comentário explicativo
COMMENT ON POLICY "Public can read rate inventory" ON public.rate_inventory IS 
  'Permite acesso público (anon) para leitura de inventário, necessário para motor de reservas';

