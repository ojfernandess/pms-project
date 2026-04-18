-- Permitir acesso público aos estabelecimentos e categorias para página pública de reservas
-- Necessário para página pública onde hóspedes podem criar reservas

-- ============================================
-- POLÍTICAS PARA TABELA ESTABLISHMENTS (acesso público básico)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view establishments for reservations" ON public.establishments;
  
  -- Criar política que permite acesso público para visualização de estabelecimentos
  CREATE POLICY "Public can view establishments for reservations"
    ON public.establishments FOR SELECT
    TO anon, authenticated
    USING (true); -- Permitir acesso público a todos os estabelecimentos
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA ROOM_CATEGORIES (acesso público)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view room categories for reservations" ON public.room_categories;
  
  -- Criar política que permite acesso público para categorias marcadas como públicas
  CREATE POLICY "Public can view room categories for reservations"
    ON public.room_categories FOR SELECT
    TO anon, authenticated
    USING (show_in_public = true);
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA ROOMS (acesso público)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view rooms for reservations" ON public.rooms;
  
  -- Criar política que permite acesso público para quartos marcados como públicos
  CREATE POLICY "Public can view rooms for reservations"
    ON public.rooms FOR SELECT
    TO anon, authenticated
    USING (show_in_public = true AND is_active = true);
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA ESTABLISHMENT_SERVICES (acesso público)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view establishment services" ON public.establishment_services;
  
  -- Criar política que permite acesso público para serviços ativos
  CREATE POLICY "Public can view establishment services"
    ON public.establishment_services FOR SELECT
    TO anon, authenticated
    USING (is_active = true);
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA HOTEL_SETTINGS (acesso público limitado)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can view hotel settings for reservations" ON public.hotel_settings;
  
  -- Criar política que permite acesso público para configurações básicas do hotel
  CREATE POLICY "Public can view hotel settings for reservations"
    ON public.hotel_settings FOR SELECT
    TO anon, authenticated
    USING (true); -- Permitir acesso público às configurações básicas
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA CLIENTS (INSERT público para criar clientes)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can create clients for reservations" ON public.clients;
  
  -- Criar política que permite criação pública de clientes
  CREATE POLICY "Public can create clients for reservations"
    ON public.clients FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
END $$;

-- ============================================
-- POLÍTICAS PARA TABELA QUOTES (INSERT público para criar orçamentos)
-- ============================================
DO $$ 
BEGIN
  -- Remover política existente se houver
  DROP POLICY IF EXISTS "Public can create quotes for reservations" ON public.quotes;
  
  -- Criar política que permite criação pública de orçamentos
  CREATE POLICY "Public can create quotes for reservations"
    ON public.quotes FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
END $$;

-- Comentários
COMMENT ON POLICY "Public can view establishments for reservations" ON public.establishments IS 
'Permite acesso público (anon) à tabela establishments para visualização. Necessário para página pública de reservas.';

COMMENT ON POLICY "Public can view room categories for reservations" ON public.room_categories IS 
'Permite acesso público (anon) à tabela room_categories quando show_in_public = true. Necessário para página pública de reservas.';

COMMENT ON POLICY "Public can view rooms for reservations" ON public.rooms IS 
'Permite acesso público (anon) à tabela rooms quando show_in_public = true e is_active = true. Necessário para página pública de reservas.';

COMMENT ON POLICY "Public can view establishment services" ON public.establishment_services IS 
'Permite acesso público (anon) à tabela establishment_services quando is_active = true. Necessário para página pública de reservas.';

COMMENT ON POLICY "Public can view hotel settings for reservations" ON public.hotel_settings IS 
'Permite acesso público (anon) à tabela hotel_settings para visualização. Necessário para página pública de reservas.';

COMMENT ON POLICY "Public can create clients for reservations" ON public.clients IS 
'Permite criação pública (anon) de clientes na tabela clients. Necessário para página pública de reservas onde hóspedes criam seus próprios registros.';

COMMENT ON POLICY "Public can create quotes for reservations" ON public.quotes IS 
'Permite criação pública (anon) de orçamentos na tabela quotes. Necessário para página pública de reservas onde hóspedes criam seus próprios orçamentos.';

