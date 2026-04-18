-- ============================================
-- GARANTIR ACESSO PÚBLICO A ESTABELECIMENTOS
-- ============================================
-- Esta migration garante que usuários anônimos possam acessar estabelecimentos
-- na página pública de reservas, removendo políticas conflitantes e criando
-- uma política única e clara.

-- Remover todas as políticas existentes que podem estar conflitando
DROP POLICY IF EXISTS "Public can view establishments for reservations" ON public.establishments;
DROP POLICY IF EXISTS "Public can view establishments from quotes" ON public.establishments;
DROP POLICY IF EXISTS "Guests can view establishments from their reservations" ON public.establishments;
DROP POLICY IF EXISTS "Allow authenticated users to read establishments" ON public.establishments;
DROP POLICY IF EXISTS "Allow authenticated users to manage establishments" ON public.establishments;

-- Criar política única e clara para acesso público
CREATE POLICY "Public can view establishments for reservations"
  ON public.establishments FOR SELECT
  TO anon, authenticated, public
  USING (true); -- Permitir acesso público a todos os estabelecimentos

-- Comentário explicativo
COMMENT ON POLICY "Public can view establishments for reservations" ON public.establishments IS 
'Permite acesso público (anon, authenticated, public) à tabela establishments para visualização. Necessário para página pública de reservas onde hóspedes podem visualizar informações do estabelecimento.';

