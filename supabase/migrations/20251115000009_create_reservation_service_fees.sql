-- Tabela para taxas adicionadas às reservas
CREATE TABLE IF NOT EXISTS public.reservation_service_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  service_fee_id UUID NOT NULL REFERENCES public.service_fees(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INTEGER DEFAULT 1 NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reservation_service_fees_reservation_id ON public.reservation_service_fees(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_service_fees_service_fee_id ON public.reservation_service_fees(service_fee_id);

-- Comentários
COMMENT ON TABLE public.reservation_service_fees IS 'Taxas/serviços adicionados às reservas (PDV)';
COMMENT ON COLUMN public.reservation_service_fees.amount IS 'Valor da taxa/serviço';
COMMENT ON COLUMN public.reservation_service_fees.quantity IS 'Quantidade do serviço (padrão: 1)';
COMMENT ON COLUMN public.reservation_service_fees.notes IS 'Observações sobre a taxa/serviço';

-- Enable RLS
ALTER TABLE public.reservation_service_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read reservation service fees"
  ON public.reservation_service_fees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage reservation service fees"
  ON public.reservation_service_fees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_reservation_service_fees_updated_at
  BEFORE UPDATE ON public.reservation_service_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

