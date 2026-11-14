-- =====================================================
-- SISTEMA ARI (RATE & AVAILABILITY GRID) - ESTRUTURA COMPLETA
-- =====================================================
-- Reestruturação do sistema tarifário para modelo ARI completo
-- Compatível com Channel Managers e OTAs

-- 1. Tabela de Inventário por Categoria e Data
-- Controla quantos quartos estão disponíveis para venda
CREATE TABLE IF NOT EXISTS public.rate_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  total_rooms INTEGER NOT NULL DEFAULT 0, -- Total de quartos físicos da categoria
  available_rooms INTEGER NOT NULL DEFAULT 0, -- Quartos disponíveis para venda
  confirmed_reservations INTEGER NOT NULL DEFAULT 0, -- Reservas confirmadas (check-in realizado)
  blocked_rooms INTEGER NOT NULL DEFAULT 0, -- Quartos bloqueados (manutenção, etc)
  overbooking_allowed INTEGER DEFAULT 0, -- Overbooking permitido
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_rate_inventory_entry UNIQUE (establishment_id, category_id, date),
  CONSTRAINT valid_available_rooms CHECK (available_rooms >= 0),
  CONSTRAINT valid_total_rooms CHECK (total_rooms >= 0),
  CONSTRAINT valid_confirmed_reservations CHECK (confirmed_reservations >= 0),
  CONSTRAINT valid_blocked_rooms CHECK (blocked_rooms >= 0)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rate_inventory_establishment ON public.rate_inventory(establishment_id);
CREATE INDEX IF NOT EXISTS idx_rate_inventory_category ON public.rate_inventory(category_id);
CREATE INDEX IF NOT EXISTS idx_rate_inventory_date ON public.rate_inventory(date);
CREATE INDEX IF NOT EXISTS idx_rate_inventory_composite ON public.rate_inventory(establishment_id, category_id, date);

