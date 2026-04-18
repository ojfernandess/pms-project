-- ============================================
-- Cobrança de Check-in: tipo de template e templates por ação
-- Permite templates por tipo: lembrete check-in, pagamento pendente, lembrete checkout
-- ============================================

-- Tipo do template (para Chatwoot/Evolution: escolher template por tipo de mensagem)
ALTER TABLE public.checkin_charge_templates
  ADD COLUMN IF NOT EXISTS template_type TEXT DEFAULT 'custom'
    CHECK (template_type IN ('checkin_reminder', 'payment_pending', 'checkout_reminder', 'custom'));

COMMENT ON COLUMN public.checkin_charge_templates.template_type IS 'Tipo: checkin_reminder, payment_pending, checkout_reminder, custom';

-- Config: template por ação (quando origem = internal/Evolution)
ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_id_reminder UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_id_payment UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_id_checkout UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.checkin_charge_config.template_id_reminder IS 'Template para lembrete de check-in (quando origem internal)';
COMMENT ON COLUMN public.checkin_charge_config.template_id_payment IS 'Template para pagamento pendente (quando origem internal)';
COMMENT ON COLUMN public.checkin_charge_config.template_id_checkout IS 'Template para lembrete de checkout (quando origem internal)';
