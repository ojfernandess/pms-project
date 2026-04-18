-- Tabela de OTAs configuradas
CREATE TABLE IF NOT EXISTS public.ota_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- Booking.com, Airbnb, Expedia, etc.
  api_key TEXT,
  api_secret TEXT,
  is_active BOOLEAN DEFAULT true,
  sync_enabled BOOLEAN DEFAULT false,
  commission_rate DECIMAL(5,2) DEFAULT 0.0, -- taxa de comissão em porcentagem
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle', -- 'idle', 'syncing', 'success', 'error'
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mapeamento de reservas OTA
CREATE TABLE IF NOT EXISTS public.ota_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  ota_reservation_code TEXT NOT NULL, -- código da reserva na OTA
  ota_guest_name TEXT,
  ota_guest_email TEXT,
  synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'error'
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ota_channel_id, ota_reservation_code)
);

-- Configurações de tarifa por canal
CREATE TABLE IF NOT EXISTS public.channel_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE CASCADE,
  price_multiplier DECIMAL(5,2) DEFAULT 1.0, -- multiplicador do preço base
  fixed_price DECIMAL(10,2), -- preço fixo (tem prioridade sobre multiplier)
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_channel_pricing_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_channel_multiplier CHECK (price_multiplier > 0)
);

-- Enable Row Level Security
ALTER TABLE public.ota_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read ota channels"
  ON public.ota_channels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage ota channels"
  ON public.ota_channels FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read ota reservations"
  ON public.ota_reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage ota reservations"
  ON public.ota_reservations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read channel pricing"
  ON public.channel_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage channel pricing"
  ON public.channel_pricing FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_ota_channels_updated_at
  BEFORE UPDATE ON public.ota_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ota_reservations_updated_at
  BEFORE UPDATE ON public.ota_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_channel_pricing_updated_at
  BEFORE UPDATE ON public.channel_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ota_reservations_reservation_id ON public.ota_reservations(reservation_id);
CREATE INDEX IF NOT EXISTS idx_ota_reservations_channel_id ON public.ota_reservations(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_pricing_channel_id ON public.channel_pricing(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_pricing_category_id ON public.channel_pricing(category_id);

