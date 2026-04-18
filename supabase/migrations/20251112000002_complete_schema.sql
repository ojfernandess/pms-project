-- ============================================
-- SCHEMA COMPLETO - INNVATOR CORE
-- Este arquivo cria todo o schema do banco de dados
-- Pode ser executado múltiplas vezes (idempotente)
-- ============================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- REMOVER TIPOS E TABELAS EXISTENTES (se necessário)
-- Descomente as linhas abaixo se precisar recriar tudo do zero
-- ============================================
-- DROP TABLE IF EXISTS public.channel_pricing CASCADE;
-- DROP TABLE IF EXISTS public.ota_reservations CASCADE;
-- DROP TABLE IF EXISTS public.ota_channels CASCADE;
-- DROP TABLE IF EXISTS public.promotions CASCADE;
-- DROP TABLE IF EXISTS public.pricing_rules CASCADE;
-- DROP TABLE IF EXISTS public.pricing_seasons CASCADE;
-- DROP TABLE IF EXISTS public.payments CASCADE;
-- DROP TABLE IF EXISTS public.maintenance_tickets CASCADE;
-- DROP TABLE IF EXISTS public.reservations CASCADE;
-- DROP TABLE IF EXISTS public.rooms CASCADE;
-- DROP TABLE IF EXISTS public.room_categories CASCADE;
-- DROP TABLE IF EXISTS public.clients CASCADE;
-- DROP TYPE IF EXISTS maintenance_priority CASCADE;
-- DROP TYPE IF EXISTS maintenance_status CASCADE;
-- DROP TYPE IF EXISTS payment_status CASCADE;
-- DROP TYPE IF EXISTS reservation_status CASCADE;
-- DROP TYPE IF EXISTS room_status CASCADE;

-- ============================================
-- CRIAR TIPOS ENUM
-- ============================================

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('available', 'occupied', 'cleaning', 'maintenance', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'checkedin', 'checkedout', 'cancelled', 'noshow');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- CRIAR TABELAS PRINCIPAIS
-- ============================================

-- Categories (tipos de quartos)
CREATE TABLE IF NOT EXISTS public.room_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  capacity_adults INTEGER NOT NULL DEFAULT 2,
  capacity_children INTEGER NOT NULL DEFAULT 0,
  size_sqm DECIMAL(10,2),
  bed_type TEXT,
  amenities TEXT[],
  base_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rooms (quartos individuais)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_number TEXT NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE RESTRICT,
  floor INTEGER,
  status room_status NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients (clientes/hóspedes)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document_number TEXT,
  document_type TEXT,
  birth_date DATE,
  nationality TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Brasil',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reservations (reservas)
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_code TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE RESTRICT,
  checkin_date DATE NOT NULL,
  checkout_date DATE NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  status reservation_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  channel TEXT DEFAULT 'direct',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments (pagamentos)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintenance (manutenção)
CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority maintenance_priority NOT NULL DEFAULT 'medium',
  status maintenance_status NOT NULL DEFAULT 'open',
  opened_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABELAS DE TARIFÁRIO DINÂMICO
-- ============================================

-- Temporadas/períodos
CREATE TABLE IF NOT EXISTS public.pricing_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  multiplier DECIMAL(5,2) DEFAULT 1.0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date),
  CONSTRAINT valid_multiplier CHECK (multiplier > 0)
);

-- Regras de precificação
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE,
  season_id UUID REFERENCES public.pricing_seasons(id) ON DELETE CASCADE,
  day_of_week INTEGER,
  price_override DECIMAL(10,2),
  multiplier DECIMAL(5,2),
  min_stay_nights INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  CONSTRAINT valid_min_stay CHECK (min_stay_nights IS NULL OR min_stay_nights > 0)
);

-- Promoções
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  min_stay_nights INTEGER,
  max_stay_nights INTEGER,
  applicable_categories UUID[],
  is_active BOOLEAN DEFAULT true,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_promotion_dates CHECK (end_date >= start_date),
  CONSTRAINT valid_discount_value CHECK (discount_value >= 0),
  CONSTRAINT valid_discount_percentage CHECK (
    discount_type != 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
  ),
  CONSTRAINT valid_stay_nights CHECK (
    min_stay_nights IS NULL OR max_stay_nights IS NULL OR max_stay_nights >= min_stay_nights
  )
);

-- ============================================
-- TABELAS DE CHANNEL MANAGER (OTAs)
-- ============================================

