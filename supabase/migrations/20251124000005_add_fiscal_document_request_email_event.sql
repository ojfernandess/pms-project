-- Migration 1: Adicionar novo tipo de evento para solicitação de documento fiscal
-- Esta migration apenas adiciona o valor ao enum, sem usar o valor na mesma transação

-- Adicionar novo valor ao enum (se ainda não existir)
DO $$
BEGIN
  -- Verificar se o valor já existe antes de adicionar
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'fiscal_document.request' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'fiscal_document.request';
  END IF;
END $$;

-- Comentário atualizado
COMMENT ON TYPE email_event_type IS 'Tipos de eventos de e-mail do sistema. Inclui: reservation.created, reservation.imported, reservation.cancelled, payment.confirmed, payment.pending, checkin.confirmed, checkout.completed, reservation.extended, reservation.overbooking, guest.password_reset, fiscal_document.request';
