-- ============================================
-- REMOVER CONSTRAINT QUE LIMITA A APENAS UM REGISTRO
-- ============================================
-- Esta migration remove a constraint idx_hotel_settings_single que está impedindo
-- que múltiplos estabelecimentos tenham suas próprias configurações.
-- A constraint hotel_settings_establishment_id_unique já garante que cada
-- estabelecimento tenha apenas uma configuração, que é o comportamento desejado.

-- Remover constraint única problemática se existir
DO $$
BEGIN
  -- Tentar remover como constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'idx_hotel_settings_single'
  ) THEN
    ALTER TABLE public.hotel_settings 
      DROP CONSTRAINT IF EXISTS idx_hotel_settings_single;
    RAISE NOTICE 'Constraint idx_hotel_settings_single removida com sucesso.';
  END IF;
  
  -- Tentar remover como índice único
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_hotel_settings_single'
    AND tablename = 'hotel_settings'
  ) THEN
    DROP INDEX IF EXISTS public.idx_hotel_settings_single;
    RAISE NOTICE 'Índice único idx_hotel_settings_single removido com sucesso.';
  END IF;
  
  -- Verificar se há outras constraints que limitam a apenas um registro
  -- (sem filtro de establishment_id)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.hotel_settings'::regclass
    AND contype = 'u'
    AND conname != 'hotel_settings_establishment_id_unique'
    AND conname != 'hotel_settings_pkey'
  ) THEN
    RAISE NOTICE 'Outras constraints únicas encontradas na tabela hotel_settings. Verifique manualmente.';
  END IF;
END $$;

-- Garantir que a constraint correta existe (uma por estabelecimento)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'hotel_settings_establishment_id_unique'
  ) THEN
    -- Criar constraint única por establishment_id se não existir
    ALTER TABLE public.hotel_settings 
      ADD CONSTRAINT hotel_settings_establishment_id_unique 
      UNIQUE (establishment_id);
    RAISE NOTICE 'Constraint hotel_settings_establishment_id_unique criada.';
  END IF;
END $$;

-- Comentário explicativo
COMMENT ON CONSTRAINT hotel_settings_establishment_id_unique ON public.hotel_settings IS 
'Garante que cada estabelecimento tenha apenas uma configuração. Permite múltiplos estabelecimentos com suas próprias configurações.';

