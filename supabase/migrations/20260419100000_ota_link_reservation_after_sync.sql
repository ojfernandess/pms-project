-- Vínculo OTA após criar reserva: lock por canal+código, evita duplicar reserva na mesma sincronização
-- e cancela automaticamente a reserva "órfã" se o vínculo já existir (retry / corrida).

CREATE OR REPLACE FUNCTION public.ota_link_reservation_after_sync(
  p_reservation_id uuid,
  p_ota_channel_id uuid,
  p_ota_reservation_code text,
  p_guest_json jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := trim(coalesce(p_ota_reservation_code, ''));
  v_existing_id uuid;
  v_cancelled int := 0;
  v_synced_at timestamptz;
  v_sync_status text;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ota_reservation_code obrigatório');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_ota_channel_id::text || '::' || v_code));

  SELECT reservation_id INTO v_existing_id
  FROM ota_reservations
  WHERE ota_channel_id = p_ota_channel_id
    AND ota_reservation_code = v_code;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_id = p_reservation_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'kind', 'already_linked'
      );
    END IF;

    UPDATE public.reservations
    SET
      status = 'cancelled'::reservation_status,
      cancelled_at = COALESCE(cancelled_at, NOW()),
      cancellation_reason = CASE
        WHEN cancellation_reason IS NULL OR trim(cancellation_reason) = '' THEN 'duplicate_ota_sync'
        ELSE cancellation_reason
      END,
      notes = concat_ws(
        E'\n',
        NULLIF(trim(COALESCE(notes, '')), ''),
        '[OTA sync] Reserva cancelada automaticamente: vínculo OTA já existia para este código no canal (anti-duplicidade).'
      )
    WHERE id = p_reservation_id
      AND status IN ('pending', 'unpaid', 'confirmed', 'preregistration', 'blocked');

    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'reservation_id', v_existing_id,
      'kind', 'duplicate_recovered',
      'orphan_cancelled', v_cancelled > 0,
      'orphan_reservation_id', p_reservation_id
    );
  END IF;

  v_synced_at := COALESCE((p_guest_json->>'synced_at')::timestamptz, NOW());
  v_sync_status := COALESCE(NULLIF(trim(p_guest_json->>'sync_status'), ''), 'synced');

  INSERT INTO ota_reservations (
    reservation_id,
    ota_channel_id,
    ota_reservation_code,
    ota_guest_name,
    ota_guest_email,
    ota_guest_phone,
    ota_source_channel_name,
    ota_segment,
    ota_cm_booking_id,
    ota_special_requests,
    ota_guest_address,
    sync_status,
    synced_at
  )
  VALUES (
    p_reservation_id,
    p_ota_channel_id,
    v_code,
    NULLIF(trim(p_guest_json->>'ota_guest_name'), ''),
    NULLIF(trim(p_guest_json->>'ota_guest_email'), ''),
    NULLIF(trim(p_guest_json->>'ota_guest_phone'), ''),
    NULLIF(trim(p_guest_json->>'ota_source_channel_name'), ''),
    NULLIF(trim(p_guest_json->>'ota_segment'), ''),
    NULLIF(trim(p_guest_json->>'ota_cm_booking_id'), ''),
    NULLIF(trim(p_guest_json->>'ota_special_requests'), ''),
    CASE
      WHEN p_guest_json ? 'ota_guest_address' AND jsonb_typeof(p_guest_json->'ota_guest_address') IN ('object', 'array')
      THEN p_guest_json->'ota_guest_address'
      ELSE NULL
    END,
    v_sync_status,
    v_synced_at
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'kind', 'inserted'
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT reservation_id INTO v_existing_id
    FROM ota_reservations
    WHERE ota_channel_id = p_ota_channel_id
      AND ota_reservation_code = v_code;

    IF v_existing_id IS NOT NULL AND v_existing_id <> p_reservation_id THEN
      UPDATE public.reservations
      SET
        status = 'cancelled'::reservation_status,
        cancelled_at = COALESCE(cancelled_at, NOW()),
        cancellation_reason = CASE
          WHEN cancellation_reason IS NULL OR trim(cancellation_reason) = '' THEN 'duplicate_ota_sync'
          ELSE cancellation_reason
        END,
        notes = concat_ws(
          E'\n',
          NULLIF(trim(COALESCE(notes, '')), ''),
          '[OTA sync] Reserva cancelada automaticamente: violação de unicidade OTA (anti-duplicidade).'
        )
      WHERE id = p_reservation_id
        AND status IN ('pending', 'unpaid', 'confirmed', 'preregistration', 'blocked');

      GET DIAGNOSTICS v_cancelled = ROW_COUNT;

      RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_existing_id,
        'kind', 'duplicate_recovered',
        'orphan_cancelled', v_cancelled > 0,
        'orphan_reservation_id', p_reservation_id
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'unique_violation_inesperada');
END;
$$;

COMMENT ON FUNCTION public.ota_link_reservation_after_sync(uuid, uuid, text, jsonb) IS
  'Grava vínculo em ota_reservations com lock; se o código já existir noutra reserva, cancela a reserva órfã e devolve a reserva canônica.';

GRANT EXECUTE ON FUNCTION public.ota_link_reservation_after_sync(uuid, uuid, text, jsonb) TO service_role;
