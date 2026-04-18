-- Adicionar modo de visualização "1 card por categoria" (largura total)
-- by_category_single: grid 1 coluna - um card por categoria em largura total
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.companies'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%by_plan%'
  LIMIT 1;
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.companies DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_booking_engine_rooms_view_mode_check
  CHECK (booking_engine_rooms_view_mode IN ('by_category', 'by_plan', 'by_category_single'));

COMMENT ON COLUMN public.companies.booking_engine_rooms_view_mode IS 
  'Modo de visualização dos quartos no motor de reservas: by_category (grid 2x2), by_plan (2 cards por categoria) ou by_category_single (1 card por categoria, largura total)';
