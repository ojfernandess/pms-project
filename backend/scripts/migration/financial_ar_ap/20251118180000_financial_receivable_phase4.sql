-- Fase 4: Contas a receber — devedor, categorias, parcelas e origem manual.

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS debtor_type TEXT NOT NULL DEFAULT 'guest';

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS debtor_name TEXT;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS debtor_document TEXT;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS financial_category TEXT;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS document_number TEXT;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS expected_payment_method TEXT;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS total_installments INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS parent_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_receivable_debtor_type_check') THEN
    ALTER TABLE public.accounts_receivable
      ADD CONSTRAINT accounts_receivable_debtor_type_check
      CHECK (debtor_type IN ('guest', 'company', 'other'));
  END IF;
END $$;

ALTER TABLE public.accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_origin_check;

ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_origin_check
  CHECK (origin IN (
    'reservation', 'prepayment', 'penalty', 'cancellation_penalty', 'no_show_penalty',
    'extra_consumption', 'service_fee', 'checkin_charge', 'manual', 'other'
  ));

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_debtor_type
  ON public.accounts_receivable(establishment_id, debtor_type);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_parent
  ON public.accounts_receivable(parent_receivable_id)
  WHERE parent_receivable_id IS NOT NULL;

UPDATE public.accounts_receivable ar
SET
  debtor_name = COALESCE(
    ar.debtor_name,
    NULLIF(trim(split_part(ar.description, ' - ', 2)), ''),
    ar.description
  ),
  issue_date = COALESCE(ar.issue_date, ar.created_at::date),
  debtor_type = COALESCE(ar.debtor_type, 'guest')
WHERE ar.debtor_name IS NULL OR ar.issue_date IS NULL;

CREATE OR REPLACE FUNCTION sync_accounts_receivable_for_reservation(p_res public.reservations)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_gross NUMERIC(12, 2);
  v_paid NUMERIC(12, 2);
  v_balance NUMERIC(12, 2);
  v_existing_id UUID;
  v_guest_name TEXT;
  v_bill_name TEXT;
  v_bill_document TEXT;
  v_debtor_type TEXT;
  v_bill_client UUID;
  v_status TEXT;
  v_due DATE;
  v_eps CONSTANT NUMERIC := 0.02;
BEGIN
  IF is_parking_mirror_reservation(p_res) THEN
    RETURN;
  END IF;

  IF p_res.status = 'cancelled' THEN
    UPDATE public.accounts_receivable
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE reservation_id = p_res.id
      AND origin = 'reservation'
      AND status <> 'cancelled';
    RETURN;
  END IF;

  IF p_res.status NOT IN ('confirmed', 'checkedin', 'checkedout', 'pending', 'unpaid') THEN
    RETURN;
  END IF;

  v_gross := COALESCE(reservation_gross_amount(p_res.id), 0);
  v_paid := COALESCE(p_res.paid_amount, 0);
  v_balance := GREATEST(0, ROUND(v_gross - v_paid, 2));
  v_due := COALESCE(p_res.checkin_date, CURRENT_DATE);
  v_bill_client := COALESCE(p_res.client_id, p_res.guest_id);

  v_debtor_type := CASE
    WHEN p_res.client_id IS NOT NULL AND p_res.client_id IS DISTINCT FROM p_res.guest_id THEN 'company'
    ELSE 'guest'
  END;

  SELECT full_name INTO v_guest_name
  FROM public.clients
  WHERE id = COALESCE(p_res.guest_id, p_res.client_id)
  LIMIT 1;

  SELECT full_name, document_number INTO v_bill_name, v_bill_document
  FROM public.clients
  WHERE id = v_bill_client
  LIMIT 1;

  SELECT id INTO v_existing_id
  FROM public.accounts_receivable
  WHERE reservation_id = p_res.id
    AND origin = 'reservation'
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_gross <= v_eps THEN
    RETURN;
  END IF;

  IF v_balance <= v_eps AND v_existing_id IS NULL THEN
    RETURN;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.accounts_receivable
    SET amount = v_gross,
        due_date = v_due,
        client_id = v_bill_client,
        debtor_type = v_debtor_type,
        debtor_name = COALESCE(v_bill_name, v_guest_name, p_res.guest_name, 'Hóspede'),
        debtor_document = v_bill_document,
        description = COALESCE(
          'Reserva ' || p_res.reservation_code || ' - ' || COALESCE(v_guest_name, p_res.guest_name, 'Hóspede'),
          description
        ),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'reservation_code', p_res.reservation_code,
          'checkin_date', p_res.checkin_date,
          'checkout_date', p_res.checkout_date,
          'channel', p_res.channel,
          'gross_amount', v_gross,
          'reservation_paid', v_paid
        ),
        updated_at = NOW()
    WHERE id = v_existing_id;

    PERFORM recalculate_accounts_receivable_paid(v_existing_id);
    RETURN;
  END IF;

  IF v_balance <= v_eps THEN
    RETURN;
  END IF;

  IF v_paid > v_eps THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;
  IF v_due < CURRENT_DATE THEN
    v_status := 'overdue';
  END IF;

  INSERT INTO public.accounts_receivable (
    establishment_id,
    reservation_id,
    client_id,
    debtor_type,
    debtor_name,
    debtor_document,
    description,
    amount,
    paid_amount,
    due_date,
    issue_date,
    origin,
    type,
    status,
    metadata,
    created_by
  ) VALUES (
    p_res.establishment_id,
    p_res.id,
    v_bill_client,
    v_debtor_type,
    COALESCE(v_bill_name, v_guest_name, p_res.guest_name, 'Hóspede'),
    v_bill_document,
    COALESCE(
      'Reserva ' || p_res.reservation_code || ' - ' || COALESCE(v_guest_name, p_res.guest_name, 'Hóspede'),
      'Reserva ' || p_res.reservation_code
    ),
    v_gross,
    LEAST(v_paid, v_gross),
    v_due,
    CURRENT_DATE,
    'reservation',
    'reservation',
    v_status,
    jsonb_build_object(
      'reservation_code', p_res.reservation_code,
      'checkin_date', p_res.checkin_date,
      'checkout_date', p_res.checkout_date,
      'channel', p_res.channel,
      'gross_amount', v_gross,
      'reservation_paid', v_paid
    ),
    p_res.created_by
  );
END;
$$;

COMMENT ON COLUMN public.accounts_receivable.debtor_type IS 'guest, company (faturado) ou other (manual).';