-- ============================================
-- TABELA DE ORÇAMENTOS (QUOTES)
-- ============================================

-- Criar enum para status de orçamento
CREATE TYPE quote_status AS ENUM ('pending', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- Criar tabela de orçamentos
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_code TEXT NOT NULL UNIQUE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  guest_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  checkin_date DATE NOT NULL,
  checkout_date DATE NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL,
  channel TEXT DEFAULT 'direct',
  status quote_status NOT NULL DEFAULT 'pending',
  payment_link TEXT,
  payment_intent_id TEXT,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  expiration_date TIMESTAMPTZ,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_quote_dates CHECK (checkout_date > checkin_date),
  CONSTRAINT valid_quote_amount CHECK (total_amount >= 0)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_quotes_establishment_id ON public.quotes(establishment_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_guest_id ON public.quotes(guest_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_payment_intent_id ON public.quotes(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_quotes_reservation_id ON public.quotes(reservation_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_checkin_checkout ON public.quotes(checkin_date, checkout_date);

-- Função para gerar código de orçamento único
CREATE OR REPLACE FUNCTION public.generate_quote_code()
RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'QUO' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
    
    SELECT EXISTS(SELECT 1 FROM public.quotes WHERE quote_code = new_code) INTO code_exists;
    
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Trigger para gerar código automaticamente
CREATE OR REPLACE FUNCTION public.set_quote_code()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_code IS NULL OR NEW.quote_code = '' THEN
    NEW.quote_code := generate_quote_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_quote_code
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quote_code();

-- Trigger para atualizar updated_at
CREATE TRIGGER trigger_update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (serão ajustadas conforme necessário)
CREATE POLICY "Users can view quotes from their establishments"
  ON public.quotes
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can create quotes for their establishments"
  ON public.quotes
  FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can update quotes from their establishments"
  ON public.quotes
  FOR UPDATE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can delete quotes from their establishments"
  ON public.quotes
  FOR DELETE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Comentários para documentação
COMMENT ON TABLE public.quotes IS 'Tabela de orçamentos e solicitações de reservas';
COMMENT ON COLUMN public.quotes.quote_code IS 'Código único do orçamento (ex: QUO123456)';
COMMENT ON COLUMN public.quotes.status IS 'Status do orçamento: pending, sent, accepted, rejected, expired, converted';
COMMENT ON COLUMN public.quotes.payment_link IS 'Link de pagamento gerado para o orçamento';
COMMENT ON COLUMN public.quotes.payment_intent_id IS 'ID do Payment Intent do Stripe associado ao orçamento';
COMMENT ON COLUMN public.quotes.reservation_id IS 'ID da reserva criada quando o orçamento é convertido';
COMMENT ON COLUMN public.quotes.expiration_date IS 'Data de expiração do orçamento';

