-- reservation_modified: alterações de reserva vindas de channel manager (Channex, Aiosell, etc.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'reservation_modified'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'reservation_modified';
  END IF;
END $$;

COMMENT ON TYPE notification_type IS 'Tipos de notificação: new_reservation, pending_payment, pending_service_fee, maintenance_ticket, reservation_cancelled, reservation_modified, checkin_today, checkout_today, overbooking, cleaning_required, other';
