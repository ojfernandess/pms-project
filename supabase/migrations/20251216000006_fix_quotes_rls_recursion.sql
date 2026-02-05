-- Corrigir recursão infinita nas políticas RLS da tabela quotes
-- O problema: políticas de outras tabelas verificam quotes, e quotes verifica outras tabelas, criando recursão
-- Solução: usar funções SECURITY DEFINER que bypassam RLS para verificações

-- ============================================
-- FUNÇÕES AUXILIARES (SECURITY DEFINER para bypass RLS)
-- ============================================

-- Função para verificar se há um quote público relacionado a uma categoria
CREATE OR REPLACE FUNCTION public.has_public_quote_for_category(cat_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.quotes
    WHERE category_id = cat_id
    AND (payment_intent_id IS NOT NULL OR payment_link IS NOT NULL)
    AND status IN ('pending', 'sent')
  );
END;
$$;

-- Função para verificar se há um quote público relacionado a um estabelecimento
CREATE OR REPLACE FUNCTION public.has_public_quote_for_establishment(est_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.quotes
    WHERE establishment_id = est_id
    AND (payment_intent_id IS NOT NULL OR payment_link IS NOT NULL)
    AND status IN ('pending', 'sent')
  );
END;
$$;

-- ============================================
-- REMOVER POLÍTICAS PROBLEMÁTICAS
-- ============================================

-- Remover políticas que causam recursão
DROP POLICY IF EXISTS "Public can view room categories from quotes" ON public.room_categories;
DROP POLICY IF EXISTS "Public can view establishments from quotes" ON public.establishments;
DROP POLICY IF EXISTS "Public can view hotel settings from quotes" ON public.hotel_settings;

-- ============================================
-- RECRIAR POLÍTICAS USANDO FUNÇÕES (SEM RECURSÃO)
-- ============================================

-- Política para room_categories usando função SECURITY DEFINER
CREATE POLICY "Public can view room categories from quotes"
  ON public.room_categories FOR SELECT
  TO anon, authenticated
  USING (
    public.has_public_quote_for_category(room_categories.id)
  );

-- Política para establishments usando função SECURITY DEFINER
CREATE POLICY "Public can view establishments from quotes"
  ON public.establishments FOR SELECT
  TO anon, authenticated
  USING (
    public.has_public_quote_for_establishment(establishments.id)
  );

-- Política para hotel_settings usando função SECURITY DEFINER
CREATE POLICY "Public can view hotel settings from quotes"
  ON public.hotel_settings FOR SELECT
  TO anon, authenticated
  USING (
    public.has_public_quote_for_establishment(hotel_settings.establishment_id)
  );

-- Comentários
COMMENT ON FUNCTION public.has_public_quote_for_category(UUID) IS 
'Verifica se há um quote público relacionado a uma categoria. Usa SECURITY DEFINER para evitar recursão RLS.';

COMMENT ON FUNCTION public.has_public_quote_for_establishment(UUID) IS 
'Verifica se há um quote público relacionado a um estabelecimento. Usa SECURITY DEFINER para evitar recursão RLS.';

