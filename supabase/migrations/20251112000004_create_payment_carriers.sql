-- Tabela de Portadores de Pagamento
CREATE TABLE IF NOT EXISTS public.payment_carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  agency TEXT,
  account TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Tipos de Pagamento por Portador
CREATE TABLE IF NOT EXISTS public.payment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_id UUID NOT NULL REFERENCES public.payment_carriers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Nome do tipo de pagamento
  payment_method TEXT NOT NULL, -- 'deposit', 'pix', 'credit_card', 'debit_card'
  card_brand TEXT, -- 'visa', 'mastercard', 'elo', 'amex', 'hipercard', etc. (apenas para cartões)
  card_fee DECIMAL(5,2) DEFAULT 0.0, -- taxa do cartão em porcentagem
  installments_2_6_fee DECIMAL(5,2) DEFAULT 0.0, -- taxa para parcelas de 2 a 6x
  installments_7_12_fee DECIMAL(5,2) DEFAULT 0.0, -- taxa para parcelas de 7 a 12x
  payment_days INTEGER DEFAULT 0, -- dias para pagamento (ex: 0 = à vista, 30 = 30 dias)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_payment_method CHECK (payment_method IN ('deposit', 'pix', 'credit_card', 'debit_card')),
  CONSTRAINT valid_card_brand CHECK (
    (payment_method IN ('credit_card', 'debit_card') AND card_brand IS NOT NULL) OR
    (payment_method NOT IN ('credit_card', 'debit_card'))
  )
);

-- Adicionar carrier_id e payment_type_id à tabela payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES public.payment_carriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_type_id UUID REFERENCES public.payment_types(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.payment_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies para payment_carriers
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'payment_carriers' 
    AND policyname = 'Allow authenticated users to read payment carriers'
  ) THEN
    CREATE POLICY "Allow authenticated users to read payment carriers"
      ON public.payment_carriers FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'payment_carriers' 
    AND policyname = 'Allow authenticated users to manage payment carriers'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage payment carriers"
      ON public.payment_carriers FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- RLS Policies para payment_types
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'payment_types' 
    AND policyname = 'Allow authenticated users to read payment types'
  ) THEN
    CREATE POLICY "Allow authenticated users to read payment types"
      ON public.payment_types FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'payment_types' 
    AND policyname = 'Allow authenticated users to manage payment types'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage payment types"
      ON public.payment_types FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_payment_carriers_updated_at ON public.payment_carriers;
CREATE TRIGGER update_payment_carriers_updated_at
  BEFORE UPDATE ON public.payment_carriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_types_updated_at ON public.payment_types;
CREATE TRIGGER update_payment_types_updated_at
  BEFORE UPDATE ON public.payment_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX IF NOT EXISTS idx_payment_types_carrier_id ON public.payment_types(carrier_id);
CREATE INDEX IF NOT EXISTS idx_payments_carrier_id ON public.payments(carrier_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type_id ON public.payments(payment_type_id);

-- Adicionar campo name se não existir (para tabelas já criadas)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payment_types' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.payment_types ADD COLUMN name TEXT;
    -- Atualizar registros existentes com um nome padrão baseado no método
    UPDATE public.payment_types 
    SET name = CASE 
      WHEN payment_method = 'deposit' THEN 'Depósito'
      WHEN payment_method = 'pix' THEN 'PIX'
      WHEN payment_method = 'credit_card' THEN 'Cartão de Crédito ' || COALESCE(card_brand, '')
      WHEN payment_method = 'debit_card' THEN 'Cartão de Débito ' || COALESCE(card_brand, '')
      ELSE payment_method
    END
    WHERE name IS NULL;
    -- Tornar o campo obrigatório
    ALTER TABLE public.payment_types ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

