-- Migration 1: Adicionar novo valor ao ENUM email_event_type
-- IMPORTANTE: Esta migration deve ser executada primeiro
-- O PostgreSQL requer que novos valores de ENUM sejam commitados antes de serem usados

-- Verificar se o valor já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'reservation.cancelled' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'reservation.cancelled';
  END IF;
END $$;

