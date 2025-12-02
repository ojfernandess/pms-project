-- Adicionar campos adicionais à tabela room_categories para suportar funcionalidades completas de edição

-- Tipo de categoria
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'housing_unit';

-- Taxa de limpeza do proprietário
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS owner_cleaning_fee DECIMAL(10,2) DEFAULT 0.00;

-- Comentários
COMMENT ON COLUMN public.room_categories.type IS 'Tipo de categoria: housing_unit, apartment, house, suite';
COMMENT ON COLUMN public.room_categories.owner_cleaning_fee IS 'Taxa de limpeza do proprietário em reais';

-- Criar constraint para type
ALTER TABLE public.room_categories 
  ADD CONSTRAINT valid_category_type 
  CHECK (type IN ('housing_unit', 'apartment', 'house', 'suite'));


