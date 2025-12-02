-- Adicionar constraint UNIQUE em establishment_id para garantir uma configuração por estabelecimento
-- Primeiro, remover duplicatas se houver
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Contar duplicatas
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT establishment_id, COUNT(*) as cnt
    FROM public.hotel_settings
    WHERE establishment_id IS NOT NULL
    GROUP BY establishment_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- Se houver duplicatas, manter apenas a mais recente
  IF duplicate_count > 0 THEN
    DELETE FROM public.hotel_settings
    WHERE id NOT IN (
      SELECT DISTINCT ON (establishment_id) id
      FROM public.hotel_settings
      WHERE establishment_id IS NOT NULL
      ORDER BY establishment_id, created_at DESC
    )
    AND establishment_id IS NOT NULL;
  END IF;
END $$;

-- Adicionar constraint UNIQUE se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'hotel_settings_establishment_id_unique'
  ) THEN
    ALTER TABLE public.hotel_settings 
      ADD CONSTRAINT hotel_settings_establishment_id_unique 
      UNIQUE (establishment_id);
  END IF;
END $$;

-- Comentário explicativo
COMMENT ON CONSTRAINT hotel_settings_establishment_id_unique ON public.hotel_settings IS 'Garante que cada estabelecimento tenha apenas uma configuração';

