-- Tabela de Empresas
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Estabelecimentos (Hotéis, Apartamentos, etc.)
CREATE TABLE IF NOT EXISTS public.establishments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'hotel', -- 'hotel', 'apartment', 'other'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_establishment_type CHECK (type IN ('hotel', 'apartment', 'other'))
);

-- Tabela de Associação Usuário-Empresa (com limite de empresas)
CREATE TABLE IF NOT EXISTS public.user_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  max_companies INTEGER DEFAULT 1, -- Quantidade máxima de empresas que o usuário pode gerenciar
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

-- Adicionar establishment_id à tabela hotel_settings
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- Adicionar índices
CREATE INDEX IF NOT EXISTS idx_establishments_company_id ON public.establishments(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON public.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON public.user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_hotel_settings_establishment_id ON public.hotel_settings(establishment_id);

-- Enable Row Level Security
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- RLS Policies para companies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'companies' 
    AND policyname = 'Allow authenticated users to read companies'
  ) THEN
    CREATE POLICY "Allow authenticated users to read companies"
      ON public.companies FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'companies' 
    AND policyname = 'Allow authenticated users to manage companies'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage companies"
      ON public.companies FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- RLS Policies para establishments
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'establishments' 
    AND policyname = 'Allow authenticated users to read establishments'
  ) THEN
    CREATE POLICY "Allow authenticated users to read establishments"
      ON public.establishments FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'establishments' 
    AND policyname = 'Allow authenticated users to manage establishments'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage establishments"
      ON public.establishments FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- RLS Policies para user_companies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_companies' 
    AND policyname = 'Allow authenticated users to read user_companies'
  ) THEN
    CREATE POLICY "Allow authenticated users to read user_companies"
      ON public.user_companies FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_companies' 
    AND policyname = 'Allow authenticated users to manage user_companies'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage user_companies"
      ON public.user_companies FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_establishments_updated_at ON public.establishments;
CREATE TRIGGER update_establishments_updated_at
  BEFORE UPDATE ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_companies_updated_at ON public.user_companies;
CREATE TRIGGER update_user_companies_updated_at
  BEFORE UPDATE ON public.user_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
