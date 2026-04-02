-- Aiosell Channel Manager: extend channel_manager_type, ota_channels, channel_pricing

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'ota_channels'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%channel_manager_type%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.ota_channels DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ota_channels
  ADD CONSTRAINT ota_channels_channel_manager_type_check
  CHECK (channel_manager_type IS NULL OR channel_manager_type IN ('bukly', 'aiosell'));

ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS aiosell_base_url TEXT DEFAULT 'https://live.aiosell.com',
  ADD COLUMN IF NOT EXISTS aiosell_hotel_code TEXT,
  ADD COLUMN IF NOT EXISTS aiosell_inventory_path TEXT DEFAULT '/api/v2/cm/update/sample-pms',
  ADD COLUMN IF NOT EXISTS aiosell_rates_path TEXT DEFAULT '/api/v2/cm/update-rates/sample-pms',
  ADD COLUMN IF NOT EXISTS aiosell_webhook_secret TEXT;

COMMENT ON COLUMN public.ota_channels.aiosell_base_url IS 'URL base da API Aiosell (sandbox ou produção após onboarding)';
COMMENT ON COLUMN public.ota_channels.aiosell_hotel_code IS 'Código do hotel no Aiosell (ex.: SANDBOX-PMS)';
COMMENT ON COLUMN public.ota_channels.aiosell_inventory_path IS 'Path do endpoint de inventário/restrições (padrão sandbox sample-pms)';
COMMENT ON COLUMN public.ota_channels.aiosell_rates_path IS 'Path do endpoint de tarifas (padrão sandbox sample-pms)';
COMMENT ON COLUMN public.ota_channels.aiosell_webhook_secret IS 'Opcional: validação extra no webhook de reservas';

ALTER TABLE public.channel_pricing
  ADD COLUMN IF NOT EXISTS channel_room_code TEXT,
  ADD COLUMN IF NOT EXISTS channel_rate_plan_code TEXT;

COMMENT ON COLUMN public.channel_pricing.channel_room_code IS 'Código do quarto no channel manager (ex.: Aiosell roomCode)';
COMMENT ON COLUMN public.channel_pricing.channel_rate_plan_code IS 'Código do rate plan no channel manager (ex.: Aiosell rateplanCode)';
