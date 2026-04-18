-- Tabela para tipos de taxas/serviços (PDV)
CREATE TABLE IF NOT EXISTS public.service_fees (
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
CREATE INDEX IF NOT EXISTS idx_service_fees_establishment_id ON public.service_fees(establishment_id);
CREATE INDEX IF NOT EXISTS idx_service_fees_is_active ON public.service_fees(is_active);

-- Comentários
COMMENT ON TABLE public.service_fees IS 'Tipos de taxas/serviços que podem ser adicionados às reservas (PDV)';
COMMENT ON COLUMN public.service_fees.name IS 'Nome da taxa/serviço (ex: Taxa extra, Late Checkout, Upgrade)';
COMMENT ON COLUMN public.service_fees.description IS 'Descrição opcional da taxa/serviço';
COMMENT ON COLUMN public.service_fees.is_active IS 'Indica se a taxa está ativa e disponível para uso';

-- Enable RLS
ALTER TABLE public.service_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read service fees"
  ON public.service_fees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage service fees"
  ON public.service_fees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_service_fees_updated_at
  BEFORE UPDATE ON public.service_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

