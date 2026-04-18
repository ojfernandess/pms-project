-- Metadados Aiosell (payload channel/segment) e contacto OTA para exibição no PMS
ALTER TABLE public.ota_reservations
  ADD COLUMN IF NOT EXISTS ota_source_channel_name TEXT,
  ADD COLUMN IF NOT EXISTS ota_segment TEXT,
  ADD COLUMN IF NOT EXISTS ota_guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS ota_cm_booking_id TEXT,
  ADD COLUMN IF NOT EXISTS ota_special_requests TEXT,
  ADD COLUMN IF NOT EXISTS ota_guest_address JSONB;

COMMENT ON COLUMN public.ota_reservations.ota_source_channel_name IS 'Nome do canal parceiro no payload Aiosell (ex.: Goingo, Booking.com).';
COMMENT ON COLUMN public.ota_reservations.ota_segment IS 'Segmento no payload Aiosell (ex.: OTA).';
COMMENT ON COLUMN public.ota_reservations.ota_guest_phone IS 'Telefone do hóspede conforme payload Aiosell.';
COMMENT ON COLUMN public.ota_reservations.ota_cm_booking_id IS 'cmBookingId / itinerário no payload Aiosell.';
COMMENT ON COLUMN public.ota_reservations.ota_special_requests IS 'Pedidos especiais (specialRequests) do payload.';
COMMENT ON COLUMN public.ota_reservations.ota_guest_address IS 'Endereço do hóspede (guest.address) em JSON.';
