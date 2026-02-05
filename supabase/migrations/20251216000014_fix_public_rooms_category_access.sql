-- Corrigir acesso público às categorias quando relacionadas a quartos públicos
-- Necessário para que o relacionamento category:room_categories(*) funcione na página pública
-- Usa função SECURITY DEFINER para evitar recursão RLS

-- ============================================
-- CRIAR FUNÇÃO SECURITY DEFINER
-- ============================================
CREATE OR REPLACE FUNCTION public.has_public_room_in_category(cat_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.rooms
    WHERE category_id = cat_id
    AND show_in_public = true
  );
END;
$$;

-- ============================================
-- ATUALIZAR POLÍTICA PARA ROOM_CATEGORIES
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view room categories for reservations" ON public.room_categories;
  
  -- Criar política que permite acesso público para categorias relacionadas a quartos públicos
  CREATE POLICY "Public can view room categories for reservations"
    ON public.room_categories FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se a categoria está marcada como pública
      show_in_public = true
      OR
      -- Ou se há pelo menos um quarto público nesta categoria (usando função para evitar recursão)
      public.has_public_room_in_category(room_categories.id)
    );
END $$;

-- Comentários
COMMENT ON FUNCTION public.has_public_room_in_category(UUID) IS 
'Verifica se há pelo menos um quarto público em uma categoria. Usa SECURITY DEFINER para evitar recursão RLS.';

COMMENT ON POLICY "Public can view room categories for reservations" ON public.room_categories IS 
'Permite acesso público (anon) à tabela room_categories quando show_in_public = true ou quando há quartos públicos nesta categoria. Necessário para página pública de reservas com relacionamentos.';

