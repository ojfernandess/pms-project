-- ============================================
-- Cobrança de Check-in: configuração, cobranças, templates e logs
-- Ativável por feature flag (Super Admin). Config por estabelecimento.
-- ============================================

-- 1) Templates de mensagem (por estabelecimento)
CREATE TABLE IF NOT EXISTS public.checkin_charge_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '["guest_name","reservation_code","checkin_date","amount","payment_link","web_checkin_link"]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(establishment_id, name)
);

COMMENT ON TABLE public.checkin_charge_templates IS 'Templates de mensagem para cobrança de check-in com variáveis dinâmicas';

-- 2) Configuração da cobrança de check-in (por estabelecimento)
CREATE TABLE IF NOT EXISTS public.checkin_charge_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_timing TEXT NOT NULL DEFAULT 'after_confirmation'
    CHECK (send_timing IN ('after_confirmation', 'days_before_checkin', 'after_ota', 'manual')),
  days_before_checkin INTEGER,
  amount_type TEXT NOT NULL DEFAULT 'total'
    CHECK (amount_type IN ('total', 'percent', 'fixed')),
  amount_value DECIMAL(10,2),
  due_date_days INTEGER NOT NULL DEFAULT 3,
  channel TEXT NOT NULL DEFAULT 'whatsapp_cloud'
    CHECK (channel IN ('whatsapp_cloud', 'chatwoot', 'evolution_api', 'webhook')),
  channel_config JSONB DEFAULT '{}'::jsonb,
  template_id UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL,
  payment_link_expires_days INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.checkin_charge_config IS 'Configuração da cobrança automática de check-in por estabelecimento';

-- 3) Cobranças de check-in (uma por reserva, pode ser reenviada)
CREATE TABLE IF NOT EXISTS public.checkin_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  payment_link_token TEXT UNIQUE,
  payment_link_expires_at TIMESTAMPTZ,
  checkin_link_locator TEXT,
  sent_at TIMESTAMPTZ,
  channel_used TEXT,
  template_id UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_checkin_charges_reservation ON public.checkin_charges(reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkin_charges_establishment ON public.checkin_charges(establishment_id);
CREATE INDEX IF NOT EXISTS idx_checkin_charges_status ON public.checkin_charges(status);
CREATE INDEX IF NOT EXISTS idx_checkin_charges_due_date ON public.checkin_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_checkin_charges_payment_token ON public.checkin_charges(payment_link_token) WHERE payment_link_token IS NOT NULL;

COMMENT ON TABLE public.checkin_charges IS 'Cobranças de check-in geradas por reserva; links seguros e status de pagamento';

-- 4) Logs de envio e eventos (auditoria)
CREATE TABLE IF NOT EXISTS public.checkin_charge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_charge_id UUID NOT NULL REFERENCES public.checkin_charges(id) ON DELETE CASCADE,
  event TEXT NOT NULL
    CHECK (event IN ('sent', 'delivered', 'failed', 'viewed', 'link_clicked', 'paid')),
  channel TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_charge_logs_charge ON public.checkin_charge_logs(checkin_charge_id);
CREATE INDEX IF NOT EXISTS idx_checkin_charge_logs_event ON public.checkin_charge_logs(event);

COMMENT ON TABLE public.checkin_charge_logs IS 'Log de envios e eventos da cobrança de check-in (entrega, visualização, clique, pagamento)';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_checkin_charge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS checkin_charge_templates_updated_at ON public.checkin_charge_templates;
CREATE TRIGGER checkin_charge_templates_updated_at
  BEFORE UPDATE ON public.checkin_charge_templates
  FOR EACH ROW EXECUTE FUNCTION update_checkin_charge_updated_at();

DROP TRIGGER IF EXISTS checkin_charge_config_updated_at ON public.checkin_charge_config;
CREATE TRIGGER checkin_charge_config_updated_at
  BEFORE UPDATE ON public.checkin_charge_config
  FOR EACH ROW EXECUTE FUNCTION update_checkin_charge_updated_at();

DROP TRIGGER IF EXISTS checkin_charges_updated_at ON public.checkin_charges;
CREATE TRIGGER checkin_charges_updated_at
  BEFORE UPDATE ON public.checkin_charges
  FOR EACH ROW EXECUTE FUNCTION update_checkin_charge_updated_at();

-- RLS
ALTER TABLE public.checkin_charge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_charge_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_charge_logs ENABLE ROW LEVEL SECURITY;

-- Políticas: usuários autenticados do estabelecimento podem gerenciar
CREATE POLICY "checkin_charge_templates_select"
  ON public.checkin_charge_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charge_templates.establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_templates_insert"
  ON public.checkin_charge_templates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_templates_update"
  ON public.checkin_charge_templates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charge_templates.establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_templates_delete"
  ON public.checkin_charge_templates FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charge_templates.establishment_id AND emp.user_id = auth.uid()
    )
  );

CREATE POLICY "checkin_charge_config_select"
  ON public.checkin_charge_config FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charge_config.establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_config_insert"
  ON public.checkin_charge_config FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_config_update"
  ON public.checkin_charge_config FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charge_config.establishment_id AND emp.user_id = auth.uid()
    )
  );

CREATE POLICY "checkin_charges_select"
  ON public.checkin_charges FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.establishments e
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE e.id = checkin_charges.establishment_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charges_insert"
  ON public.checkin_charges FOR INSERT TO authenticated, service_role
  WITH CHECK (true);
CREATE POLICY "checkin_charges_update"
  ON public.checkin_charges FOR UPDATE TO authenticated, service_role
  USING (true);

-- RPC: obter dados da cobrança por token (uso público na página de pagamento)
CREATE OR REPLACE FUNCTION public.get_checkin_charge_by_payment_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  reservation_id UUID,
  establishment_id UUID,
  amount DECIMAL(10,2),
  due_date DATE,
  status TEXT,
  guest_name TEXT,
  reservation_code TEXT,
  guest_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.reservation_id,
    cc.establishment_id,
    cc.amount,
    cc.due_date,
    cc.status,
    c.full_name,
    r.reservation_code,
    (COALESCE(cc.guest_id, r.guest_id, r.client_id))::UUID
  FROM public.checkin_charges cc
  JOIN public.reservations r ON r.id = cc.reservation_id
  LEFT JOIN public.clients c ON c.id = COALESCE(cc.guest_id, r.guest_id, r.client_id)
  WHERE cc.payment_link_token = p_token
    AND (cc.payment_link_expires_at IS NULL OR cc.payment_link_expires_at > NOW())
    AND cc.status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.get_checkin_charge_by_payment_token IS 'Retorna dados da cobrança de check-in por token seguro; usado na página de pagamento do link.';

CREATE POLICY "checkin_charge_logs_select"
  ON public.checkin_charge_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checkin_charges cc
      JOIN public.establishments e ON e.id = cc.establishment_id
      JOIN public.employees emp ON emp.establishment_id = e.id
      WHERE cc.id = checkin_charge_logs.checkin_charge_id AND emp.user_id = auth.uid()
    )
  );
CREATE POLICY "checkin_charge_logs_insert"
  ON public.checkin_charge_logs FOR INSERT TO authenticated, service_role
  WITH CHECK (true);

-- Service role pode tudo (Edge Functions)
CREATE POLICY "checkin_charge_templates_all_service"
  ON public.checkin_charge_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "checkin_charge_config_all_service"
  ON public.checkin_charge_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "checkin_charges_all_service"
  ON public.checkin_charges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "checkin_charge_logs_all_service"
  ON public.checkin_charge_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
