-- ============================================
-- Mensagens & Cobrancas: template para overbooking
-- ============================================

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
    INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'checkin_charge_templates'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%template_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.checkin_charge_templates DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.checkin_charge_templates
  ADD CONSTRAINT checkin_charge_templates_template_type_check
  CHECK (
    template_type IN (
      'checkin_reminder',
      'payment_pending',
      'checkout_reminder',
      'reservation_modified',
      'reservation_cancelled',
      'reservation_overbooking',
      'custom'
    )
  );

COMMENT ON COLUMN public.checkin_charge_templates.template_type IS
  'Tipo: checkin_reminder, payment_pending, checkout_reminder, reservation_modified, reservation_cancelled, reservation_overbooking, custom';

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_id_overbooking UUID REFERENCES public.checkin_charge_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.checkin_charge_config.template_id_overbooking IS
  'Template para aviso de overbooking (quando origem internal)';