-- 2. Tabela de Status de Venda por Categoria e Data
-- Controla se a categoria está aberta, fechada, sem preço, etc.
CREATE TABLE IF NOT EXISTS public.rate_sales_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.room_categories(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'no_price', 'restricted_ota', 'restricted_booking_engine', 'restricted_all')),
  reason TEXT, -- Motivo do fechamento/restrição
  closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_rate_sales_status_entry UNIQUE (establishment_id, category_id, date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rate_sales_status_establishment ON public.rate_sales_status(establishment_id);
CREATE INDEX IF NOT EXISTS idx_rate_sales_status_category ON public.rate_sales_status(category_id);
CREATE INDEX IF NOT EXISTS idx_rate_sales_status_date ON public.rate_sales_status(date);
CREATE INDEX IF NOT EXISTS idx_rate_sales_status_status ON public.rate_sales_status(status);
CREATE INDEX IF NOT EXISTS idx_rate_sales_status_composite ON public.rate_sales_status(establishment_id, category_id, date);

-- 3. Expandir rate_calendar para incluir status e restrições por plano
-- Adicionar campos de status e restrições específicas por plano
ALTER TABLE public.rate_calendar
  ADD COLUMN IF NOT EXISTS sales_status TEXT DEFAULT 'open' CHECK (sales_status IN ('open', 'closed', 'no_price')),
  ADD COLUMN IF NOT EXISTS min_stay INTEGER,
  ADD COLUMN IF NOT EXISTS max_stay INTEGER,
  ADD COLUMN IF NOT EXISTS closed_to_arrival BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_to_departure BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_sell_ota BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_sell_booking_engine BOOLEAN DEFAULT false;

-- Índices para novos campos
CREATE INDEX IF NOT EXISTS idx_rate_calendar_sales_status ON public.rate_calendar(sales_status);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_stop_sell ON public.rate_calendar(stop_sell_ota, stop_sell_booking_engine);

-- 4. Habilitar RLS
ALTER TABLE public.rate_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_sales_status ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies para rate_inventory
DROP POLICY IF EXISTS "Allow authenticated users to read rate inventory" ON public.rate_inventory;
CREATE POLICY "Allow authenticated users to read rate inventory"
  ON public.rate_inventory FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage rate inventory" ON public.rate_inventory;
CREATE POLICY "Allow authenticated users to manage rate inventory"
  ON public.rate_inventory FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permitir acesso público para leitura (motor de reservas)
DROP POLICY IF EXISTS "Public can read rate inventory" ON public.rate_inventory;
CREATE POLICY "Public can read rate inventory"
  ON public.rate_inventory FOR SELECT
  TO anon, authenticated
  USING (true);

-- 6. RLS Policies para rate_sales_status
DROP POLICY IF EXISTS "Allow authenticated users to read rate sales status" ON public.rate_sales_status;
CREATE POLICY "Allow authenticated users to read rate sales status"
  ON public.rate_sales_status FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage rate sales status" ON public.rate_sales_status;
CREATE POLICY "Allow authenticated users to manage rate sales status"
  ON public.rate_sales_status FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permitir acesso público para leitura (motor de reservas)
DROP POLICY IF EXISTS "Public can read rate sales status" ON public.rate_sales_status;
CREATE POLICY "Public can read rate sales status"
  ON public.rate_sales_status FOR SELECT
  TO anon, authenticated
  USING (true);

-- 7. Criar função para updated_at se não existir
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

-- 8. Triggers para updated_at
DROP TRIGGER IF EXISTS update_rate_inventory_updated_at ON public.rate_inventory;
CREATE TRIGGER update_rate_inventory_updated_at
  BEFORE UPDATE ON public.rate_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_sales_status_updated_at ON public.rate_sales_status;
CREATE TRIGGER update_rate_sales_status_updated_at
  BEFORE UPDATE ON public.rate_sales_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Função para calcular disponibilidade automática baseada em reservas
CREATE OR REPLACE FUNCTION public.calculate_category_availability(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE
) RETURNS JSONB AS $$
DECLARE
  v_total_rooms INTEGER;
  v_confirmed_reservations INTEGER;
  v_blocked_rooms INTEGER;
  v_available_rooms INTEGER;
  v_occupancy_percentage DECIMAL(5,2);
BEGIN
  -- Buscar total de quartos da categoria
  SELECT COUNT(*) INTO v_total_rooms
  FROM public.rooms
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND is_blocked = false; -- Excluir quartos permanentemente bloqueados

  -- Buscar reservas confirmadas/check-in para esta data
  -- Lógica: checkin_date <= date < checkout_date
  SELECT COUNT(DISTINCT room_id) INTO v_confirmed_reservations
  FROM public.reservations
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND checkin_date <= p_date
    AND checkout_date > p_date
    AND status IN ('confirmed', 'checkedin', 'blocked', 'preregistration')
    AND room_id IS NOT NULL;

  -- Buscar quartos bloqueados (manutenção, etc) para esta data
  SELECT COUNT(*) INTO v_blocked_rooms
  FROM public.rooms
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND (status = 'maintenance' OR is_blocked = true);

  -- Calcular disponibilidade
  v_available_rooms := GREATEST(0, v_total_rooms - v_confirmed_reservations - v_blocked_rooms);

  -- Calcular ocupação
  IF v_total_rooms > 0 THEN
    v_occupancy_percentage := (v_confirmed_reservations::DECIMAL / v_total_rooms::DECIMAL) * 100;
  ELSE
    v_occupancy_percentage := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_rooms', v_total_rooms,
    'available_rooms', v_available_rooms,
    'confirmed_reservations', v_confirmed_reservations,
    'blocked_rooms', v_blocked_rooms,
    'occupancy_percentage', ROUND(v_occupancy_percentage, 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Função para sincronizar inventário com reservas (atualização automática)
CREATE OR REPLACE FUNCTION public.sync_rate_inventory_from_reservations(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE
) RETURNS JSONB AS $$
DECLARE
  v_availability JSONB;
  v_inventory_id UUID;
BEGIN
  -- Calcular disponibilidade
  v_availability := public.calculate_category_availability(
    p_establishment_id,
    p_category_id,
    p_date
  );

  -- Buscar ou criar entrada de inventário
  SELECT id INTO v_inventory_id
  FROM public.rate_inventory
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND date = p_date;

  IF v_inventory_id IS NOT NULL THEN
    -- Atualizar existente
    UPDATE public.rate_inventory
    SET
      total_rooms = (v_availability->>'total_rooms')::INTEGER,
      available_rooms = (v_availability->>'available_rooms')::INTEGER,
      confirmed_reservations = (v_availability->>'confirmed_reservations')::INTEGER,
      blocked_rooms = (v_availability->>'blocked_rooms')::INTEGER,
      updated_at = NOW()
    WHERE id = v_inventory_id;
  ELSE
    -- Criar nova entrada
    INSERT INTO public.rate_inventory (
      establishment_id,
      category_id,
      date,
      total_rooms,
      available_rooms,
      confirmed_reservations,
      blocked_rooms
    ) VALUES (
      p_establishment_id,
      p_category_id,
      p_date,
      (v_availability->>'total_rooms')::INTEGER,
      (v_availability->>'available_rooms')::INTEGER,
      (v_availability->>'confirmed_reservations')::INTEGER,
      (v_availability->>'blocked_rooms')::INTEGER
    )
    RETURNING id INTO v_inventory_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'inventory_id', v_inventory_id,
    'availability', v_availability
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Função para verificar se uma data está disponível para venda
CREATE OR REPLACE FUNCTION public.is_date_available_for_sale(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE,
  p_channel TEXT DEFAULT 'booking_engine' -- 'booking_engine', 'ota', 'all'
) RETURNS BOOLEAN AS $$
DECLARE
  v_sales_status TEXT;
  v_inventory_available INTEGER;
  v_status_closed BOOLEAN := false;
BEGIN
  -- Verificar status de venda da categoria
  SELECT status INTO v_sales_status
  FROM public.rate_sales_status
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND date = p_date;

  -- Se não houver status específico, considerar 'open'
  IF v_sales_status IS NULL THEN
    v_sales_status := 'open';
  END IF;

  -- Verificar se está fechado para o canal específico
  CASE v_sales_status
    WHEN 'closed' THEN
      v_status_closed := true;
    WHEN 'restricted_ota' THEN
      IF p_channel = 'ota' THEN
        v_status_closed := true;
      END IF;
    WHEN 'restricted_booking_engine' THEN
      IF p_channel = 'booking_engine' THEN
        v_status_closed := true;
      END IF;
    WHEN 'restricted_all' THEN
      v_status_closed := true;
    WHEN 'no_price' THEN
      -- Sem preço não impede venda, mas pode ser tratado diferente no frontend
      v_status_closed := false;
    ELSE
      v_status_closed := false;
  END CASE;

  IF v_status_closed THEN
    RETURN false;
  END IF;

  -- Verificar inventário
  SELECT available_rooms INTO v_inventory_available
  FROM public.rate_inventory
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND date = p_date;

  -- Se não houver entrada de inventário, calcular automaticamente
  IF v_inventory_available IS NULL THEN
    SELECT (calculate_category_availability(p_establishment_id, p_category_id, p_date)->>'available_rooms')::INTEGER
    INTO v_inventory_available;
  END IF;

  -- Retornar true se houver quartos disponíveis
  RETURN COALESCE(v_inventory_available, 0) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Comentários
COMMENT ON TABLE public.rate_inventory IS 'Inventário de quartos por categoria e data para controle ARI';
COMMENT ON TABLE public.rate_sales_status IS 'Status de venda (open/closed) por categoria e data';
COMMENT ON FUNCTION public.calculate_category_availability IS 'Calcula disponibilidade automática baseada em reservas e quartos bloqueados';
COMMENT ON FUNCTION public.sync_rate_inventory_from_reservations IS 'Sincroniza inventário com reservas atuais (atualização automática)';
COMMENT ON FUNCTION public.is_date_available_for_sale IS 'Verifica se uma data está disponível para venda considerando status e inventário';

GRANT EXECUTE ON FUNCTION public.calculate_category_availability(UUID, UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_rate_inventory_from_reservations(UUID, UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_date_available_for_sale(UUID, UUID, DATE) TO authenticated, service_role;

