-- Web Check-in: role anon (sem JWT PMS). RLS limita linhas; GRANTs liberam o papel na tabela.
DO $$
DECLARE
  t text;
  tables_select text[] := ARRAY[
    'reservations',
    'clients',
    'rooms',
    'room_categories',
    'buildings',
    'establishments',
    'hotel_settings',
    'payments',
    'reservation_service_fees',
    'guest_accounts',
    'ota_reservations'
  ];
  tables_rw text[] := ARRAY[
    'web_checkin',
    'web_checkin_guests',
    'web_checkin_documents',
    'guest_stay_history',
    'email_queue',
    'reservation_extensions',
    'fiscal_document_requests'
  ];
  fn record;
BEGIN
  FOREACH t IN ARRAY tables_select LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY tables_rw LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon', t);
    END IF;
  END LOOP;

  IF to_regclass('public.reservations') IS NOT NULL THEN
    GRANT UPDATE ON TABLE public.reservations TO anon;
  END IF;

  IF to_regclass('public.error_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE public.error_logs TO anon;
  END IF;

  IF to_regclass('public.guest_accounts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.guest_accounts TO anon;
  END IF;

  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('insert_email_queue', 'log_activity', 'complete_web_checkin_by_token', 'get_fnrh_settings_public')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', fn.proname, fn.args);
  END LOOP;
END
$$;