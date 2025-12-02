-- Tabela principal de Web Check-in
CREATE TABLE IF NOT EXISTS public.web_checkin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  locator TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'rejected')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  guest_data JSONB,
  documents JSONB DEFAULT '[]'::jsonb,
  preferences JSONB,
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de documentos do Web Check-in
CREATE TABLE IF NOT EXISTS public.web_checkin_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  web_checkin_id UUID NOT NULL REFERENCES public.web_checkin(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('rg', 'cnh', 'passport', 'cpf')),
  document_number TEXT NOT NULL,
  document_front_url TEXT,
  document_back_url TEXT,
  selfie_url TEXT,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de hóspedes do Web Check-in
CREATE TABLE IF NOT EXISTS public.web_checkin_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  web_checkin_id UUID NOT NULL REFERENCES public.web_checkin(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  is_main_guest BOOLEAN DEFAULT false,
  document_type TEXT CHECK (document_type IN ('rg', 'cnh', 'passport', 'cpf')),
  document_number TEXT,
  document_url TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de logs de emails
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL CHECK (email_type IN ('confirmation', 'checkin_link', 'reminder', 'invoice', 'welcome', 'feedback')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_web_checkin_reservation_id ON public.web_checkin(reservation_id);
CREATE INDEX IF NOT EXISTS idx_web_checkin_locator ON public.web_checkin(locator);
CREATE INDEX IF NOT EXISTS idx_web_checkin_token ON public.web_checkin(token);
CREATE INDEX IF NOT EXISTS idx_web_checkin_status ON public.web_checkin(status);
CREATE INDEX IF NOT EXISTS idx_web_checkin_documents_web_checkin_id ON public.web_checkin_documents(web_checkin_id);
CREATE INDEX IF NOT EXISTS idx_web_checkin_guests_web_checkin_id ON public.web_checkin_guests(web_checkin_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_reservation_id ON public.email_logs(reservation_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON public.email_logs(email_type);

-- Comentários
COMMENT ON TABLE public.web_checkin IS 'Registros de check-in online realizados pelos hóspedes';
COMMENT ON TABLE public.web_checkin_documents IS 'Documentos enviados durante o web check-in';
COMMENT ON TABLE public.web_checkin_guests IS 'Informações dos hóspedes coletadas no web check-in';
COMMENT ON TABLE public.email_logs IS 'Log de emails enviados pelo sistema';

-- RLS Policies
ALTER TABLE public.web_checkin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_checkin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_checkin_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para web_checkin (público pode ler por token/locator, autenticado pode gerenciar)
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Web check-in is viewable by token or locator" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is viewable by anyone" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is insertable by service role" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is insertable by authenticated users" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is updatable by service role" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is updatable by authenticated users" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is updatable by anyone during process" ON public.web_checkin;

-- Permitir leitura pública para web check-in (acesso via localizador)
-- IMPORTANTE: Esta política deve permitir acesso anônimo
CREATE POLICY "Web check-in is viewable by anyone"
  ON public.web_checkin FOR SELECT
  USING (true);

-- Permitir inserção apenas para usuários autenticados ou service role
CREATE POLICY "Web check-in is insertable by authenticated users"
  ON public.web_checkin FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Permitir atualização para todos (necessário para o fluxo de web check-in)
CREATE POLICY "Web check-in is updatable by anyone"
  ON public.web_checkin FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Políticas para documentos
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Web check-in documents are viewable by web check-in" ON public.web_checkin_documents;
DROP POLICY IF EXISTS "Web check-in documents are viewable by anyone" ON public.web_checkin_documents;
DROP POLICY IF EXISTS "Web check-in documents are insertable by service role" ON public.web_checkin_documents;
DROP POLICY IF EXISTS "Web check-in documents are insertable by anyone" ON public.web_checkin_documents;
DROP POLICY IF EXISTS "Web check-in documents are updatable by authenticated users" ON public.web_checkin_documents;

CREATE POLICY "Web check-in documents are viewable by anyone"
  ON public.web_checkin_documents FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Web check-in documents are insertable by anyone"
  ON public.web_checkin_documents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Web check-in documents are updatable by authenticated users"
  ON public.web_checkin_documents FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas para hóspedes
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Web check-in guests are viewable by web check-in" ON public.web_checkin_guests;
DROP POLICY IF EXISTS "Web check-in guests are viewable by anyone" ON public.web_checkin_guests;
DROP POLICY IF EXISTS "Web check-in guests are insertable by service role" ON public.web_checkin_guests;
DROP POLICY IF EXISTS "Web check-in guests are insertable by anyone" ON public.web_checkin_guests;
DROP POLICY IF EXISTS "Web check-in guests are updatable by authenticated users" ON public.web_checkin_guests;
DROP POLICY IF EXISTS "Web check-in guests are deletable by authenticated users" ON public.web_checkin_guests;

CREATE POLICY "Web check-in guests are viewable by anyone"
  ON public.web_checkin_guests FOR SELECT
  USING (true);

CREATE POLICY "Web check-in guests are insertable by anyone"
  ON public.web_checkin_guests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Web check-in guests are updatable by authenticated users"
  ON public.web_checkin_guests FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Web check-in guests are deletable by authenticated users"
  ON public.web_checkin_guests FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para email logs (apenas autenticados)
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Email logs are viewable by authenticated users" ON public.email_logs;
DROP POLICY IF EXISTS "Email logs are insertable by service role" ON public.email_logs;
DROP POLICY IF EXISTS "Email logs are insertable by authenticated users" ON public.email_logs;

CREATE POLICY "Email logs are viewable by authenticated users"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Email logs are insertable by authenticated users"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

