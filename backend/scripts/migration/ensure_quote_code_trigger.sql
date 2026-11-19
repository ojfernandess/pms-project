-- Garante geração de quote_code em INSERT (alguns ambientes criaram quotes sem o trigger Supabase).

CREATE OR REPLACE FUNCTION public.generate_quote_code()
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
    new_code := 'QUO' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');

    SELECT EXISTS(SELECT 1 FROM public.quotes WHERE quote_code = new_code) INTO code_exists;

    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quote_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_code IS NULL OR NEW.quote_code = '' THEN
    NEW.quote_code := public.generate_quote_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_quote_code ON public.quotes;
CREATE TRIGGER trigger_set_quote_code
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quote_code();