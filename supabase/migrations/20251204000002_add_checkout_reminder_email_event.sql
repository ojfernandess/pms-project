-- Migration: Adicionar novo valor ao ENUM email_event_type para lembrete de check-out
-- Este evento será disparado quando o check-out estiver próximo

-- Verificar se o valor já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'checkout.reminder'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'checkout.reminder';
  END IF;
END $$;

COMMENT ON TYPE email_event_type IS 'Tipos de eventos de e-mail do sistema. Inclui: reservation.created, reservation.imported, reservation.cancelled, payment.confirmed, payment.pending, checkin.confirmed, checkout.completed, reservation.extended, reservation.overbooking, guest.password_reset, fiscal_document.request, employee.added_to_establishment, checkout.reminder';

