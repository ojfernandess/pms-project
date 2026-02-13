-- Adicionar campos completos de categoria conforme especificação
-- Esta migration adiciona todos os campos necessários para o gerenciamento completo de categorias

-- Tipo de categoria (se não existir)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Double';

-- Abreviatura da categoria
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS abbreviation TEXT;

-- Cor da categoria (para identificação visual)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#445d85';

-- Privacidade (Quarto Privado, Quarto Compartilhado, etc)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS privacy TEXT DEFAULT 'Quarto Privado';

-- Day Use (Sim/Não)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS day_use BOOLEAN DEFAULT false;

-- Idade Cortesia (idade até a qual crianças não pagam)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS courtesy_age INTEGER DEFAULT 2;

-- Ocupação Mínima
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS minimum_occupancy INTEGER DEFAULT 1;

-- Ocupação Máxima (pode ser diferente de capacity_adults)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS maximum_occupancy INTEGER;

-- Ocupação Padrão (padrão de hóspedes)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS standard_occupancy INTEGER;

-- Quantidade de Acomodação (número de unidades desta categoria)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS accommodation_quantity INTEGER DEFAULT 1;

-- Limite de Cortesia (número máximo de crianças cortesia)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS courtesy_limit INTEGER DEFAULT 1;

-- Descrição rica (HTML/Rich Text)
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS rich_description TEXT;

-- Comentários
COMMENT ON COLUMN public.room_categories.abbreviation IS 'Abreviatura da categoria para exibição';
COMMENT ON COLUMN public.room_categories.color IS 'Cor hexadecimal para identificação visual da categoria';
COMMENT ON COLUMN public.room_categories.privacy IS 'Tipo de privacidade: Quarto Privado, Quarto Compartilhado, etc';
COMMENT ON COLUMN public.room_categories.day_use IS 'Se a categoria permite day use (uso diário)';
COMMENT ON COLUMN public.room_categories.courtesy_age IS 'Idade máxima para cortesia (crianças até esta idade não pagam)';
COMMENT ON COLUMN public.room_categories.minimum_occupancy IS 'Ocupação mínima da categoria';
COMMENT ON COLUMN public.room_categories.maximum_occupancy IS 'Ocupação máxima da categoria (pode ser diferente de capacity_adults)';
COMMENT ON COLUMN public.room_categories.standard_occupancy IS 'Ocupação padrão da categoria';
COMMENT ON COLUMN public.room_categories.accommodation_quantity IS 'Quantidade de unidades/acomodações desta categoria';
COMMENT ON COLUMN public.room_categories.courtesy_limit IS 'Limite de crianças cortesia permitidas';
COMMENT ON COLUMN public.room_categories.rich_description IS 'Descrição rica em HTML para exibição no motor de reservas';

-- Inicializar valores padrão para campos existentes
UPDATE public.room_categories 
SET 
  standard_occupancy = capacity_adults,
  maximum_occupancy = capacity_adults,
  minimum_occupancy = 1,
  accommodation_quantity = (
    SELECT COUNT(*) 
    FROM public.rooms 
    WHERE rooms.category_id = room_categories.id
  )
WHERE standard_occupancy IS NULL OR maximum_occupancy IS NULL;

-- Criar constraint para privacidade
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_category_privacy'
  ) THEN
    ALTER TABLE public.room_categories 
      ADD CONSTRAINT valid_category_privacy 
      CHECK (privacy IN ('Quarto Privado', 'Quarto Compartilhado', 'Dormitório', 'Outro'));
  END IF;
END $$;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_room_categories_building_id ON public.room_categories(building_id);
CREATE INDEX IF NOT EXISTS idx_room_categories_day_use ON public.room_categories(day_use);
CREATE INDEX IF NOT EXISTS idx_room_categories_privacy ON public.room_categories(privacy);

