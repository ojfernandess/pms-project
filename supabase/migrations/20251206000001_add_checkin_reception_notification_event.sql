-- Migration: Adicionar novo valor ao ENUM email_event_type para notificação de check-in para portaria
-- Este evento será usado para enviar email para a portaria quando um hóspede completar o check-in online

DO $$
BEGIN
  -- Verificar se o valor já existe antes de adicionar
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'checkin.reception.notification' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'checkin.reception.notification';
  END IF;
END $$;

-- Atualizar comentário do tipo
COMMENT ON TYPE email_event_type IS 'Tipos de eventos de e-mail do sistema. Inclui: reservation.created, reservation.imported, reservation.cancelled, payment.confirmed, payment.pending, checkin.confirmed, checkout.completed, reservation.extended, reservation.overbooking, guest.password_reset, fiscal_document.request, employee.added_to_establishment, checkout.reminder, checkin.reception.notification';

