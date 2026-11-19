-- GRANTs para anon na página pública de reservas (clients/quotes). RLS em 20251219000002.
GRANT SELECT, INSERT ON TABLE public.clients TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quotes TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.reservation_service_fees TO anon, authenticated, service_role;