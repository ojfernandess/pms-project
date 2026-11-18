-- Regra: título de reserva reflete apenas saldo devido (diárias + taxas - pagamentos).
-- Reserva quitada não gera novo título; vagas de estacionamento espelho são ignoradas.

CREATE OR REPLACE FUNCTION reservation_gross_amount(p_reservation_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(r.total_amount, 0) + COALESCE((
      SELECT SUM(COALESCE(rsf.amount, 0) * COALESCE(rsf.quantity, 1))
      FROM public.reservation_service_fees rsf
      WHERE rsf.reservation_id = r.id
    ), 0)
  FROM public.reservations r
  WHERE r.id = p_reservation_id;
$$;

CREATE OR REPLACE FUNCTION is_parking_mirror_reservation(r public.reservations)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    r.lodging_reservation_id IS NOT NULL
    AND COALESCE(r.total_amount, 0) = 0
    AND COALESCE(r.channel, '') = 'parking';
$$;

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

  IF v_balance <= v_eps THEN
    IF v_existing_id IS NULL THEN
      RETURN;
    END IF;
    UPDATE public.accounts_receivable
    SET amount = v_gross,
        paid_amount = LEAST(v_paid, v_gross),
        status = 'paid',
        paid_date = COALESCE(paid_date, CURRENT_DATE),
        updated_at = NOW()
    WHERE id = v_existing_id;
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

  SELECT full_name INTO v_guest_name
  FROM public.clients
  WHERE id = COALESCE(p_res.guest_id, p_res.client_id)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.accounts_receivable
    SET amount = v_gross,
        paid_amount = LEAST(v_paid, v_gross),
        due_date = v_due,
        status = v_status,
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
          'open_balance', v_balance
        ),
        updated_at = NOW()
    WHERE id = v_existing_id;
    RETURN;
  END IF;

  INSERT INTO public.accounts_receivable (
    establishment_id,
    reservation_id,
    client_id,
    description,
    amount,
    paid_amount,
    due_date,
    origin,
    type,
    status,
    metadata,
    created_by
  ) VALUES (
    p_res.establishment_id,
    p_res.id,
    COALESCE(p_res.client_id, p_res.guest_id),
    COALESCE(
      'Reserva ' || p_res.reservation_code || ' - ' || COALESCE(v_guest_name, p_res.guest_name, 'Hóspede'),
      'Reserva ' || p_res.reservation_code
    ),
    v_gross,
    LEAST(v_paid, v_gross),
    v_due,
    'reservation',
    'reservation',
    v_status,
    jsonb_build_object(
      'reservation_code', p_res.reservation_code,
      'checkin_date', p_res.checkin_date,
      'checkout_date', p_res.checkout_date,
      'channel', p_res.channel,
      'gross_amount', v_gross,
      'open_balance', v_balance
    ),
    p_res.created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION auto_create_receivable_from_reservation()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_accounts_receivable_for_reservation(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_receivable_on_payment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = NEW.reservation_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  PERFORM sync_accounts_receivable_for_reservation(v_res);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_receivable_on_reservation_service_fee()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_res_id UUID;
  v_res public.reservations%ROWTYPE;
BEGIN
  v_res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);
  SELECT * INTO v_res FROM public.reservations WHERE id = v_res_id;
  IF FOUND THEN
    PERFORM sync_accounts_receivable_for_reservation(v_res);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_receivable_on_service_fee ON public.reservation_service_fees;
CREATE TRIGGER trigger_sync_receivable_on_service_fee
  AFTER INSERT OR UPDATE OR DELETE ON public.reservation_service_fees
  FOR EACH ROW
  EXECUTE FUNCTION sync_receivable_on_reservation_service_fee();

DROP TRIGGER IF EXISTS trigger_auto_create_receivable_on_reservation_update ON public.reservations;
CREATE TRIGGER trigger_auto_create_receivable_on_reservation_update
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  WHEN (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
    OR NEW.checkin_date IS DISTINCT FROM OLD.checkin_date
  )
  EXECUTE FUNCTION auto_create_receivable_from_reservation();

-- Reconciliação: títulos de reserva quitada sem saldo
WITH totals AS (
  SELECT
    ar.id,
    reservation_gross_amount(ar.reservation_id) AS gross,
    COALESCE(r.paid_amount, 0) AS paid
  FROM public.accounts_receivable ar
  JOIN public.reservations r ON r.id = ar.reservation_id
  WHERE ar.origin = 'reservation'
    AND ar.status NOT IN ('cancelled')
)
UPDATE public.accounts_receivable ar
SET
  amount = t.gross,
  paid_amount = LEAST(t.paid, t.gross),
  status = 'paid',
  paid_date = COALESCE(ar.paid_date, CURRENT_DATE),
  updated_at = NOW()
FROM totals t
WHERE ar.id = t.id
  AND t.gross > 0.02
  AND (t.gross - t.paid) <= 0.02
  AND ar.status IN ('pending', 'partial', 'overdue');

-- Cancelar títulos de vagas espelho
UPDATE public.accounts_receivable ar
SET status = 'cancelled', updated_at = NOW()
FROM public.reservations r
WHERE ar.reservation_id = r.id
  AND ar.origin = 'reservation'
  AND ar.status <> 'cancelled'
  AND is_parking_mirror_reservation(r);

COMMENT ON FUNCTION sync_accounts_receivable_for_reservation(public.reservations) IS
  'Sincroniza título AR da reserva: apenas saldo devido; quitada não cria título novo.';