-- Adicionar coluna numeric_id à tabela establishments
-- Usar SERIAL que cria automaticamente uma sequência
ALTER TABLE public.establishments 
  ADD COLUMN IF NOT EXISTS numeric_id INTEGER;

-- Criar sequência se não existir
CREATE SEQUENCE IF NOT EXISTS establishments_numeric_id_seq;

-- Definir o valor padrão da coluna para usar a sequência
ALTER TABLE public.establishments 
  ALTER COLUMN numeric_id SET DEFAULT nextval('establishments_numeric_id_seq');

-- Atualizar registros existentes que possam ter NULL
DO $$
DECLARE
  max_id INTEGER;
  rec RECORD;
  counter INTEGER := 1;
BEGIN
  -- Encontrar o maior numeric_id existente
  SELECT COALESCE(MAX(numeric_id), 0) INTO max_id FROM public.establishments;
  
  -- Se não há IDs, começar do 1
  IF max_id = 0 THEN
    -- Atualizar todos os registros que têm NULL
    FOR rec IN SELECT id FROM public.establishments WHERE numeric_id IS NULL ORDER BY created_at
    LOOP
      UPDATE public.establishments 
      SET numeric_id = counter 
      WHERE id = rec.id;
      counter := counter + 1;
    END LOOP;
    
    -- Ajustar a sequência para o próximo valor
    IF counter > 1 THEN
      PERFORM setval('establishments_numeric_id_seq', counter - 1, true);
    ELSE
      PERFORM setval('establishments_numeric_id_seq', 1, false);
    END IF;
  ELSE
    -- Se há IDs, garantir que a sequência está no próximo valor
    PERFORM setval('establishments_numeric_id_seq', max_id, true);
    
    -- Atualizar registros que ainda têm NULL
    FOR rec IN SELECT id FROM public.establishments WHERE numeric_id IS NULL ORDER BY created_at
    LOOP
      counter := max_id + 1;
      UPDATE public.establishments 
      SET numeric_id = counter 
      WHERE id = rec.id;
      max_id := counter;
      PERFORM setval('establishments_numeric_id_seq', max_id, true);
    END LOOP;
  END IF;
END $$;

-- Tornar a coluna NOT NULL após preencher todos os valores
ALTER TABLE public.establishments 
  ALTER COLUMN numeric_id SET NOT NULL;

-- Criar índice único para numeric_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_numeric_id 
  ON public.establishments(numeric_id);

-- Comentário explicativo
COMMENT ON COLUMN public.establishments.numeric_id IS 'ID numérico único para uso em URLs';

