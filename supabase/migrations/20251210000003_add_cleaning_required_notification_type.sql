-- Migration: Adicionar 'cleaning_required' ao tipo notification_type
-- Este tipo de notificação é usado para alertar sobre quartos que precisam de limpeza após check-out

-- Adicionar 'cleaning_required' ao tipo notification_type se não existir
DO $$ 
BEGIN
    -- Verificar se o valor já existe
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'cleaning_required' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
    ) THEN
        ALTER TYPE notification_type ADD VALUE 'cleaning_required';
    END IF;
END $$;

-- Comentário
COMMENT ON TYPE notification_type IS 'Tipos de notificação: new_reservation, pending_payment, pending_service_fee, maintenance_ticket, reservation_cancelled, checkin_today, checkout_today, overbooking, cleaning_required, other';

