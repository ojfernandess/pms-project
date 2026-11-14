-- Código da reserva (NOT NULL). Sem este trigger, create_reservation_with_lock falha com 23502.

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

DROP TRIGGER IF EXISTS set_reservation_code_trigger ON public.reservations;
CREATE TRIGGER set_reservation_code_trigger
  BEFORE INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reservation_code();

GRANT EXECUTE ON FUNCTION public.generate_reservation_code() TO authenticated, service_role;