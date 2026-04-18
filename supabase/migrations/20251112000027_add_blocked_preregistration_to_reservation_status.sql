-- Adicionar valores 'blocked' e 'preregistration' ao enum reservation_status

-- Adicionar 'blocked' ao enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'blocked' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'blocked';
  END IF;
END $$;

-- Adicionar 'preregistration' ao enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'preregistration' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'preregistration';
  END IF;
END $$;

-- Comentário explicativo
COMMENT ON TYPE reservation_status IS 'Status das reservas: pending, confirmed, checkedin, checkedout, cancelled, noshow, blocked, preregistration';

