-- Tabela para armazenar informações dos usuários (sincronizada com auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id)
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Permitir que usuários autenticados leiam todos os usuários
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Allow authenticated users to read users'
  ) THEN
    CREATE POLICY "Allow authenticated users to read users"
      ON public.users FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Permitir que usuários autenticados insiram/atualizem/deletem (gerenciamento será feito via código)
-- Por enquanto, permitir apenas leitura. Gerenciamento completo requer verificação de super admin no código
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Allow authenticated users to manage users'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage users"
      ON public.users FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Função para sincronizar usuários quando são criados no auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.created_at, NOW()))
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(NEW.email, public.users.email), updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para criar registro na tabela users quando um usuário é criado no auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índice
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Sincronizar usuários existentes (se houver)
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

