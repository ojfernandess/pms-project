-- Adicionar campos de configuração para exibição de quartos em páginas públicas
-- Permite configurar fotos, descrições detalhadas e outras informações para motor de reservas

-- ============================================
-- CAMPOS PARA ROOM_CATEGORIES
-- ============================================

-- Fotos da categoria (array de URLs)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS display_photos TEXT[] DEFAULT '{}';

-- Descrição detalhada para exibição pública
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS display_description TEXT;

-- Características destacadas (array de strings)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS display_features TEXT[] DEFAULT '{}';

-- Ordem de exibição (para ordenar na página pública)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Se deve ser exibido na página pública
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS show_in_public BOOLEAN DEFAULT true;

-- ============================================
-- CAMPOS PARA ROOMS
-- ============================================

-- Fotos do quarto (array de URLs)
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS display_photos TEXT[] DEFAULT '{}';

-- Descrição detalhada para exibição pública
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS display_description TEXT;

-- Características específicas do quarto (array de strings)
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS display_features TEXT[] DEFAULT '{}';

-- Se deve ser exibido na página pública
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS show_in_public BOOLEAN DEFAULT true;

-- ============================================
-- ADICIONAR CAMPO PARA LINK DE SELEÇÃO DE QUARTOS NO QUOTES
-- ============================================

ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS room_selection_link TEXT;

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_quotes_room_selection_link ON public.quotes(room_selection_link) WHERE room_selection_link IS NOT NULL;

-- ============================================
-- COMENTÁRIOS
-- ============================================

COMMENT ON COLUMN public.room_categories.display_photos IS 'Array de URLs das fotos da categoria para exibição em páginas públicas';
COMMENT ON COLUMN public.room_categories.display_description IS 'Descrição detalhada da categoria para exibição em páginas públicas';
COMMENT ON COLUMN public.room_categories.display_features IS 'Array de características destacadas da categoria (ex: Wi-fi, Piscina, Ar Condicionado)';
COMMENT ON COLUMN public.room_categories.display_order IS 'Ordem de exibição da categoria na página pública (menor número aparece primeiro)';
COMMENT ON COLUMN public.room_categories.show_in_public IS 'Se a categoria deve ser exibida em páginas públicas de seleção de quartos';

COMMENT ON COLUMN public.rooms.display_photos IS 'Array de URLs das fotos do quarto para exibição em páginas públicas';
COMMENT ON COLUMN public.rooms.display_description IS 'Descrição detalhada do quarto para exibição em páginas públicas';
COMMENT ON COLUMN public.rooms.display_features IS 'Array de características específicas do quarto';
COMMENT ON COLUMN public.rooms.show_in_public IS 'Se o quarto deve ser exibido em páginas públicas de seleção de quartos';

COMMENT ON COLUMN public.quotes.room_selection_link IS 'Link único para página pública de seleção de quartos para este orçamento';