-- Canais OTA
CREATE TABLE IF NOT EXISTS public.ota_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  api_key TEXT,
  api_secret TEXT,
  is_active BOOLEAN DEFAULT true,
  sync_enabled BOOLEAN DEFAULT false,
  commission_rate DECIMAL(5,2) DEFAULT 0.0,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle',
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reservas OTA
CREATE TABLE IF NOT EXISTS public.ota_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  ota_reservation_code TEXT NOT NULL,
  ota_guest_name TEXT,
  ota_guest_email TEXT,
  synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ota_channel_id, ota_reservation_code)
);

-- Tarifas por canal
CREATE TABLE IF NOT EXISTS public.channel_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE CASCADE,
  price_multiplier DECIMAL(5,2) DEFAULT 1.0,
  fixed_price DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_channel_pricing_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_channel_multiplier CHECK (price_multiplier > 0)
);

-- ============================================
-- FUNÇÕES E TRIGGERS
-- ============================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Função para gerar código de reserva
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
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
    new_code := 'RSV' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
    SELECT EXISTS(SELECT 1 FROM public.reservations WHERE reservation_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Função para definir código de reserva automaticamente
CREATE OR REPLACE FUNCTION public.set_reservation_code()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reservation_code IS NULL OR NEW.reservation_code = '' THEN
    NEW.reservation_code := public.generate_reservation_code();
  END IF;
  RETURN NEW;
END;
$$;

-- Função para calcular preço dinâmico
CREATE OR REPLACE FUNCTION public.calculate_dynamic_price(
  p_category_id UUID,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_promotion_code TEXT DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price DECIMAL(10,2);
  v_nights INTEGER;
  v_total_price DECIMAL(10,2) := 0;
  v_date DATE;
  v_day_price DECIMAL(10,2);
  v_season_multiplier DECIMAL(5,2);
  v_rule_multiplier DECIMAL(5,2);
  v_rule_override DECIMAL(10,2);
  v_day_of_week INTEGER;
  v_promotion_discount DECIMAL(10,2) := 0;
  v_promotion_record RECORD;
BEGIN
  -- Obter preço base da categoria
  SELECT base_price INTO v_base_price
  FROM public.room_categories
  WHERE id = p_category_id;

  IF v_base_price IS NULL THEN
    RETURN 0;
  END IF;

  -- Calcular número de noites
  v_nights := p_checkout_date - p_checkin_date;

  -- Processar cada dia da estadia
  v_date := p_checkin_date;
  WHILE v_date < p_checkout_date LOOP
    v_day_price := v_base_price;
    v_season_multiplier := 1.0;
    v_rule_multiplier := 1.0;
    v_rule_override := NULL;
    v_day_of_week := EXTRACT(DOW FROM v_date);

    -- Verificar se há temporada ativa para esta data
    SELECT multiplier INTO v_season_multiplier
    FROM public.pricing_seasons
    WHERE is_active = true
      AND start_date <= v_date
      AND end_date >= v_date
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_season_multiplier IS NULL THEN
      v_season_multiplier := 1.0;
    END IF;

    -- Aplicar multiplicador da temporada
    v_day_price := v_day_price * v_season_multiplier;

    -- Verificar regras de precificação
    SELECT price_override, multiplier INTO v_rule_override, v_rule_multiplier
    FROM public.pricing_rules
    WHERE category_id = p_category_id
      AND (season_id IS NULL OR season_id IN (
        SELECT id FROM public.pricing_seasons
        WHERE is_active = true
          AND start_date <= v_date
          AND end_date >= v_date
      ))
      AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
      AND (min_stay_nights IS NULL OR min_stay_nights <= v_nights)
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- Aplicar regra (override tem prioridade sobre multiplier)
    IF v_rule_override IS NOT NULL THEN
      v_day_price := v_rule_override;
    ELSIF v_rule_multiplier IS NOT NULL THEN
      v_day_price := v_day_price * v_rule_multiplier;
    END IF;

    v_total_price := v_total_price + v_day_price;
    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  -- Aplicar promoção se fornecida
  IF p_promotion_code IS NOT NULL THEN
    SELECT * INTO v_promotion_record
    FROM public.promotions
    WHERE code = p_promotion_code
      AND is_active = true
      AND start_date <= p_checkin_date
      AND end_date >= p_checkout_date
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND (applicable_categories IS NULL OR p_category_id = ANY(applicable_categories))
      AND (min_stay_nights IS NULL OR v_nights >= min_stay_nights)
      AND (max_stay_nights IS NULL OR v_nights <= max_stay_nights);

    IF v_promotion_record IS NOT NULL THEN
      IF v_promotion_record.discount_type = 'percentage' THEN
        v_promotion_discount := v_total_price * (v_promotion_record.discount_value / 100);
      ELSE
        v_promotion_discount := LEAST(v_promotion_record.discount_value, v_total_price);
      END IF;
      v_total_price := v_total_price - v_promotion_discount;
    END IF;
  END IF;

  RETURN GREATEST(v_total_price, 0);
END;
$$;

-- ============================================
-- CRIAR TRIGGERS
-- ============================================

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_room_categories_updated_at ON public.room_categories;
CREATE TRIGGER update_room_categories_updated_at
  BEFORE UPDATE ON public.room_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rooms_updated_at ON public.rooms;
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reservations_updated_at ON public.reservations;
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_tickets_updated_at ON public.maintenance_tickets;
CREATE TRIGGER update_maintenance_tickets_updated_at
  BEFORE UPDATE ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_seasons_updated_at ON public.pricing_seasons;
CREATE TRIGGER update_pricing_seasons_updated_at
  BEFORE UPDATE ON public.pricing_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_rules_updated_at ON public.pricing_rules;
CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_promotions_updated_at ON public.promotions;
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ota_channels_updated_at ON public.ota_channels;
CREATE TRIGGER update_ota_channels_updated_at
  BEFORE UPDATE ON public.ota_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ota_reservations_updated_at ON public.ota_reservations;
CREATE TRIGGER update_ota_reservations_updated_at
  BEFORE UPDATE ON public.ota_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_channel_pricing_updated_at ON public.channel_pricing;
CREATE TRIGGER update_channel_pricing_updated_at
  BEFORE UPDATE ON public.channel_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para gerar código de reserva
DROP TRIGGER IF EXISTS set_reservation_code_trigger ON public.reservations;
CREATE TRIGGER set_reservation_code_trigger
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_reservation_code();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_pricing ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS RLS
-- ============================================

-- Remover políticas existentes (se houver)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Políticas para room_categories
CREATE POLICY "Allow authenticated users to read room categories"
  ON public.room_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage room categories"
  ON public.room_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para rooms
CREATE POLICY "Allow authenticated users to read rooms"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage rooms"
  ON public.rooms FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para clients
CREATE POLICY "Allow authenticated users to read clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para reservations
CREATE POLICY "Allow authenticated users to read reservations"
  ON public.reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage reservations"
  ON public.reservations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para payments
CREATE POLICY "Allow authenticated users to read payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage payments"
  ON public.payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para maintenance_tickets
CREATE POLICY "Allow authenticated users to read maintenance tickets"
  ON public.maintenance_tickets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage maintenance tickets"
  ON public.maintenance_tickets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para pricing_seasons
CREATE POLICY "Allow authenticated users to read pricing seasons"
  ON public.pricing_seasons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage pricing seasons"
  ON public.pricing_seasons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para pricing_rules
CREATE POLICY "Allow authenticated users to read pricing rules"
  ON public.pricing_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage pricing rules"
  ON public.pricing_rules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para promotions
CREATE POLICY "Allow authenticated users to read promotions"
  ON public.promotions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage promotions"
  ON public.promotions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para ota_channels
CREATE POLICY "Allow authenticated users to read ota channels"
  ON public.ota_channels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage ota channels"
  ON public.ota_channels FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para ota_reservations
CREATE POLICY "Allow authenticated users to read ota reservations"
  ON public.ota_reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage ota reservations"
  ON public.ota_reservations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para channel_pricing
CREATE POLICY "Allow authenticated users to read channel pricing"
  ON public.channel_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage channel pricing"
  ON public.channel_pricing FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_reservations_client_id ON public.reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON public.reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_category_id ON public.reservations(category_id);
CREATE INDEX IF NOT EXISTS idx_reservations_checkin_date ON public.reservations(checkin_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON public.rooms(category_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_room_id ON public.maintenance_tickets(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON public.maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON public.payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_ota_reservations_reservation_id ON public.ota_reservations(reservation_id);
CREATE INDEX IF NOT EXISTS idx_ota_reservations_channel_id ON public.ota_reservations(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_pricing_channel_id ON public.channel_pricing(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_pricing_category_id ON public.channel_pricing(category_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_category_id ON public.pricing_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_season_id ON public.pricing_rules(season_id);

-- ============================================
-- FIM DO SCHEMA
-- ============================================

