-- Tabela para solicitações de documentos fiscais (Nota Fiscal e Recibo)
CREATE TABLE IF NOT EXISTS public.fiscal_document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'receipt')),
  request_type TEXT NOT NULL CHECK (request_type IN ('individual', 'company')),
  guest_name TEXT NOT NULL,
  checkin_date DATE NOT NULL,
  checkout_date DATE NOT NULL,
  paid_amount DECIMAL(10, 2) NOT NULL,
  company_name TEXT, -- Nome da empresa (se request_type = 'company')
  cnpj TEXT, -- CNPJ (se request_type = 'company')
  financial_responsible_email TEXT, -- E-mail do responsável financeiro para envio de NF
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  receipt_pdf_url TEXT, -- URL do PDF do recibo gerado (se document_type = 'receipt')
  notes TEXT, -- Observações adicionais
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ -- Data de conclusão
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fiscal_document_requests_reservation_id ON public.fiscal_document_requests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_document_requests_establishment_id ON public.fiscal_document_requests(establishment_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_document_requests_status ON public.fiscal_document_requests(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_document_requests_created_at ON public.fiscal_document_requests(created_at);

-- Enable Row Level Security
ALTER TABLE public.fiscal_document_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fiscal_document_requests' 
    AND policyname = 'Allow authenticated users to read fiscal document requests'
  ) THEN
    CREATE POLICY "Allow authenticated users to read fiscal document requests"
      ON public.fiscal_document_requests FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fiscal_document_requests' 
    AND policyname = 'Allow authenticated users to insert fiscal document requests'
  ) THEN
    CREATE POLICY "Allow authenticated users to insert fiscal document requests"
      ON public.fiscal_document_requests FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fiscal_document_requests' 
    AND policyname = 'Allow authenticated users to update fiscal document requests'
  ) THEN
    CREATE POLICY "Allow authenticated users to update fiscal document requests"
      ON public.fiscal_document_requests FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Permitir acesso público para hóspedes (via web check-in e guest dashboard)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fiscal_document_requests' 
    AND policyname = 'Allow public to insert fiscal document requests'
  ) THEN
    CREATE POLICY "Allow public to insert fiscal document requests"
      ON public.fiscal_document_requests FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fiscal_document_requests' 
    AND policyname = 'Allow public to read own fiscal document requests'
  ) THEN
    CREATE POLICY "Allow public to read own fiscal document requests"
      ON public.fiscal_document_requests FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_fiscal_document_requests_updated_at ON public.fiscal_document_requests;
CREATE TRIGGER update_fiscal_document_requests_updated_at
  BEFORE UPDATE ON public.fiscal_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.fiscal_document_requests IS 'Solicitações de documentos fiscais (Nota Fiscal e Recibo) feitas por hóspedes';
COMMENT ON COLUMN public.fiscal_document_requests.document_type IS 'Tipo de documento: invoice (Nota Fiscal) ou receipt (Recibo)';
COMMENT ON COLUMN public.fiscal_document_requests.request_type IS 'Tipo de solicitação: individual (Pessoa Física) ou company (Pessoa Jurídica)';
COMMENT ON COLUMN public.fiscal_document_requests.status IS 'Status da solicitação: pending, processing, completed, cancelled';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_document_requests TO authenticated, service_role;

