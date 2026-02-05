-- Consolidar políticas RLS para rooms e room_categories
-- Garantir que o relacionamento category:room_categories(*) funcione na página pública
-- Remover políticas conflitantes e criar uma política unificada

-- ============================================
-- REMOVER POLÍTICAS CONFLITANTES DE ROOMS
-- ============================================
DO $$ 
BEGIN
  -- Remover todas as políticas públicas existentes de rooms para evitar conflitos
  DROP POLICY IF EXISTS "Public can view rooms from quotes" ON public.rooms;
  DROP POLICY IF EXISTS "Public can view rooms for reservations" ON public.rooms;
END $$;

-- ============================================
-- CRIAR POLÍTICA UNIFICADA PARA ROOMS
-- ============================================
DO $$ 
BEGIN
  -- Criar política unificada que permite acesso público para quartos públicos
  -- Nota: A tabela rooms não tem coluna is_active, apenas show_in_public
  CREATE POLICY "Public can view public rooms"
    ON public.rooms FOR SELECT
    TO anon, authenticated
    USING (
      show_in_public = true
    );
END $$;

-- ============================================
-- REMOVER POLÍTICAS CONFLITANTES DE ROOM_CATEGORIES
-- ============================================
DO $$ 
BEGIN
  -- Remover todas as políticas públicas existentes de room_categories para evitar conflitos
  DROP POLICY IF EXISTS "Public can view room categories from quotes" ON public.room_categories;
  DROP POLICY IF EXISTS "Public can view room categories for reservations" ON public.room_categories;
END $$;

-- ============================================
-- CRIAR POLÍTICA UNIFICADA PARA ROOM_CATEGORIES
-- ============================================
DO $$ 
BEGIN
  -- Criar política unificada que permite acesso público para categorias públicas
  -- Quando há relacionamento com rooms, a política de rooms já garante que só quartos públicos sejam retornados
  -- Mas precisamos permitir acesso à categoria mesmo que não esteja marcada como pública, se houver quartos públicos nela
  CREATE POLICY "Public can view public room categories"
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
COMMENT ON POLICY "Public can view public rooms" ON public.rooms IS 
'Permite acesso público (anon) à tabela rooms quando show_in_public = true. Política unificada para página pública de reservas.';

COMMENT ON POLICY "Public can view public room categories" ON public.room_categories IS 
'Permite acesso público (anon) à tabela room_categories quando show_in_public = true ou quando há quartos públicos nesta categoria. Política unificada para página pública de reservas com relacionamentos.';

