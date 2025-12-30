-- Migration: Sistema de Avaliações da Estadia
-- Cria tabelas para avaliações de estadia e configurações por estabelecimento

-- Criar ENUM para tipo de avaliação
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_type') THEN
    CREATE TYPE review_type AS ENUM ('stars', 'numeric', 'emoji');
  END IF;
END $$;

-- Criar tabela de configurações de avaliação por estabelecimento
CREATE TABLE IF NOT EXISTS public.establishment_review_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID NOT NULL UNIQUE REFERENCES public.establishments(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  review_type review_type NOT NULL DEFAULT 'stars',
  send_email_after_checkout BOOLEAN NOT NULL DEFAULT true,
  email_delay_hours INTEGER NOT NULL DEFAULT 24, -- Horas após checkout para enviar email
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela de avaliações
CREATE TABLE IF NOT EXISTS public.stay_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  guest_account_id UUID REFERENCES public.guest_accounts(id) ON DELETE SET NULL,
  
  -- Avaliações por categoria (valores dependem do review_type)
  room_rating NUMERIC(3,1), -- Para stars: 1-5, para numeric: 1-10, para emoji: 1-5
  comfort_rating NUMERIC(3,1),
  service_rating NUMERIC(3,1),
  cleanliness_rating NUMERIC(3,1),
  
  -- Comentário livre
  comment TEXT,
  
  -- Status
  is_published BOOLEAN NOT NULL DEFAULT true,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadados
  review_type review_type NOT NULL DEFAULT 'stars',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Garantir uma avaliação por reserva
  CONSTRAINT stay_reviews_reservation_id_unique UNIQUE (reservation_id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_stay_reviews_reservation_id ON public.stay_reviews(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stay_reviews_establishment_id ON public.stay_reviews(establishment_id);
CREATE INDEX IF NOT EXISTS idx_stay_reviews_guest_account_id ON public.stay_reviews(guest_account_id);
CREATE INDEX IF NOT EXISTS idx_stay_reviews_submitted_at ON public.stay_reviews(submitted_at);
CREATE INDEX IF NOT EXISTS idx_stay_reviews_is_published ON public.stay_reviews(is_published);

-- Criar trigger para atualizar updated_at
CREATE TRIGGER update_establishment_review_settings_updated_at
  BEFORE UPDATE ON public.establishment_review_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stay_reviews_updated_at
  BEFORE UPDATE ON public.stay_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.establishment_review_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_reviews ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para establishment_review_settings

-- Usuários autenticados podem ver configurações do seu estabelecimento
DROP POLICY IF EXISTS "Authenticated users can view review settings" ON public.establishment_review_settings;
CREATE POLICY "Authenticated users can view review settings"
  ON public.establishment_review_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND e.establishment_id = establishment_review_settings.establishment_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_companies uc
      INNER JOIN public.establishments est ON est.company_id = uc.company_id
      WHERE uc.user_id = auth.uid()
      AND est.id = establishment_review_settings.establishment_id
    )
  );

-- Super admins podem ver todas as configurações
DROP POLICY IF EXISTS "Super admins can view all review settings" ON public.establishment_review_settings;
CREATE POLICY "Super admins can view all review settings"
  ON public.establishment_review_settings FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid()) = true
  );

-- Gerentes podem atualizar configurações do seu estabelecimento
DROP POLICY IF EXISTS "Managers can update review settings" ON public.establishment_review_settings;
CREATE POLICY "Managers can update review settings"
  ON public.establishment_review_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      INNER JOIN public.employee_roles r ON r.id = e.role_id
      WHERE e.user_id = auth.uid()
      AND e.establishment_id = establishment_review_settings.establishment_id
      AND r.code = 'manager'
    )
  );

-- Super admins podem inserir e atualizar todas as configurações
DROP POLICY IF EXISTS "Super admins can manage all review settings" ON public.establishment_review_settings;
CREATE POLICY "Super admins can manage all review settings"
  ON public.establishment_review_settings FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid()) = true
  );

-- Políticas RLS para stay_reviews

-- Usuários autenticados podem ver avaliações do seu estabelecimento
DROP POLICY IF EXISTS "Authenticated users can view reviews" ON public.stay_reviews;
CREATE POLICY "Authenticated users can view reviews"
  ON public.stay_reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND e.establishment_id = stay_reviews.establishment_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_companies uc
      INNER JOIN public.establishments est ON est.company_id = uc.company_id
      WHERE uc.user_id = auth.uid()
      AND est.id = stay_reviews.establishment_id
    )
  );

-- Super admins podem ver todas as avaliações
DROP POLICY IF EXISTS "Super admins can view all reviews" ON public.stay_reviews;
CREATE POLICY "Super admins can view all reviews"
  ON public.stay_reviews FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid()) = true
  );

-- Hóspedes podem ver suas próprias avaliações (via guest_accounts)
-- Nota: guest_accounts não usa auth.users, então precisamos permitir acesso público com verificação
DROP POLICY IF EXISTS "Guests can view their own reviews" ON public.stay_reviews;
CREATE POLICY "Guests can view their own reviews"
  ON public.stay_reviews FOR SELECT
  TO public
  USING (
    -- Esta política será verificada no código da aplicação
    -- usando guest_account_id armazenado no localStorage
    true
  );

-- Hóspedes podem inserir suas próprias avaliações
DROP POLICY IF EXISTS "Guests can insert their own reviews" ON public.stay_reviews;
CREATE POLICY "Guests can insert their own reviews"
  ON public.stay_reviews FOR INSERT
  TO public
  WITH CHECK (
    -- Verificação será feita no código da aplicação
    true
  );

-- Hóspedes podem atualizar suas próprias avaliações (se ainda não publicadas)
DROP POLICY IF EXISTS "Guests can update their own reviews" ON public.stay_reviews;
CREATE POLICY "Guests can update their own reviews"
  ON public.stay_reviews FOR UPDATE
  TO public
  USING (
    -- Verificação será feita no código da aplicação
    true
  );

-- Usuários autenticados podem atualizar avaliações do seu estabelecimento (para moderar)
DROP POLICY IF EXISTS "Authenticated users can update reviews" ON public.stay_reviews;
CREATE POLICY "Authenticated users can update reviews"
  ON public.stay_reviews FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      INNER JOIN public.employee_roles r ON r.id = e.role_id
      WHERE e.user_id = auth.uid()
      AND e.establishment_id = stay_reviews.establishment_id
      AND r.code IN ('manager', 'receptionist')
    )
  );

-- Comentários
COMMENT ON TABLE public.establishment_review_settings IS 'Configurações de avaliação por estabelecimento';
COMMENT ON TABLE public.stay_reviews IS 'Avaliações de estadia dos hóspedes';
COMMENT ON COLUMN public.stay_reviews.room_rating IS 'Avaliação do quarto (1-5 para stars/emoji, 1-10 para numeric)';
COMMENT ON COLUMN public.stay_reviews.comfort_rating IS 'Avaliação do conforto (1-5 para stars/emoji, 1-10 para numeric)';
COMMENT ON COLUMN public.stay_reviews.service_rating IS 'Avaliação do atendimento (1-5 para stars/emoji, 1-10 para numeric)';
COMMENT ON COLUMN public.stay_reviews.cleanliness_rating IS 'Avaliação da limpeza (1-5 para stars/emoji, 1-10 para numeric)';

