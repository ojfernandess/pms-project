-- Endpoint GET opcional para sincronização manual de reservas (pull) — path fornecido pela Aiosell por propriedade.
ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS aiosell_bookings_list_path TEXT;

COMMENT ON COLUMN public.ota_channels.aiosell_bookings_list_path IS
  'Path relativo à aiosell_base_url para GET de reservas (Basic Auth). Ex.: /api/v2/cm/... — confirmar com suporte Aiosell. Usado pela Edge Function aiosell-reservations-sync com pull=true.';
