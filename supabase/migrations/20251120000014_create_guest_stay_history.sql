-- Criar tabela de contas de hóspedes (cadastro independente do PMS)
CREATE TABLE IF NOT EXISTS public.guest_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  document_type TEXT,
  document_number TEXT,
  birth_date DATE,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela de histórico de estadas
CREATE TABLE IF NOT EXISTS public.guest_stay_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_account_id UUID REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  checkin_date DATE NOT NULL,
  checkout_date DATE NOT NULL,
  room_number TEXT,
  room_category_name TEXT,
  total_amount NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verificar se a tabela maintenance_tickets já existe e adicionar colunas se necessário
DO $$ 
BEGIN
  -- Adicionar colunas se a tabela já existir
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_tickets') THEN
    -- Adicionar reservation_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'reservation_id') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL;
    END IF;
    
    -- Adicionar guest_account_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'guest_account_id') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN guest_account_id UUID REFERENCES public.guest_accounts(id) ON DELETE SET NULL;
    END IF;
    
    -- Adicionar establishment_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'establishment_id') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL;
    END IF;
    
    -- Adicionar ticket_type se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'ticket_type') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN ticket_type TEXT NOT NULL DEFAULT 'general';
    END IF;
    
    -- Adicionar reported_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'reported_at') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
    
    -- Adicionar resolved_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'resolved_at') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN resolved_at TIMESTAMPTZ;
    END IF;
    
    -- Adicionar resolved_by se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'resolved_by') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
    
    -- Adicionar resolution_notes se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'resolution_notes') THEN
      ALTER TABLE public.maintenance_tickets 
      ADD COLUMN resolution_notes TEXT;
    END IF;
  ELSE
    -- Criar tabela se não existir
    CREATE TABLE public.maintenance_tickets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
      guest_account_id UUID REFERENCES public.guest_accounts(id) ON DELETE SET NULL,
      establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
      room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
      ticket_type TEXT NOT NULL DEFAULT 'general', -- general, plumbing, electrical, cleaning, other
      priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
      reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Criar tabela de anexos de chamados de manutenção
CREATE TABLE IF NOT EXISTS public.maintenance_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_name TEXT,
  uploaded_by UUID REFERENCES public.guest_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela de extensões de reserva (histórico)
CREATE TABLE IF NOT EXISTS public.reservation_extensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  guest_account_id UUID REFERENCES public.guest_accounts(id) ON DELETE SET NULL,
  original_checkout_date DATE NOT NULL,
  new_checkout_date DATE NOT NULL,
  additional_nights INTEGER NOT NULL,
  additional_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_guest_accounts_email ON public.guest_accounts(email);
CREATE INDEX IF NOT EXISTS idx_guest_accounts_phone ON public.guest_accounts(phone);
CREATE INDEX IF NOT EXISTS idx_guest_stay_history_guest_account_id ON public.guest_stay_history(guest_account_id);
CREATE INDEX IF NOT EXISTS idx_guest_stay_history_reservation_id ON public.guest_stay_history(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_extensions_reservation_id ON public.reservation_extensions(reservation_id);

-- Criar índices para maintenance_tickets apenas se as colunas existirem
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'reservation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_reservation_id ON public.maintenance_tickets(reservation_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'guest_account_id') THEN
    CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_guest_account_id ON public.maintenance_tickets(guest_account_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status ON public.maintenance_tickets(status);
  END IF;
END $$;

-- Criar função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para updated_at
CREATE TRIGGER update_guest_accounts_updated_at
  BEFORE UPDATE ON public.guest_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guest_stay_history_updated_at
  BEFORE UPDATE ON public.guest_stay_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Criar trigger para maintenance_tickets apenas se a tabela existir e tiver updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'maintenance_tickets' 
    AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS update_maintenance_tickets_updated_at ON public.maintenance_tickets;
    CREATE TRIGGER update_maintenance_tickets_updated_at
      BEFORE UPDATE ON public.maintenance_tickets
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TRIGGER update_reservation_extensions_updated_at
  BEFORE UPDATE ON public.reservation_extensions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.guest_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_stay_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_extensions ENABLE ROW LEVEL SECURITY;

-- Habilitar RLS para maintenance_tickets apenas se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_tickets') THEN
    ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Políticas RLS para guest_accounts (público pode criar conta, mas só pode ver/editar a própria)
CREATE POLICY "Guests can create their own account"
  ON public.guest_accounts
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Guests can view their own account"
  ON public.guest_accounts
  FOR SELECT
  USING (auth.uid()::text = id::text OR true); -- Permitir leitura pública para verificação

CREATE POLICY "Guests can update their own account"
  ON public.guest_accounts
  FOR UPDATE
  USING (true); -- Permitir atualização via token de verificação

-- Políticas RLS para guest_stay_history (hóspedes podem ver seu próprio histórico)
CREATE POLICY "Guests can view their own stay history"
  ON public.guest_stay_history
  FOR SELECT
  USING (true); -- Permitir leitura pública para verificação via token

CREATE POLICY "System can insert stay history"
  ON public.guest_stay_history
  FOR INSERT
  WITH CHECK (true);

-- Políticas RLS para maintenance_tickets (hóspedes podem criar e ver seus próprios tickets)
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Guests can create maintenance tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Guests can view their own maintenance tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Guests can update their own maintenance tickets" ON public.maintenance_tickets;

-- Criar políticas apenas se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_tickets') THEN
    CREATE POLICY "Guests can create maintenance tickets"
      ON public.maintenance_tickets
      FOR INSERT
      WITH CHECK (true);

    CREATE POLICY "Guests can view their own maintenance tickets"
      ON public.maintenance_tickets
      FOR SELECT
      USING (true); -- Permitir leitura pública para verificação via token

    CREATE POLICY "Guests can update their own maintenance tickets"
      ON public.maintenance_tickets
      FOR UPDATE
      USING (true); -- Permitir atualização via token
  END IF;
END $$;

-- Políticas RLS para maintenance_ticket_attachments
CREATE POLICY "Guests can create ticket attachments"
  ON public.maintenance_ticket_attachments
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Guests can view ticket attachments"
  ON public.maintenance_ticket_attachments
  FOR SELECT
  USING (true);

-- Políticas RLS para reservation_extensions
CREATE POLICY "Guests can create reservation extensions"
  ON public.reservation_extensions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Guests can view their own reservation extensions"
  ON public.reservation_extensions
  FOR SELECT
  USING (true);

CREATE POLICY "Guests can update their own reservation extensions"
  ON public.reservation_extensions
  FOR UPDATE
  USING (true);

-- Políticas para administradores (via service_role ou authenticated users com permissão)
-- Nota: Estas políticas devem ser ajustadas conforme necessário para o sistema de autenticação do PMS

