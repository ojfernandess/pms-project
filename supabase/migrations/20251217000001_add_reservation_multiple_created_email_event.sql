-- Adicionar novo valor ao ENUM email_event_type para envio de email de múltiplas reservas criadas
-- IMPORTANTE: Esta migration deve ser executada primeiro
-- O PostgreSQL requer que novos valores de ENUM sejam commitados antes de serem usados

-- Verificar se o valor já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'reservation.multiple.created' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'reservation.multiple.created';
  END IF;
END $$;

-- Comentário atualizado
COMMENT ON TYPE email_event_type IS 'Tipos de eventos de e-mail do sistema. Inclui: reservation.created, reservation.imported, reservation.cancelled, payment.confirmed, payment.pending, checkin.confirmed, checkout.completed, reservation.extended, reservation.overbooking, guest.password_reset, fiscal_document.request, employee.added_to_establishment, checkout.reminder, checkin.reception.notification, preregistration.expired, reservation.modified, quote.payment_link, reservation.multiple.created';

