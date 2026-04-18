-- Tabela de Prédios
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  zip_code TEXT,
  reception_email TEXT,
  booking_engine_link TEXT,
  amplifique_token TEXT,
  allow_owner_blocking BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adicionar building_id à tabela room_categories
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

-- RLS Policies para buildings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'buildings' 
    AND policyname = 'Allow authenticated users to read buildings'
  ) THEN
    CREATE POLICY "Allow authenticated users to read buildings"
      ON public.buildings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'buildings' 
    AND policyname = 'Allow authenticated users to manage buildings'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage buildings"
      ON public.buildings FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_buildings_updated_at ON public.buildings;
CREATE TRIGGER update_buildings_updated_at
  BEFORE UPDATE ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índice
CREATE INDEX IF NOT EXISTS idx_room_categories_building_id ON public.room_categories(building_id);

