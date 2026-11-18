-- Fase 6: prévia e correção controlada de títulos AR legados.

CREATE OR REPLACE FUNCTION preview_financial_ar_migration(
  p_establishment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_open JSONB;
  v_duplicates JSONB;
  v_amount_mismatch JSONB;
  v_parking JSONB;
  v_summary JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO v_paid_open
  FROM (
    SELECT
      ar.id AS receivable_id,
      ar.reservation_id,
      ar.establishment_id,
      ar.amount,
      ar.paid_amount,
      ar.status,
      r.reservation_code,
      reservation_gross_amount(r.id) AS expected_gross,
      COALESCE(r.paid_amount, 0) AS reservation_paid
    FROM public.accounts_receivable ar
    JOIN public.reservations r ON r.id = ar.reservation_id
    WHERE ar.origin = 'reservation'
      AND ar.status IN ('pending', 'partial', 'overdue')
      AND (p_establishment_id IS NULL OR ar.establishment_id = p_establishment_id)
      AND (reservation_gross_amount(r.id) - COALESCE(r.paid_amount, 0)) <= 0.02
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO v_duplicates
  FROM (
    SELECT
      ar.establishment_id,
      ar.reservation_id,
      COUNT(*)::int AS title_count,
      jsonb_agg(ar.id ORDER BY ar.created_at DESC) AS receivable_ids
    FROM public.accounts_receivable ar
    WHERE ar.origin = 'reservation'
      AND ar.status <> 'cancelled'
      AND (p_establishment_id IS NULL OR ar.establishment_id = p_establishment_id)
    GROUP BY ar.establishment_id, ar.reservation_id
    HAVING COUNT(*) > 1
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO v_amount_mismatch
  FROM (
    SELECT
      ar.id AS receivable_id,
      ar.reservation_id,
      ar.amount,
      reservation_gross_amount(r.id) AS expected_gross,
      ABS(ar.amount - reservation_gross_amount(r.id)) AS delta
    FROM public.accounts_receivable ar
    JOIN public.reservations r ON r.id = ar.reservation_id
    WHERE ar.origin = 'reservation'
      AND ar.status <> 'cancelled'
      AND (p_establishment_id IS NULL OR ar.establishment_id = p_establishment_id)
      AND ABS(ar.amount - reservation_gross_amount(r.id)) > 0.05
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO v_parking
  FROM (
    SELECT ar.id AS receivable_id, ar.reservation_id, ar.status
    FROM public.accounts_receivable ar
    JOIN public.reservations r ON r.id = ar.reservation_id
    WHERE ar.origin = 'reservation'
      AND ar.status <> 'cancelled'
      AND (p_establishment_id IS NULL OR ar.establishment_id = p_establishment_id)
      AND is_parking_mirror_reservation(r)
  ) x;

  v_summary := jsonb_build_object(
    'paid_reservation_still_open', jsonb_array_length(v_paid_open),
    'duplicate_reservation_titles', jsonb_array_length(v_duplicates),
    'amount_mismatch', jsonb_array_length(v_amount_mismatch),
    'parking_mirror_titles', jsonb_array_length(v_parking),
    'total_issues',
      jsonb_array_length(v_paid_open)
      + jsonb_array_length(v_duplicates)
      + jsonb_array_length(v_amount_mismatch)
      + jsonb_array_length(v_parking)
  );

  RETURN jsonb_build_object(
    'establishment_id', p_establishment_id,
    'generated_at', NOW(),
    'summary', v_summary,
    'paid_reservation_still_open', v_paid_open,
    'duplicate_reservation_titles', v_duplicates,
    'amount_mismatch', v_amount_mismatch,
    'parking_mirror_titles', v_parking
  );
END;
$$;

CREATE OR REPLACE FUNCTION apply_financial_ar_migration(
  p_establishment_id UUID,
  p_fix_paid_titles BOOLEAN DEFAULT true,
  p_fix_duplicates BOOLEAN DEFAULT true,
  p_resync_reservations BOOLEAN DEFAULT true,
  p_cancel_parking_mirror BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixed_paid INTEGER := 0;
  v_cancelled_dupes INTEGER := 0;
  v_resynced INTEGER := 0;
  v_cancelled_parking INTEGER := 0;
  v_res RECORD;
  v_dup RECORD;
  v_dup_count INTEGER;
  v_keep_id UUID;
BEGIN
  IF p_establishment_id IS NULL THEN
    RAISE EXCEPTION 'establishment_id obrigatório para aplicar correção';
  END IF;

  IF p_fix_paid_titles THEN
    WITH fixed AS (
      UPDATE public.accounts_receivable ar
      SET
        amount = reservation_gross_amount(r.id),
        paid_amount = LEAST(COALESCE(r.paid_amount, 0), reservation_gross_amount(r.id)),
        status = 'paid',
        paid_date = COALESCE(ar.paid_date, CURRENT_DATE),
        updated_at = NOW()
      FROM public.reservations r
      WHERE ar.reservation_id = r.id
        AND ar.establishment_id = p_establishment_id
        AND ar.origin = 'reservation'
        AND ar.status IN ('pending', 'partial', 'overdue')
        AND (reservation_gross_amount(r.id) - COALESCE(r.paid_amount, 0)) <= 0.02
      RETURNING ar.id
    )
    SELECT COUNT(*)::int INTO v_fixed_paid FROM fixed;
  END IF;

  IF p_fix_duplicates THEN
    FOR v_dup IN
      SELECT ar.reservation_id
      FROM public.accounts_receivable ar
      WHERE ar.establishment_id = p_establishment_id
        AND ar.origin = 'reservation'
        AND ar.status <> 'cancelled'
      GROUP BY ar.reservation_id
      HAVING COUNT(*) > 1
    LOOP
      SELECT ar.id INTO v_keep_id
      FROM public.accounts_receivable ar
      WHERE ar.reservation_id = v_dup.reservation_id
        AND ar.origin = 'reservation'
        AND ar.status <> 'cancelled'
      ORDER BY ar.created_at DESC
      LIMIT 1;

      WITH cancelled AS (
        UPDATE public.accounts_receivable
        SET status = 'cancelled',
            updated_at = NOW(),
            notes = COALESCE(notes, '') || ' [migração: duplicata]'
        WHERE reservation_id = v_dup.reservation_id
          AND origin = 'reservation'
          AND status <> 'cancelled'
          AND id <> v_keep_id
        RETURNING id
      )
      SELECT COUNT(*)::int INTO v_dup_count FROM cancelled;
      v_cancelled_dupes := v_cancelled_dupes + COALESCE(v_dup_count, 0);
    END LOOP;
  END IF;

  IF p_cancel_parking_mirror THEN
    WITH c AS (
      UPDATE public.accounts_receivable ar
      SET status = 'cancelled', updated_at = NOW(), notes = COALESCE(notes, '') || ' [migração: vaga espelho]'
      FROM public.reservations r
      WHERE ar.reservation_id = r.id
        AND ar.establishment_id = p_establishment_id
        AND ar.origin = 'reservation'
        AND ar.status <> 'cancelled'
        AND is_parking_mirror_reservation(r)
      RETURNING ar.id
    )
    SELECT COUNT(*)::int INTO v_cancelled_parking FROM c;
  END IF;

  IF p_resync_reservations THEN
    FOR v_res IN
      SELECT r.*
      FROM public.reservations r
      WHERE r.establishment_id = p_establishment_id
        AND r.status <> 'cancelled'
    LOOP
      PERFORM sync_accounts_receivable_for_reservation(v_res);
      v_resynced := v_resynced + 1;
    END LOOP;
  END IF;

  PERFORM write_financial_audit(
    p_establishment_id,
    'update',
    'accounts_receivable',
    p_establishment_id,
    NULL,
    jsonb_build_object(
      'fixed_paid_titles', v_fixed_paid,
      'cancelled_duplicates', v_cancelled_dupes,
      'cancelled_parking', v_cancelled_parking,
      'resynced_reservations', v_resynced
    ),
    'apply_financial_ar_migration'
  );

  RETURN jsonb_build_object(
    'establishment_id', p_establishment_id,
    'fixed_paid_titles', v_fixed_paid,
    'cancelled_duplicates', v_cancelled_dupes,
    'cancelled_parking_mirror', v_cancelled_parking,
    'resynced_reservations', v_resynced,
    'preview_after', preview_financial_ar_migration(p_establishment_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION preview_financial_ar_migration TO authenticated;
GRANT EXECUTE ON FUNCTION apply_financial_ar_migration TO authenticated;

COMMENT ON FUNCTION preview_financial_ar_migration IS
  'Prévia de inconsistências AR legados (spec §10) antes da migração definitiva.';
COMMENT ON FUNCTION apply_financial_ar_migration IS
  'Correção controlada: quita títulos de reservas pagas, remove duplicatas, ressincroniza.';