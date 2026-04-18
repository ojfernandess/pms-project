-- Garantir que todos os valores do enum reservation_status existam
-- Esta migração verifica e adiciona valores que possam estar faltando

-- Verificar e adicionar 'checkedin' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'checkedin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'checkedin' AFTER 'confirmed';
  END IF;
END $$;

-- Verificar e adicionar 'checkedout' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'checkedout' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'checkedout' AFTER 'checkedin';
  END IF;
END $$;

-- Verificar e adicionar 'cancelled' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'cancelled' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'cancelled' AFTER 'checkedout';
  END IF;
END $$;

-- Verificar e adicionar 'noshow' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'noshow' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'noshow' AFTER 'cancelled';
  END IF;
END $$;

-- Verificar e adicionar 'blocked' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'blocked' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'blocked' AFTER 'noshow';
  END IF;
END $$;

-- Verificar e adicionar 'preregistration' se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'preregistration' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'preregistration' AFTER 'blocked';
  END IF;
END $$;

-- Atualizar comentário
COMMENT ON TYPE reservation_status IS 'Status das reservas: pending, confirmed, checkedin, checkedout, cancelled, noshow, blocked, preregistration';

