-- Fase 3: Fornecedores, aprovação de despesas e recorrência de contas a pagar.

CREATE TABLE IF NOT EXISTS public.financial_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_number TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,
  bank_details JSONB,
  category TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_suppliers_establishment
  ON public.financial_suppliers(establishment_id);

CREATE INDEX IF NOT EXISTS idx_financial_suppliers_name
  ON public.financial_suppliers(establishment_id, lower(name));

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.financial_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS document_number TEXT;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS cost_center TEXT;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS recurrence_active BOOLEAN DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_approval_status_check'
  ) THEN
    ALTER TABLE public.accounts_payable
      ADD CONSTRAINT accounts_payable_approval_status_check
      CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION financial_advance_recurrence_date(
  p_from DATE,
  p_pattern TEXT,
  p_custom_days INTEGER DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE COALESCE(p_pattern, 'monthly')
    WHEN 'daily' THEN RETURN p_from + 1;
    WHEN 'weekly' THEN RETURN p_from + 7;
    WHEN 'monthly' THEN RETURN (p_from + INTERVAL '1 month')::date;
    WHEN 'quarterly' THEN RETURN (p_from + INTERVAL '3 months')::date;
    WHEN 'yearly' THEN RETURN (p_from + INTERVAL '1 year')::date;
    WHEN 'custom' THEN RETURN p_from + COALESCE(p_custom_days, 30);
    ELSE RETURN (p_from + INTERVAL '1 month')::date;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION spawn_due_recurring_payables(p_establishment_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_spawned INTEGER := 0;
  v_custom_days INTEGER;
  v_new_due DATE;
BEGIN
  FOR v_rec IN
    SELECT *
    FROM public.accounts_payable
    WHERE is_recurring = true
      AND COALESCE(recurrence_active, true) = true
      AND status NOT IN ('cancelled')
      AND approval_status = 'approved'
      AND next_due_date IS NOT NULL
      AND next_due_date <= CURRENT_DATE
      AND (p_establishment_id IS NULL OR establishment_id = p_establishment_id)
  LOOP
    v_custom_days := NULLIF((v_rec.metadata->>'custom_interval_days')::int, 0);

    IF NOT EXISTS (
      SELECT 1 FROM public.accounts_payable child
      WHERE child.parent_payable_id = v_rec.id
        AND child.due_date = v_rec.next_due_date
        AND child.status <> 'cancelled'
    ) THEN
      INSERT INTO public.accounts_payable (
        establishment_id,
        supplier_id,
        supplier_name,
        supplier_document,
        supplier_email,
        supplier_phone,
        description,
        amount,
        paid_amount,
        due_date,
        type,
        category,
        cost_center,
        installment_number,
        total_installments,
        parent_payable_id,
        is_recurring,
        recurrence_pattern,
        next_due_date,
        recurrence_active,
        approval_status,
        status,
        metadata,
        notes,
        created_by
      ) VALUES (
        v_rec.establishment_id,
        v_rec.supplier_id,
        v_rec.supplier_name,
        v_rec.supplier_document,
        v_rec.supplier_email,
        v_rec.supplier_phone,
        v_rec.description || ' (recorrência)',
        v_rec.amount,
        0,
        v_rec.next_due_date,
        v_rec.type,
        v_rec.category,
        v_rec.cost_center,
        1,
        1,
        v_rec.id,
        false,
        v_rec.recurrence_pattern,
        NULL,
        false,
        'approved',
        CASE WHEN v_rec.next_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
        COALESCE(v_rec.metadata, '{}'::jsonb) || jsonb_build_object('spawned_from_recurring', v_rec.id),
        v_rec.notes,
        v_rec.created_by
      );
      v_spawned := v_spawned + 1;
    END IF;

    v_new_due := financial_advance_recurrence_date(v_rec.next_due_date, v_rec.recurrence_pattern, v_custom_days);

    UPDATE public.accounts_payable
    SET next_due_date = v_new_due,
        updated_at = NOW()
    WHERE id = v_rec.id;
  END LOOP;

  RETURN v_spawned;
END;
$$;

CREATE OR REPLACE FUNCTION approve_accounts_payable(
  p_payable_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.accounts_payable
  SET approval_status = 'approved',
      approval_notes = COALESCE(p_notes, approval_notes),
      approved_at = NOW(),
      approved_by = auth.uid(),
      updated_at = NOW()
  WHERE id = p_payable_id
    AND approval_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada ou já processada';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_accounts_payable(
  p_payable_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.accounts_payable
  SET approval_status = 'rejected',
      approval_notes = p_notes,
      status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_payable_id
    AND approval_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada ou já processada';
  END IF;
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

  SELECT * INTO v_ap FROM public.accounts_payable WHERE id = p_payable_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;

  IF v_ap.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Despesa aguardando aprovação — pagamento não permitido';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.financial_title_settlements
    WHERE establishment_id = v_ap.establishment_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
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

ALTER TABLE public.financial_suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_suppliers' AND policyname = 'users_see_own_establishment_suppliers'
  ) THEN
    CREATE POLICY users_see_own_establishment_suppliers ON public.financial_suppliers
      FOR SELECT USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_suppliers' AND policyname = 'users_mutate_own_establishment_suppliers'
  ) THEN
    CREATE POLICY users_mutate_own_establishment_suppliers ON public.financial_suppliers
      FOR ALL USING (public.user_can_access_establishment(auth.uid(), establishment_id))
      WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION spawn_due_recurring_payables TO authenticated;
GRANT EXECUTE ON FUNCTION approve_accounts_payable TO authenticated;
GRANT EXECUTE ON FUNCTION reject_accounts_payable TO authenticated;

COMMENT ON TABLE public.financial_suppliers IS 'Cadastro de fornecedores para contas a pagar.';