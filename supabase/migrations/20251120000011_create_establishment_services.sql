-- Tabela para serviços do estabelecimento (Wi-fi, Piscina, Estacionamento, etc.)
CREATE TABLE IF NOT EXISTS public.establishment_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(establishment_id, name)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_establishment_services_establishment_id ON public.establishment_services(establishment_id);
CREATE INDEX IF NOT EXISTS idx_establishment_services_is_active ON public.establishment_services(is_active);

-- Comentários
COMMENT ON TABLE public.establishment_services IS 'Serviços disponibilizados pelo estabelecimento (Wi-fi, Piscina, Estacionamento, etc.)';
COMMENT ON COLUMN public.establishment_services.name IS 'Nome do serviço (ex: Wi-fi Gratuito, Piscina, Estacionamento)';
COMMENT ON COLUMN public.establishment_services.description IS 'Descrição opcional do serviço';
COMMENT ON COLUMN public.establishment_services.is_active IS 'Indica se o serviço está ativo e disponível';

-- Enable RLS
ALTER TABLE public.establishment_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read establishment services"
  ON public.establishment_services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage establishment services"
  ON public.establishment_services FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_establishment_services_updated_at
  BEFORE UPDATE ON public.establishment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

