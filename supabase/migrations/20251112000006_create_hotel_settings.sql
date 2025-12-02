-- Tabela de Configurações do Hotel
CREATE TABLE IF NOT EXISTS public.hotel_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  website TEXT,
  email TEXT,
  hotel_type TEXT DEFAULT 'hotel', -- 'hotel', 'apartment', 'other'
  phone_ddi TEXT, -- DDI do telefone (ex: +55)
  phone_number TEXT,
  whatsapp_ddi TEXT,
  whatsapp_number TEXT,
  description TEXT,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  zip_code TEXT,
  logo_url TEXT,
  photo_url TEXT,
  checkin_time TIME DEFAULT '14:00:00',
  checkout_time TIME DEFAULT '12:00:00',
  auto_payment_ota BOOLEAN DEFAULT false,
  auto_payment_carrier_id UUID REFERENCES public.payment_carriers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_hotel_type CHECK (hotel_type IN ('hotel', 'apartment', 'other'))
);

-- Garantir que só existe uma configuração (usando função única)
-- Nota: Esta é uma abordagem simples. Para produção, considere usar uma constraint ou trigger mais robusta

-- Enable Row Level Security
ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'hotel_settings' 
    AND policyname = 'Allow authenticated users to read hotel settings'
  ) THEN
    CREATE POLICY "Allow authenticated users to read hotel settings"
      ON public.hotel_settings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'hotel_settings' 
    AND policyname = 'Allow authenticated users to manage hotel settings'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage hotel settings"
      ON public.hotel_settings FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_hotel_settings_updated_at ON public.hotel_settings;
CREATE TRIGGER update_hotel_settings_updated_at
  BEFORE UPDATE ON public.hotel_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de Configurações de API/Integração
CREATE TABLE IF NOT EXISTS public.api_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_name TEXT NOT NULL UNIQUE, -- 'booking_engine', 'amplifique', 'other'
  api_key TEXT,
  api_secret TEXT,
  api_url TEXT,
  is_active BOOLEAN DEFAULT true,
  config JSONB, -- Configurações adicionais em JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.api_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies para api_settings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'api_settings' 
    AND policyname = 'Allow authenticated users to read api settings'
  ) THEN
    CREATE POLICY "Allow authenticated users to read api settings"
      ON public.api_settings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'api_settings' 
    AND policyname = 'Allow authenticated users to manage api settings'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage api settings"
      ON public.api_settings FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_api_settings_updated_at ON public.api_settings;
CREATE TRIGGER update_api_settings_updated_at
  BEFORE UPDATE ON public.api_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

