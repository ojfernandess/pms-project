-- Atualizar função create_reservation_with_lock para atribuir automaticamente um quarto
-- quando room_id é NULL mas há categoria especificada

CREATE OR REPLACE FUNCTION public.create_reservation_with_lock(
  p_reservation_data JSONB,
  p_checkin_date DATE,
  p_checkout_date DATE,
  p_establishment_id UUID,
  p_room_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_reservation_id UUID;
  v_room_id UUID;
  v_category_id UUID;
  v_available BOOLEAN;
  v_conflict_count INTEGER;
  v_result JSONB;
  v_room_is_blocked BOOLEAN;
  v_room_status TEXT;
  v_assigned_room_id UUID;
BEGIN
  -- Extrair dados da reserva
  v_room_id := COALESCE(p_room_id, (p_reservation_data->>'room_id')::UUID);
  v_category_id := COALESCE(p_category_id, (p_reservation_data->>'category_id')::UUID);

  -- Validar datas
  IF p_checkout_date <= p_checkin_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Data de checkout deve ser posterior à data de check-in'
    );
  END IF;

  -- Se há quarto específico, verificar disponibilidade com LOCK
  IF v_room_id IS NOT NULL THEN
    -- Verificar se quarto está bloqueado ou em manutenção (sem lock)
    SELECT is_blocked, status INTO v_room_is_blocked, v_room_status
    FROM public.rooms
    WHERE id = v_room_id;
    
    -- Verificar se o quarto existe
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto não encontrado'
      );
    END IF;
    
    -- Verificar apenas se está realmente bloqueado (is_blocked = TRUE) ou em manutenção
    IF COALESCE(v_room_is_blocked, FALSE) = TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está interditado - não é possível criar reservas'
      );
    END IF;
    
    -- Verificar apenas status 'maintenance'
    IF v_room_status = 'maintenance' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está em manutenção - não é possível criar reservas'
      );
    END IF;

    -- Lock na tabela de reservas para prevenir race conditions
    BEGIN
      PERFORM 1
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration', 'unpaid')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        )
      FOR UPDATE NOWAIT;

      SELECT COUNT(*) INTO v_conflict_count
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration', 'unpaid')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        );

      IF v_conflict_count > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Quarto não está disponível no período solicitado',
          'conflict_count', v_conflict_count
        );
      END IF;
    EXCEPTION
      WHEN lock_not_available THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Sistema ocupado. Por favor, tente novamente em alguns instantes.',
          'retry_after', 1
        );
    END;
  END IF;

  -- Se há categoria mas não quarto específico, encontrar e atribuir um quarto disponível automaticamente
  IF v_category_id IS NOT NULL AND v_room_id IS NULL THEN
    -- Buscar um quarto disponível na categoria que não tenha conflitos
    SELECT r.id INTO v_assigned_room_id
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.establishment_id = p_establishment_id
      AND r.is_blocked = FALSE
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration', 'unpaid')
          AND (
            (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          )
      )
    ORDER BY r.room_number
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_assigned_room_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Nenhum quarto disponível nesta categoria no período solicitado',
        'available_rooms', 0
      );
    END IF;

    -- Atribuir o quarto encontrado
    v_room_id := v_assigned_room_id;
  END IF;

  -- Criar a reserva
  INSERT INTO public.reservations (
    establishment_id,
    room_id,
    category_id,
    checkin_date,
    checkout_date,
    client_id,
    guest_id,
    guest_name,
    adults,
    children,
    total_amount,
    paid_amount,
    payment_status,
    status,
    notes,
    checkin_time,
    checkout_time,
    pricing_plan_id,
    created_by,
    expiration_date,
    channel
  )
  VALUES (
    p_establishment_id,
    v_room_id,
    v_category_id,
    p_checkin_date,
    p_checkout_date,
    (p_reservation_data->>'client_id')::UUID,
    (p_reservation_data->>'guest_id')::UUID,
    p_reservation_data->>'guest_name',
    COALESCE((p_reservation_data->>'adults')::INTEGER, 1),
    COALESCE((p_reservation_data->>'children')::INTEGER, 0),
    COALESCE((p_reservation_data->>'total_amount')::NUMERIC, 0),
    COALESCE((p_reservation_data->>'paid_amount')::NUMERIC, 0),
    COALESCE((p_reservation_data->>'payment_status')::payment_status, 'pending'::payment_status),
    COALESCE((p_reservation_data->>'status')::reservation_status, 'pending'::reservation_status),
    p_reservation_data->>'notes',
    CASE 
      WHEN p_reservation_data->>'checkin_time' IS NOT NULL AND p_reservation_data->>'checkin_time' != '' 
      THEN (p_reservation_data->>'checkin_time')::TIME
      ELSE NULL
    END,
    CASE 
      WHEN p_reservation_data->>'checkout_time' IS NOT NULL AND p_reservation_data->>'checkout_time' != '' 
      THEN (p_reservation_data->>'checkout_time')::TIME
      ELSE NULL
    END,
    (p_reservation_data->>'pricing_plan_id')::UUID,
    (p_reservation_data->>'created_by')::UUID,
    CASE 
      WHEN p_reservation_data->>'expiration_date' IS NOT NULL AND p_reservation_data->>'expiration_date' != '' 
      THEN (p_reservation_data->>'expiration_date')::TIMESTAMPTZ
      ELSE NULL
    END,
    COALESCE(p_reservation_data->>'channel', 'direct')
  )
  RETURNING id INTO v_reservation_id;

  -- Retornar resultado incluindo o quarto atribuído
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'room_id', v_room_id,
    'auto_assigned', CASE WHEN p_room_id IS NULL AND v_room_id IS NOT NULL THEN true ELSE false END
  );

EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = '55P03' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Sistema ocupado. Por favor, tente novamente em alguns instantes.',
        'retry_after', 1
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
    END IF;
END;
$$;

-- Comentário atualizado
COMMENT ON FUNCTION public.create_reservation_with_lock IS 'Cria reserva com lock e validação atômica para prevenir race conditions. Atribui automaticamente um quarto disponível quando room_id não é especificado mas há category_id. Inclui suporte para expiration_date e channel.';

