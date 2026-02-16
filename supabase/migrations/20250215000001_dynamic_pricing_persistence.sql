-- =====================================================
-- MOTOR PERSISTENTE DE PRECIFICAÇÃO DINÂMICA
-- =====================================================
-- Armazena resultados calculados, fila de processamento e
-- integração com Channel Manager/OTAs.

-- 1. Tabela: dynamic_pricing_results
-- Preços finais calculados por regras dinâmicas (persistidos)
CREATE TABLE IF NOT EXISTS public.dynamic_pricing_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.room_categories(id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  dynamic_adjustment_percent DECIMAL(5,2) DEFAULT 0,
  final_price DECIMAL(10,2) NOT NULL,
  rule_id_applied UUID REFERENCES public.dynamic_pricing_rules(id) ON DELETE SET NULL,
  occupancy_snapshot JSONB, -- { occupancy_pct, rooms_sold, total_rooms }
  pickup_snapshot JSONB,   -- { pickup_rate, bookings_last_7d }
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status_channel_manager TEXT DEFAULT 'pending' CHECK (sync_status_channel_manager IN ('pending', 'synced', 'failed', 'not_configured')),
  sync_status_otas TEXT DEFAULT 'pending' CHECK (sync_status_otas IN ('pending', 'synced', 'failed', 'not_configured')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dynamic_pricing_result UNIQUE (establishment_id, category_id, rate_plan_id, date)
);

CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_results_est ON public.dynamic_pricing_results(establishment_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_results_date ON public.dynamic_pricing_results(date);
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_results_est_date_plan ON public.dynamic_pricing_results(establishment_id, date, rate_plan_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_results_sync ON public.dynamic_pricing_results(sync_status_channel_manager) WHERE sync_status_channel_manager = 'pending';

ALTER TABLE public.dynamic_pricing_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dynamic_pricing_results_select" ON public.dynamic_pricing_results
  FOR SELECT USING (true);

CREATE POLICY "dynamic_pricing_results_insert" ON public.dynamic_pricing_results
  FOR INSERT WITH CHECK (true);

CREATE POLICY "dynamic_pricing_results_update" ON public.dynamic_pricing_results
  FOR UPDATE USING (true);

CREATE POLICY "dynamic_pricing_results_delete" ON public.dynamic_pricing_results
  FOR DELETE USING (true);

COMMENT ON TABLE public.dynamic_pricing_results IS 'Preços finais calculados por regras dinâmicas. Motor persistente - não recalcula ao abrir tela.';

-- 2. Tabela: dynamic_pricing_queue
-- Fila de processamento assíncrono - apenas quando há mudança real
CREATE TABLE IF NOT EXISTS public.dynamic_pricing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'reservation_created', 'reservation_cancelled', 'no_show',
    'inventory_changed', 'rule_changed', 'date_range_changed',
    'pickup_changed', 'manual_recalc', 'cron'
  )),
  trigger_metadata JSONB, -- { reservation_id, rule_id, date_from, date_to, etc }
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  date_from DATE,
  date_to DATE,
  category_ids UUID[],
  plan_ids UUID[],
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_queue_est ON public.dynamic_pricing_queue(establishment_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_queue_status ON public.dynamic_pricing_queue(status);
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_queue_created ON public.dynamic_pricing_queue(created_at);

ALTER TABLE public.dynamic_pricing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dynamic_pricing_queue_select" ON public.dynamic_pricing_queue FOR SELECT USING (true);
CREATE POLICY "dynamic_pricing_queue_insert" ON public.dynamic_pricing_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "dynamic_pricing_queue_update" ON public.dynamic_pricing_queue FOR UPDATE USING (true);

COMMENT ON TABLE public.dynamic_pricing_queue IS 'Fila de processamento. Regras só recalculam quando há trigger (reserva, cancelamento, etc).';

-- 3. Garantir persist_dynamic_rates em rate_system_settings
-- (já usado pelo recalc-rates; documentar padrão)
COMMENT ON COLUMN public.hotel_settings.rate_system_settings IS 'Configurações do sistema tarifário: auto_apply_dynamic_rules, persist_dynamic_rates (gravar preços dinâmicos no banco), etc.';
