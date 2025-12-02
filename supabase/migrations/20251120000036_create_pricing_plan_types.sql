-- Criar tabela para tipos de planos tarifários
CREATE TABLE IF NOT EXISTS public.pricing_plan_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantir que todas as colunas existam (caso a tabela já exista)
ALTER TABLE public.pricing_plan_types
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Garantir constraint UNIQUE no nome
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'pricing_plan_types_name_key'
  ) THEN
    ALTER TABLE public.pricing_plan_types
      ADD CONSTRAINT pricing_plan_types_name_key UNIQUE (name);
  END IF;
END $$;

-- Inserir tipos padrão
INSERT INTO public.pricing_plan_types (name, description, sort_order, color) VALUES
  ('Standard', 'Plano tarifário padrão', 1, '#3b82f6'),
  ('Promotional', 'Plano promocional com descontos', 2, '#10b981'),
  ('Package', 'Plano de pacote com serviços inclusos', 3, '#8b5cf6'),
  ('Corporate', 'Plano corporativo com condições especiais', 4, '#6366f1'),
  ('Group', 'Plano para grupos e eventos', 5, '#f59e0b')
ON CONFLICT (name) DO NOTHING;

-- Remover CHECK constraint da coluna plan_type na tabela pricing_plans
ALTER TABLE public.pricing_plans
  DROP CONSTRAINT IF EXISTS pricing_plans_plan_type_check;

-- Alterar plan_type para TEXT (sem constraint, mas validaremos via aplicação)
-- A coluna já é TEXT, então não precisa alterar o tipo

-- Enable Row Level Security
ALTER TABLE public.pricing_plan_types ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes se houver
DROP POLICY IF EXISTS "Allow authenticated users to read pricing plan types" ON public.pricing_plan_types;
DROP POLICY IF EXISTS "Allow authenticated users to manage pricing plan types" ON public.pricing_plan_types;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read pricing plan types"
  ON public.pricing_plan_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage pricing plan types"
  ON public.pricing_plan_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS update_pricing_plan_types_updated_at ON public.pricing_plan_types;

-- Trigger para updated_at
CREATE TRIGGER update_pricing_plan_types_updated_at
  BEFORE UPDATE ON public.pricing_plan_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX IF NOT EXISTS idx_pricing_plan_types_name ON public.pricing_plan_types(name);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_types_active ON public.pricing_plan_types(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_types_sort_order ON public.pricing_plan_types(sort_order);

-- Comentários
COMMENT ON TABLE public.pricing_plan_types IS 'Tipos de planos tarifários (Standard, Promotional, Group, etc)';
COMMENT ON COLUMN public.pricing_plan_types.name IS 'Nome do tipo (deve ser único)';
COMMENT ON COLUMN public.pricing_plan_types.color IS 'Cor para exibição no UI (hex)';

