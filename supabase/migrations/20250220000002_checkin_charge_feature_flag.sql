-- Feature flag: Cobrança de Check-in (por empresa, via Super Admin)
DO $$
DECLARE
  v_current_features JSONB;
BEGIN
  SELECT features_enabled INTO v_current_features
  FROM public.site_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_current_features IS NULL THEN
    v_current_features := '{}'::jsonb;
  END IF;

  IF NOT (v_current_features ? 'checkin_charge_enabled') THEN
    v_current_features := v_current_features || '{
      "checkin_charge_enabled": {
        "enabled": false,
        "company_ids": []
      }
    }'::jsonb;
  END IF;

  UPDATE public.site_settings
  SET features_enabled = v_current_features
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;

COMMENT ON COLUMN public.site_settings.features_enabled IS
  'Controle de funcionalidades. Inclui checkin_charge_enabled (Cobrança de Check-in) com enabled e company_ids.';
