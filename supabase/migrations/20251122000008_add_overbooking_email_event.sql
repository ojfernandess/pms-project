-- Migration: Adicionar evento de e-mail para overbooking
-- Este evento será disparado quando um overbooking for detectado

-- Adicionar 'reservation.overbooking' ao tipo email_event_type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'reservation.overbooking' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'reservation.overbooking';
  END IF;
END $$;

