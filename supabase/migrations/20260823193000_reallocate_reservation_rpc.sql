-- Realocação de reserva entre estabelecimentos da mesma empresa
-- Atualiza reserva + financeiro (pagamentos, AR, faturas, reembolsos, stripe, checkin charges, web check-in)

CREATE OR REPLACE FUNCTION public.reallocate_reservation(
  p_reservation_id UUID,
  p_target_establishment_id UUID,
  p_target_room_id UUID,
  p_target_category_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_reservation RECORD;
  v_source_establishment_id UUID;
  v_source_company_id UUID;
  v_target_company_id UUID;
  v_target_room RECORD;
  v_category_id UUID;
  v_pricing_plan_id UUID;
  v_overlap_count INTEGER;
  v_payments_updated INTEGER := 0;
  v_ar_updated INTEGER := 0;
  v_invoices_updated INTEGER := 0;
  v_refunds_updated INTEGER := 0;
  v_stripe_updated INTEGER := 0;
  v_checkin_charges_updated INTEGER := 0;
  v_web_checkin_updated INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT r.*
  INTO v_reservation
  FROM public.reservations r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada';
  END IF;

  IF v_reservation.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível realocar uma reserva cancelada';
  END IF;

  IF v_reservation.status = 'blocked' THEN
    RAISE EXCEPTION 'Não é possível realocar um bloqueio. Use manutenção ou remova o bloqueio.';
  END IF;

  v_source_establishment_id := v_reservation.establishment_id;

  IF v_source_establishment_id = p_target_establishment_id THEN
    RAISE EXCEPTION 'Selecione um estabelecimento diferente do atual';
  END IF;

  IF NOT public.user_can_access_establishment(v_uid, v_source_establishment_id) THEN
    RAISE EXCEPTION 'Sem permissão no estabelecimento de origem';
  END IF;

  IF NOT public.user_can_access_establishment(v_uid, p_target_establishment_id) THEN
    RAISE EXCEPTION 'Sem permissão no estabelecimento de destino';
  END IF;

  SELECT e.company_id INTO v_source_company_id
  FROM public.establishments e
  WHERE e.id = v_source_establishment_id;

  SELECT e.company_id INTO v_target_company_id
  FROM public.establishments e
  WHERE e.id = p_target_establishment_id AND e.is_active = true;

  IF v_target_company_id IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento de destino não encontrado ou inativo';
  END IF;

  IF v_source_company_id IS DISTINCT FROM v_target_company_id THEN
    RAISE EXCEPTION 'A realocação só é permitida entre estabelecimentos da mesma empresa';
  END IF;

  SELECT r.*
  INTO v_target_room
  FROM public.rooms r
  WHERE r.id = p_target_room_id
    AND r.establishment_id = p_target_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quarto de destino inválido para o estabelecimento selecionado';
  END IF;

  IF COALESCE(v_target_room.is_blocked, false) = true THEN
    RAISE EXCEPTION 'O quarto de destino está interditado';
  END IF;

  IF v_target_room.status = 'maintenance' THEN
    RAISE EXCEPTION 'O quarto de destino está em manutenção';
  END IF;

  v_category_id := COALESCE(p_target_category_id, v_target_room.category_id);

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Categoria de destino não informada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.room_categories rc
    WHERE rc.id = v_category_id
      AND rc.establishment_id = p_target_establishment_id
  ) THEN
    RAISE EXCEPTION 'Categoria de destino inválida para o estabelecimento selecionado';
  END IF;

  -- Conflito de ocupação no destino (checkout exclusivo)
  SELECT COUNT(*)
  INTO v_overlap_count
  FROM public.reservations r
  WHERE r.room_id = p_target_room_id
    AND r.id <> p_reservation_id
    AND r.status NOT IN ('cancelled')
    AND r.checkin_date < v_reservation.checkout_date
    AND r.checkout_date > v_reservation.checkin_date;

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'O quarto de destino já possui reserva no período';
  END IF;

  -- Plano tarifário: manter só se existir no destino
  v_pricing_plan_id := NULL;
  IF v_reservation.pricing_plan_id IS NOT NULL THEN
    SELECT pp.id
    INTO v_pricing_plan_id
    FROM public.pricing_plans pp
    WHERE pp.id = v_reservation.pricing_plan_id
      AND pp.establishment_id = p_target_establishment_id;
  END IF;

  UPDATE public.reservations
  SET
    establishment_id = p_target_establishment_id,
    room_id = p_target_room_id,
    category_id = v_category_id,
    pricing_plan_id = v_pricing_plan_id,
    notes = CASE
      WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN
        CASE
          WHEN notes IS NULL OR notes = '' THEN p_notes
          ELSE notes || E'\n' || p_notes
        END
      ELSE notes
    END,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  -- Pagamentos: limpar carrier se não existir no destino
  UPDATE public.payments p
  SET
    establishment_id = p_target_establishment_id,
    carrier_id = CASE
      WHEN p.carrier_id IS NULL THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM public.payment_carriers pc
        WHERE pc.id = p.carrier_id
          AND pc.establishment_id = p_target_establishment_id
      ) THEN p.carrier_id
      ELSE NULL
    END
  WHERE p.reservation_id = p_reservation_id;
  GET DIAGNOSTICS v_payments_updated = ROW_COUNT;

  UPDATE public.accounts_receivable
  SET establishment_id = p_target_establishment_id,
      updated_at = NOW()
  WHERE reservation_id = p_reservation_id;
  GET DIAGNOSTICS v_ar_updated = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) THEN
    UPDATE public.invoices
    SET establishment_id = p_target_establishment_id
    WHERE reservation_id = p_reservation_id;
    GET DIAGNOSTICS v_invoices_updated = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'financial_refunds'
  ) THEN
    UPDATE public.financial_refunds
    SET establishment_id = p_target_establishment_id
    WHERE reservation_id = p_reservation_id;
    GET DIAGNOSTICS v_refunds_updated = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stripe_payments'
  ) THEN
    UPDATE public.stripe_payments
    SET establishment_id = p_target_establishment_id
    WHERE reservation_id = p_reservation_id;
    GET DIAGNOSTICS v_stripe_updated = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stripe_refunds'
  ) THEN
    UPDATE public.stripe_refunds sr
    SET establishment_id = p_target_establishment_id
    WHERE sr.payment_id IN (
      SELECT sp.id FROM public.stripe_payments sp WHERE sp.reservation_id = p_reservation_id
    )
    OR sr.reservation_id = p_reservation_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'checkin_charges'
  ) THEN
    UPDATE public.checkin_charges
    SET establishment_id = p_target_establishment_id
    WHERE reservation_id = p_reservation_id;
    GET DIAGNOSTICS v_checkin_charges_updated = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'web_checkin'
  ) THEN
    UPDATE public.web_checkin
    SET establishment_id = p_target_establishment_id
    WHERE reservation_id = p_reservation_id;
    GET DIAGNOSTICS v_web_checkin_updated = ROW_COUNT;
  END IF;

  -- Fluxo de caixa ligado aos pagamentos da reserva (quando a coluna existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cash_flow_transactions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cash_flow_transactions'
      AND column_name = 'establishment_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cash_flow_transactions'
      AND column_name = 'payment_id'
  ) THEN
    EXECUTE $q$
      UPDATE public.cash_flow_transactions cft
      SET establishment_id = $1
      WHERE cft.payment_id IN (
        SELECT p.id FROM public.payments p WHERE p.reservation_id = $2
      )
    $q$ USING p_target_establishment_id, p_reservation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'source_establishment_id', v_source_establishment_id,
    'target_establishment_id', p_target_establishment_id,
    'target_room_id', p_target_room_id,
    'target_category_id', v_category_id,
    'payments_updated', v_payments_updated,
    'accounts_receivable_updated', v_ar_updated,
    'invoices_updated', v_invoices_updated,
    'refunds_updated', v_refunds_updated,
    'stripe_payments_updated', v_stripe_updated,
    'checkin_charges_updated', v_checkin_charges_updated,
    'web_checkin_updated', v_web_checkin_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reallocate_reservation(UUID, UUID, UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reallocate_reservation(UUID, UUID, UUID, UUID, TEXT) IS
  'Realoca uma reserva para outro estabelecimento da mesma empresa, atualizando também pagamentos, contas a receber e registros financeiros vinculados.';
