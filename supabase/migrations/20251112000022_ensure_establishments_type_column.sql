-- Garantir que a coluna type exista na tabela establishments
-- Primeiro adicionar como nullable
ALTER TABLE public.establishments 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'hotel';

-- Atualizar registros existentes que possam ter NULL
UPDATE public.establishments 
  SET type = 'hotel' 
  WHERE type IS NULL;

-- Agora tornar NOT NULL
ALTER TABLE public.establishments 
  ALTER COLUMN type SET NOT NULL;

-- Adicionar constraint de validação se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_establishment_type'
  ) THEN
    ALTER TABLE public.establishments 
      ADD CONSTRAINT valid_establishment_type 
      CHECK (type IN ('hotel', 'apartment', 'other'));
  END IF;
END $$;

-- Comentário explicativo
COMMENT ON COLUMN public.establishments.type IS 'Tipo de estabelecimento: hotel, apartment ou other';

