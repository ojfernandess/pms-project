-- Permite selecionar OTAs parceiras para pagamento automático
-- e escolher portador específico para pagamentos vindos de channel.

ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS auto_payment_ota_channels TEXT[] DEFAULT '{}'::text[];

ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS auto_payment_channel_carrier_id UUID REFERENCES public.payment_carriers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hotel_settings.auto_payment_ota_channels IS
  'Lista de parceiros OTA permitidos para pagamento automático (ex.: booking.com, airbnb). Vazio = todos.';

COMMENT ON COLUMN public.hotel_settings.auto_payment_channel_carrier_id IS
  'Portador padrão para pagamentos automáticos de reservas vindas de channel manager.';
