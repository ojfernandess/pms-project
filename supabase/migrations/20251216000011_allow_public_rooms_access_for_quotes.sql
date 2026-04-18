-- Permitir acesso público aos quartos relacionados a quotes públicos
-- Necessário para página pública de seleção de quartos

-- ============================================
-- POLÍTICAS PARA TABELA ROOMS
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view rooms from quotes" ON public.rooms;
  
  -- Criar política que permite acesso público para quartos relacionados a quotes públicos
  CREATE POLICY "Public can view rooms from quotes"
    ON public.rooms FOR SELECT
    TO anon, authenticated
    USING (
      -- Permitir acesso se o quarto está relacionado a um quote público
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE (q.room_id = rooms.id OR q.category_id = rooms.category_id)
        AND q.room_selection_link IS NOT NULL
        AND q.status IN ('pending', 'sent')
      )
      OR
      -- Ou se o quarto está em uma categoria relacionada a um quote público
      EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.room_categories rc ON rc.id = q.category_id
        WHERE rooms.category_id = rc.id
        AND q.room_selection_link IS NOT NULL
        AND q.status IN ('pending', 'sent')
        AND rooms.show_in_public = true
      )
    );
END $$;

-- Comentário
COMMENT ON POLICY "Public can view rooms from quotes" ON public.rooms IS 
'Permite acesso público (anon) à tabela rooms quando relacionado a um quote público com room_selection_link. Necessário para página pública de seleção de quartos.';

