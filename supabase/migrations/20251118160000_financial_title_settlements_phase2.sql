-- Fase 2: quitações rastreáveis (recebimentos/pagamentos) com idempotência e auditoria.

CREATE TABLE IF NOT EXISTS public.financial_settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('receipt', 'disbursement')),
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount > 0),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_settlement_batches_idempotency_unique
    UNIQUE (establishment_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_settlement_batches_establishment
  ON public.financial_settlement_batches(establishment_id);

CREATE TABLE IF NOT EXISTS public.financial_title_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.financial_settlement_batches(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('receipt', 'disbursement')),
  accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  accounts_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  idempotency_key TEXT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  reverses_settlement_id UUID REFERENCES public.financial_title_settlements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_title_settlements_target_chk CHECK (
    (accounts_receivable_id IS NOT NULL AND accounts_payable_id IS NULL)
    OR (accounts_payable_id IS NOT NULL AND accounts_receivable_id IS NULL)
  ),
  CONSTRAINT financial_title_settlements_idempotency_unique
    UNIQUE (establishment_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_title_settlements_ar
  ON public.financial_title_settlements(accounts_receivable_id)
  WHERE accounts_receivable_id IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_title_settlements_ap
  ON public.financial_title_settlements(accounts_payable_id)
  WHERE accounts_payable_id IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_title_settlements_batch
  ON public.financial_title_settlements(batch_id);

-- Extensão de auditoria (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_audit_logs_action_type_check'
  ) THEN
    ALTER TABLE public.financial_audit_logs DROP CONSTRAINT financial_audit_logs_action_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT financial_audit_logs_action_type_check
  CHECK (action_type IN (
    'create', 'update', 'delete', 'approve', 'reject', 'reverse', 'refund',
    'settlement', 'settlement_reverse'
  ));

CREATE OR REPLACE FUNCTION financial_settlement_sum_for_receivable(p_ar_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.financial_title_settlements
  WHERE accounts_receivable_id = p_ar_id
    AND direction = 'receipt'
    AND reversed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION financial_settlement_sum_for_payable(p_ap_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.financial_title_settlements
  WHERE accounts_payable_id = p_ap_id
    AND direction = 'disbursement'
    AND reversed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION recalculate_accounts_receivable_paid(p_ar_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ar public.accounts_receivable%ROWTYPE;
  v_res_paid NUMERIC(12, 2) := 0;
  v_settlement_paid NUMERIC(12, 2);
  v_total_paid NUMERIC(12, 2);
  v_status TEXT;
BEGIN
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id = p_ar_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_ar.reservation_id IS NOT NULL THEN
    SELECT COALESCE(paid_amount, 0) INTO v_res_paid
    FROM public.reservations
    WHERE id = v_ar.reservation_id;
  END IF;

  v_settlement_paid := financial_settlement_sum_for_receivable(p_ar_id);
  v_total_paid := LEAST(v_ar.amount, GREATEST(v_res_paid, 0) + GREATEST(v_settlement_paid, 0));

  IF v_total_paid <= 0.02 THEN
    v_status := CASE WHEN v_ar.due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;
  ELSIF v_total_paid + 0.02 >= v_ar.amount THEN
    v_status := 'paid';
  ELSIF v_ar.due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.accounts_receivable
  SET paid_amount = v_total_paid,
      status = v_status,
      paid_date = CASE WHEN v_status = 'paid' THEN COALESCE(paid_date, CURRENT_DATE) ELSE paid_date END,
      updated_at = NOW()
  WHERE id = p_ar_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_accounts_payable_paid(p_ap_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ap public.accounts_payable%ROWTYPE;
  v_settlement_paid NUMERIC(12, 2);
  v_status TEXT;
BEGIN
  SELECT * INTO v_ap FROM public.accounts_payable WHERE id = p_ap_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_settlement_paid := financial_settlement_sum_for_payable(p_ap_id);

  IF v_settlement_paid <= 0.02 THEN
    v_status := CASE WHEN v_ap.due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;
  ELSIF v_settlement_paid + 0.02 >= v_ap.amount THEN
    v_status := 'paid';
  ELSIF v_ap.due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.accounts_payable
  SET paid_amount = LEAST(v_ap.amount, v_settlement_paid),
      status = v_status,
      paid_date = CASE WHEN v_status = 'paid' THEN COALESCE(paid_date, CURRENT_DATE) ELSE paid_date END,
      updated_at = NOW()
  WHERE id = p_ap_id;
END;
$$;

CREATE OR REPLACE FUNCTION write_financial_audit(
  p_establishment_id UUID,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_values JSONB,
  p_new_values JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_audit_logs (
    establishment_id,
    action_type,
    entity_type,
    entity_id,
    old_values,
    new_values,
    reason,
    user_id
  ) VALUES (
    p_establishment_id,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    p_reason,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION register_receivable_settlement(
  p_receivable_id UUID,
  p_amount NUMERIC,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ar public.accounts_receivable%ROWTYPE;
  v_existing_id UUID;
  v_settlement_id UUID;
  v_open NUMERIC(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do recebimento deve ser maior que zero';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.financial_title_settlements
    WHERE establishment_id = (SELECT establishment_id FROM public.accounts_receivable WHERE id = p_receivable_id)
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a receber não encontrada';
  END IF;

  IF v_ar.status = 'cancelled' THEN
    RAISE EXCEPTION 'Conta a receber cancelada';
  END IF;

  v_open := GREATEST(0, v_ar.amount - COALESCE(v_ar.paid_amount, 0));
  IF p_amount > v_open + 0.02 THEN
    RAISE EXCEPTION 'Valor excede o saldo em aberto do título';
  END IF;

  INSERT INTO public.financial_title_settlements (
    establishment_id,
    batch_id,
    direction,
    accounts_receivable_id,
    amount,
    effective_date,
    payment_method,
    reference,
    notes,
    idempotency_key,
    created_by
  ) VALUES (
    v_ar.establishment_id,
    p_batch_id,
    'receipt',
    p_receivable_id,
    ROUND(p_amount, 2),
    COALESCE(p_effective_date, CURRENT_DATE),
    p_payment_method,
    p_reference,
    p_notes,
    NULLIF(trim(p_idempotency_key), ''),
    auth.uid()
  )
  RETURNING id INTO v_settlement_id;

  PERFORM recalculate_accounts_receivable_paid(p_receivable_id);

  PERFORM write_financial_audit(
    v_ar.establishment_id,
    'settlement',
    'accounts_receivable',
    p_receivable_id,
    jsonb_build_object('paid_amount', v_ar.paid_amount),
  (
      SELECT to_jsonb(ar.*) FROM public.accounts_receivable ar WHERE ar.id = p_receivable_id
    ),
    format('Recebimento de %s (settlement %s)', p_amount, v_settlement_id)
  );

  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION register_payable_settlement(
  p_payable_id UUID,
  p_amount NUMERIC,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ap public.accounts_payable%ROWTYPE;
  v_existing_id UUID;
  v_settlement_id UUID;
  v_open NUMERIC(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.financial_title_settlements
    WHERE establishment_id = (SELECT establishment_id FROM public.accounts_payable WHERE id = p_payable_id)
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  SELECT * INTO v_ap FROM public.accounts_payable WHERE id = p_payable_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;

  IF v_ap.status = 'cancelled' THEN
    RAISE EXCEPTION 'Conta a pagar cancelada';
  END IF;

  v_open := GREATEST(0, v_ap.amount - COALESCE(v_ap.paid_amount, 0));
  IF p_amount > v_open + 0.02 THEN
    RAISE EXCEPTION 'Valor excede o saldo em aberto do título';
  END IF;

  INSERT INTO public.financial_title_settlements (
    establishment_id,
    batch_id,
    direction,
    accounts_payable_id,
    amount,
    effective_date,
    payment_method,
    reference,
    notes,
    idempotency_key,
    created_by
  ) VALUES (
    v_ap.establishment_id,
    p_batch_id,
    'disbursement',
    p_payable_id,
    ROUND(p_amount, 2),
    COALESCE(p_effective_date, CURRENT_DATE),
    p_payment_method,
    p_reference,
    p_notes,
    NULLIF(trim(p_idempotency_key), ''),
    auth.uid()
  )
  RETURNING id INTO v_settlement_id;

  PERFORM recalculate_accounts_payable_paid(p_payable_id);

  PERFORM write_financial_audit(
    v_ap.establishment_id,
    'settlement',
    'accounts_payable',
    p_payable_id,
    jsonb_build_object('paid_amount', v_ap.paid_amount),
    (SELECT to_jsonb(ap.*) FROM public.accounts_payable ap WHERE ap.id = p_payable_id),
    format('Pagamento de %s (settlement %s)', p_amount, v_settlement_id)
  );

  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION register_receivable_settlement_batch(
  p_establishment_id UUID,
  p_items JSONB,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_total NUMERIC(12, 2) := 0;
  v_item JSONB;
  v_ar_id UUID;
  v_amount NUMERIC;
BEGIN
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_batch_id
    FROM public.financial_settlement_batches
    WHERE establishment_id = p_establishment_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_batch_id IS NOT NULL THEN
      RETURN v_batch_id;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_amount := (v_item->>'amount')::numeric;
    v_total := v_total + COALESCE(v_amount, 0);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Lote sem valores válidos';
  END IF;

  INSERT INTO public.financial_settlement_batches (
    establishment_id,
    direction,
    total_amount,
    effective_date,
    payment_method,
    reference,
    notes,
    idempotency_key,
    created_by
  ) VALUES (
    p_establishment_id,
    'receipt',
    ROUND(v_total, 2),
    COALESCE(p_effective_date, CURRENT_DATE),
    p_payment_method,
    p_reference,
    p_notes,
    NULLIF(trim(p_idempotency_key), ''),
    auth.uid()
  )
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_ar_id := (v_item->>'accounts_receivable_id')::uuid;
    v_amount := (v_item->>'amount')::numeric;
    PERFORM register_receivable_settlement(
      v_ar_id,
      v_amount,
      COALESCE(p_effective_date, CURRENT_DATE),
      p_payment_method,
      p_reference,
      NULL,
      p_notes,
      v_batch_id
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$;

-- Ajuste sync reserva: paid = reserva + quitações manuais
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

  IF v_balance <= v_eps AND v_existing_id IS NULL THEN
    RETURN;
  END IF;

  SELECT full_name INTO v_guest_name
  FROM public.clients
  WHERE id = COALESCE(p_res.guest_id, p_res.client_id)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.accounts_receivable
    SET amount = v_gross,
        due_date = v_due,
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
      'reservation_paid', v_paid
    ),
    p_res.created_by
  );
END;
$$;

ALTER TABLE public.financial_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_title_settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_settlement_batches'
      AND policyname = 'users_see_own_establishment_settlement_batches'
  ) THEN
    CREATE POLICY users_see_own_establishment_settlement_batches ON public.financial_settlement_batches
      FOR SELECT USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_settlement_batches'
      AND policyname = 'users_insert_own_establishment_settlement_batches'
  ) THEN
    CREATE POLICY users_insert_own_establishment_settlement_batches ON public.financial_settlement_batches
      FOR INSERT WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_title_settlements'
      AND policyname = 'users_see_own_establishment_title_settlements'
  ) THEN
    CREATE POLICY users_see_own_establishment_title_settlements ON public.financial_title_settlements
      FOR SELECT USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_title_settlements'
      AND policyname = 'users_insert_own_establishment_title_settlements'
  ) THEN
    CREATE POLICY users_insert_own_establishment_title_settlements ON public.financial_title_settlements
      FOR INSERT WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION register_receivable_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION register_payable_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION register_receivable_settlement_batch TO authenticated;

COMMENT ON TABLE public.financial_title_settlements IS
  'Quitações parciais/integrais de títulos AR/AP — histórico imutável com estorno por reversão.';