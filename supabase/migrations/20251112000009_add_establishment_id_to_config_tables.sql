-- Adicionar establishment_id às tabelas de configuração

-- Pricing Plans
ALTER TABLE public.pricing_plans 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- OTA Channels
ALTER TABLE public.ota_channels 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- API Settings
ALTER TABLE public.api_settings 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- Payment Carriers
ALTER TABLE public.payment_carriers 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- Adicionar índices
CREATE INDEX IF NOT EXISTS idx_pricing_plans_establishment_id ON public.pricing_plans(establishment_id);
CREATE INDEX IF NOT EXISTS idx_ota_channels_establishment_id ON public.ota_channels(establishment_id);
CREATE INDEX IF NOT EXISTS idx_api_settings_establishment_id ON public.api_settings(establishment_id);
CREATE INDEX IF NOT EXISTS idx_payment_carriers_establishment_id ON public.payment_carriers(establishment_id);

