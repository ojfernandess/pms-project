-- Fase 5: fluxo de caixa só com movimentação efetiva (quitações) + projeção separada.

ALTER TABLE public.cash_flow_transactions
  ADD COLUMN IF NOT EXISTS accounts_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL;

ALTER TABLE public.cash_flow_transactions
  ADD COLUMN IF NOT EXISTS financial_settlement_id UUID REFERENCES public.financial_title_settlements(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_flow_transactions_settlement_unique
  ON public.cash_flow_transactions(financial_settlement_id)
  WHERE financial_settlement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ensure_daily_cash_flow(
  p_establishment_id UUID,
  p_flow_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.daily_cash_flow
  WHERE establishment_id = p_establishment_id
    AND flow_date = p_flow_date
    AND COALESCE(shift, 'full_day') = 'full_day'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.daily_cash_flow (
    establishment_id,
    flow_date,
    shift,
    status,
    opening_balance,
    created_by
  ) VALUES (
    p_establishment_id,
    p_flow_date,
    'full_day',
    'open',
    0,
    auth.uid()
  )
  ON CONFLICT (establishment_id, flow_date, shift) DO UPDATE
    SET updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_daily_cash_flow_totals(p_daily_cash_flow_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC(12, 2);
  v_in NUMERIC(12, 2);
  v_out NUMERIC(12, 2);
  v_with NUMERIC(12, 2);
BEGIN
  SELECT COALESCE(opening_balance, 0), COALESCE(withdrawals, 0)
  INTO v_opening, v_with
  FROM public.daily_cash_flow
  WHERE id = p_daily_cash_flow_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_in
  FROM public.cash_flow_transactions
  WHERE daily_cash_flow_id = p_daily_cash_flow_id
    AND transaction_type = 'inflow';

  SELECT COALESCE(SUM(amount), 0) INTO v_out
  FROM public.cash_flow_transactions
  WHERE daily_cash_flow_id = p_daily_cash_flow_id
    AND transaction_type IN ('outflow', 'withdrawal', 'refund');

  UPDATE public.daily_cash_flow
  SET
    total_inflows = ROUND(v_in, 2),
    total_outflows = ROUND(v_out, 2),
    closing_balance = ROUND(v_opening + v_in - v_out - v_with, 2),
    updated_at = NOW()
  WHERE id = p_daily_cash_flow_id;
END;
$$;

CREATE OR REPLACE FUNCTION post_financial_settlement_to_cash_flow(p_settlement_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.financial_title_settlements%ROWTYPE;
  v_dcf_id UUID;
  v_tx_id UUID;
  v_type TEXT;
  v_desc TEXT;
BEGIN
  SELECT * INTO v_s FROM public.financial_title_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quitação não encontrada';
  END IF;

  IF v_s.reversed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_tx_id
  FROM public.cash_flow_transactions
  WHERE financial_settlement_id = p_settlement_id
  LIMIT 1;

  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  v_dcf_id := ensure_daily_cash_flow(v_s.establishment_id, v_s.effective_date);

  IF v_s.direction = 'receipt' THEN
    v_type := 'inflow';
    v_desc := 'Recebimento — conta a receber';
  ELSE
    v_type := 'outflow';
    v_desc := 'Pagamento — conta a pagar';
  END IF;

  INSERT INTO public.cash_flow_transactions (
    daily_cash_flow_id,
    establishment_id,
    transaction_type,
    description,
    amount,
    payment_method,
    accounts_receivable_id,
    accounts_payable_id,
    financial_settlement_id,
    metadata,
    created_by
  ) VALUES (
    v_dcf_id,
    v_s.establishment_id,
    v_type,
    v_desc,
    v_s.amount,
    v_s.payment_method,
    v_s.accounts_receivable_id,
    v_s.accounts_payable_id,
    v_s.id,
    jsonb_build_object(
      'settlement_id', v_s.id,
      'batch_id', v_s.batch_id,
      'reference', v_s.reference,
      'effective_date', v_s.effective_date
    ),
    COALESCE(v_s.created_by, auth.uid())
  )
  RETURNING id INTO v_tx_id;

  PERFORM refresh_daily_cash_flow_totals(v_dcf_id);
  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_financial_settlement_post_cash_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reversed_at IS NULL THEN
    PERFORM post_financial_settlement_to_cash_flow(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_settlement_post_cash_flow ON public.financial_title_settlements;
CREATE TRIGGER financial_settlement_post_cash_flow
  AFTER INSERT ON public.financial_title_settlements
  FOR EACH ROW
  EXECUTE FUNCTION trg_financial_settlement_post_cash_flow();

CREATE OR REPLACE FUNCTION get_financial_cash_flow_report(
  p_establishment_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_realized_in NUMERIC(12, 2) := 0;
  v_realized_out NUMERIC(12, 2) := 0;
  v_projected_ar NUMERIC(12, 2) := 0;
  v_projected_ap NUMERIC(12, 2) := 0;
  v_today DATE := CURRENT_DATE;
  v_series JSONB := '[]'::jsonb;
BEGIN
  IF p_start_date > p_end_date THEN
  RAISE EXCEPTION 'Período inválido';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction = 'receipt'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction = 'disbursement'), 0)
  INTO v_realized_in, v_realized_out
  FROM public.financial_title_settlements
  WHERE establishment_id = p_establishment_id
    AND reversed_at IS NULL
    AND effective_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))), 0) INTO v_projected_ar
  FROM public.accounts_receivable
  WHERE establishment_id = p_establishment_id
    AND status IN ('pending', 'partial', 'overdue')
    AND due_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))), 0) INTO v_projected_ap
  FROM public.accounts_payable
  WHERE establishment_id = p_establishment_id
    AND is_recurring = false
    AND COALESCE(approval_status, 'approved') = 'approved'
    AND status IN ('pending', 'partial', 'overdue')
    AND due_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(jsonb_agg(row_to_json(d)::jsonb ORDER BY d.day), '[]'::jsonb)
  INTO v_series
  FROM (
    SELECT
      gs.day::date AS day,
      COALESCE(SUM(s.amount) FILTER (WHERE s.direction = 'receipt'), 0) AS inflows,
      COALESCE(SUM(s.amount) FILTER (WHERE s.direction = 'disbursement'), 0) AS outflows
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) gs(day)
    LEFT JOIN public.financial_title_settlements s
      ON s.establishment_id = p_establishment_id
      AND s.effective_date = gs.day::date
      AND s.reversed_at IS NULL
    GROUP BY gs.day::date
  ) d;

  RETURN jsonb_build_object(
    'realized_inflows', ROUND(v_realized_in, 2),
    'realized_outflows', ROUND(v_realized_out, 2),
    'realized_net', ROUND(v_realized_in - v_realized_out, 2),
    'projected_receivables', ROUND(v_projected_ar, 2),
    'projected_payables', ROUND(v_projected_ap, 2),
    'projected_net', ROUND(v_projected_ar - v_projected_ap, 2),
    'as_of', v_today,
    'daily', v_series
  );
END;
$$;

CREATE OR REPLACE FUNCTION backfill_settlement_cash_flow(p_establishment_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT s.id
    FROM public.financial_title_settlements s
    WHERE s.reversed_at IS NULL
      AND (p_establishment_id IS NULL OR s.establishment_id = p_establishment_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_flow_transactions c
        WHERE c.financial_settlement_id = s.id
      )
    ORDER BY s.effective_date, s.created_at
  LOOP
    PERFORM post_financial_settlement_to_cash_flow(v_rec.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_financial_cash_flow_report TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_settlement_cash_flow TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_daily_cash_flow TO authenticated;

COMMENT ON FUNCTION get_financial_cash_flow_report IS
  'Realizado = quitações; projetado = saldo AR/AP por vencimento no período (não entra no caixa).';