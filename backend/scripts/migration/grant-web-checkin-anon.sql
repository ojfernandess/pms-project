-- Web Check-in usa role anon (hóspede sem JWT PMS). RLS filtra linhas; falta GRANT DML.
DO $$
BEGIN
  IF to_regclass('public.web_checkin') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_checkin TO anon;
  END IF;
  IF to_regclass('public.web_checkin_guests') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_checkin_guests TO anon;
  END IF;
  IF to_regclass('public.web_checkin_documents') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_checkin_documents TO anon;
  END IF;
  IF to_regclass('public.guest_stay_history') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guest_stay_history TO anon;
  END IF;
  IF to_regclass('public.error_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE public.error_logs TO anon;
  END IF;
END
$$;