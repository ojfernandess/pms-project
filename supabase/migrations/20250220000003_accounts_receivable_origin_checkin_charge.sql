-- Permitir origin 'checkin_charge' em accounts_receivable (cobrança de check-in)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.accounts_receivable'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%origin%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.accounts_receivable DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_origin_check
  CHECK (origin IN (
    'reservation', 'prepayment', 'penalty', 'cancellation_penalty',
    'no_show_penalty', 'extra_consumption', 'service_fee', 'checkin_charge', 'other'
  ));
