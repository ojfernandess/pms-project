-- Adicionar tipo de notificação 'overbooking' ao ENUM

-- Adicionar 'overbooking' ao tipo notification_type se não existir
DO $$ 
BEGIN
    -- Verificar se o valor já existe
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'overbooking' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
    ) THEN
        ALTER TYPE notification_type ADD VALUE 'overbooking';
    END IF;
END $$;

-- Comentário
COMMENT ON TYPE notification_type IS 'Tipos de notificação: new_reservation, pending_payment, pending_service_fee, maintenance_ticket, reservation_cancelled, checkin_today, checkout_today, overbooking, other';

