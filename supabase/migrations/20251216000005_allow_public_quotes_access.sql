-- Permitir acesso público à tabela quotes e tabelas relacionadas quando há um payment_intent_id
-- Isso é necessário para que a página pública de pagamento do orçamento possa funcionar

-- ============================================
-- POLÍTICAS PARA TABELA QUOTES
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can read quotes by payment intent" ON public.quotes;
  
  -- Criar política para permitir acesso público quando há payment_intent_id
  CREATE POLICY "Public can read quotes by payment intent"
    ON public.quotes FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se o quote tem um payment_intent_id (indica que é um link público)
      payment_intent_id IS NOT NULL
      OR
      -- Ou se tem um payment_link (também indica link público)
      payment_link IS NOT NULL
    );
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA ROOM_CATEGORIES (relacionadas a quotes)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view room categories from quotes" ON public.room_categories;
  
  -- Criar política que permite acesso público para categorias relacionadas a quotes públicos
  CREATE POLICY "Public can view room categories from quotes"
    ON public.room_categories FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se a categoria está relacionada a um quote público
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.category_id = room_categories.id
        AND (q.payment_intent_id IS NOT NULL OR q.payment_link IS NOT NULL)
        AND q.status IN ('pending', 'sent')
      )
    );
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA ESTABLISHMENTS (relacionadas a quotes)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view establishments from quotes" ON public.establishments;
  
  -- Criar política que permite acesso público para estabelecimentos relacionados a quotes públicos
  CREATE POLICY "Public can view establishments from quotes"
    ON public.establishments FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se o estabelecimento está relacionado a um quote público
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.establishment_id = establishments.id
        AND (q.payment_intent_id IS NOT NULL OR q.payment_link IS NOT NULL)
        AND q.status IN ('pending', 'sent')
      )
    );
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA HOTEL_SETTINGS (relacionadas a quotes)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view hotel settings from quotes" ON public.hotel_settings;
  
  -- Criar política que permite acesso público para hotel_settings relacionados a quotes públicos
  CREATE POLICY "Public can view hotel settings from quotes"
    ON public.hotel_settings FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se o hotel_settings está relacionado a um quote público
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.establishment_id = hotel_settings.establishment_id
        AND (q.payment_intent_id IS NOT NULL OR q.payment_link IS NOT NULL)
        AND q.status IN ('pending', 'sent')
      )
    );
END $$;

-- Comentários explicativos
COMMENT ON POLICY "Public can read quotes by payment intent" ON public.quotes IS 
'Permite acesso público (anon) à tabela quotes quando há um payment_intent_id ou payment_link. Necessário para páginas públicas de pagamento do orçamento.';

COMMENT ON POLICY "Public can view room categories from quotes" ON public.room_categories IS 
'Permite acesso público (anon) à tabela room_categories quando relacionada a um quote público. Necessário para páginas públicas de pagamento do orçamento.';

COMMENT ON POLICY "Public can view establishments from quotes" ON public.establishments IS 
'Permite acesso público (anon) à tabela establishments quando relacionado a um quote público. Necessário para páginas públicas de pagamento do orçamento.';

COMMENT ON POLICY "Public can view hotel settings from quotes" ON public.hotel_settings IS 
'Permite acesso público (anon) à tabela hotel_settings quando relacionado a um quote público. Necessário para páginas públicas de pagamento do orçamento.';

