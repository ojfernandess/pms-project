-- Tabela para armazenar limites de empresas e estabelecimentos por usuário
CREATE TABLE IF NOT EXISTS public.user_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  max_companies INTEGER DEFAULT 1, -- Quantidade máxima de empresas que o usuário pode criar
  max_establishments INTEGER DEFAULT 1, -- Quantidade máxima de estabelecimentos que o usuário pode criar por empresa
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_limits_user_id ON public.user_limits(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_limits' 
    AND policyname = 'Allow authenticated users to read user limits'
  ) THEN
    CREATE POLICY "Allow authenticated users to read user limits"
      ON public.user_limits FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_limits' 
    AND policyname = 'Allow authenticated users to manage user limits'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage user limits"
      ON public.user_limits FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_user_limits_updated_at ON public.user_limits;
CREATE TRIGGER update_user_limits_updated_at
  BEFORE UPDATE ON public.user_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

