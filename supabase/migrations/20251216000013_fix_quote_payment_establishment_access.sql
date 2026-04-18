-- Corrigir acesso público ao estabelecimento na página de pagamento de orçamento
-- O problema: políticas RLS podem estar bloqueando acesso ao establishment quando há payment_intent_id

-- ============================================
-- CRIAR FUNÇÕES SECURITY DEFINER (fora do bloco DO)
-- ============================================

-- Função para verificar quote público por estabelecimento
CREATE OR REPLACE FUNCTION public.has_public_quote_for_establishment_payment(est_id UUID)
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
    AND status IN ('pending', 'sent', 'accepted')
  );
END;
$$;

-- Função para verificar quote público por categoria
CREATE OR REPLACE FUNCTION public.has_public_quote_for_category_payment(cat_id UUID)
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
    AND status IN ('pending', 'sent', 'accepted')
  );
END;
$$;

-- ============================================
-- ATUALIZAR POLÍTICAS RLS (usar bloco DO)
-- ============================================

-- Política para ESTABLISHMENTS
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view establishments from quotes" ON public.establishments;
  
  -- Criar política usando função SECURITY DEFINER (sem recursão)
  CREATE POLICY "Public can view establishments from quotes"
    ON public.establishments FOR SELECT
    TO anon, authenticated
    USING (
      public.has_public_quote_for_establishment_payment(establishments.id)
    );
END $$;

-- Política para HOTEL_SETTINGS
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view hotel settings from quotes" ON public.hotel_settings;
  
  -- Criar política usando função SECURITY DEFINER (sem recursão)
  CREATE POLICY "Public can view hotel settings from quotes"
    ON public.hotel_settings FOR SELECT
    TO anon, authenticated
    USING (
      public.has_public_quote_for_establishment_payment(hotel_settings.establishment_id)
    );
END $$;

-- Política para ROOM_CATEGORIES
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view room categories from quotes" ON public.room_categories;
  
  -- Criar política usando função SECURITY DEFINER (sem recursão)
  CREATE POLICY "Public can view room categories from quotes"
    ON public.room_categories FOR SELECT
    TO anon, authenticated
    USING (
      public.has_public_quote_for_category_payment(room_categories.id)
    );
END $$;

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION public.has_public_quote_for_establishment_payment(UUID) IS 
'Verifica se há um quote público relacionado a um estabelecimento para pagamento. Usa SECURITY DEFINER para evitar recursão RLS.';

COMMENT ON FUNCTION public.has_public_quote_for_category_payment(UUID) IS 
'Verifica se há um quote público relacionado a uma categoria para pagamento. Usa SECURITY DEFINER para evitar recursão RLS.';
