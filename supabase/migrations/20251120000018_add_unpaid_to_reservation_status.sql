-- Adicionar status 'unpaid' ao enum reservation_status
-- Este status é usado para reservas sem pagamento

-- Adicionar o novo valor ao enum
DO $$ 
BEGIN
    -- Verificar se o valor já existe antes de adicionar
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'unpaid' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reservation_status')
    ) THEN
        ALTER TYPE reservation_status ADD VALUE 'unpaid' AFTER 'pending';
    END IF;
END $$;

-- Atualizar comentário do tipo
COMMENT ON TYPE reservation_status IS 'Status das reservas: pending, unpaid, confirmed, checkedin, checkedout, cancelled, noshow, blocked, preregistration';

