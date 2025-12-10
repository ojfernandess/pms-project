-- Função para criar reserva com lock e validação atômica
-- Previne race conditions quando múltiplas reservas são criadas simultaneamente

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
    -- IMPORTANTE: Não bloquear por status "occupied" ou "blocked" se não houver bloqueio real
    -- O status "occupied" ou "blocked" pode ser apenas um status visual do mapa de ocupação
    -- que considera reservas, mas não impede a criação de novas reservas se não houver conflito
    IF EXISTS (
      SELECT 1 FROM public.rooms
      WHERE id = v_room_id
        AND (is_blocked = TRUE OR status = 'maintenance')
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE 
          WHEN EXISTS (SELECT 1 FROM public.rooms WHERE id = v_room_id AND is_blocked = TRUE) 
          THEN 'Quarto está interditado - não é possível criar reservas'
          ELSE 'Quarto está em manutenção - não é possível criar reservas'
        END
      );
    END IF;

    -- Lock na tabela de reservas para prevenir race conditions
    -- Usar SELECT FOR UPDATE para obter lock exclusivo
    BEGIN
      -- Primeiro, tentar obter lock nas reservas conflitantes (sem COUNT)
      -- Isso garante que nenhuma outra transação pode modificar essas reservas
      PERFORM 1
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        )
      FOR UPDATE NOWAIT; -- Tenta obter lock, falha se não conseguir

      -- Agora que temos o lock, contar os conflitos
      SELECT COUNT(*) INTO v_conflict_count
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
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
        -- Lock não disponível (outra transação está criando reserva)
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Sistema ocupado. Por favor, tente novamente em alguns instantes.',
          'retry_after', 1
        );
    END;
  END IF;

  -- Se há categoria mas não quarto específico, verificar disponibilidade na categoria
  IF v_category_id IS NOT NULL AND v_room_id IS NULL THEN
    -- Contar quartos disponíveis na categoria
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.is_blocked = FALSE
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
          AND (
            (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          )
      );

    IF v_conflict_count = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Nenhum quarto disponível nesta categoria no período solicitado',
        'available_rooms', 0
      );
    END IF;
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
    created_by
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
    (p_reservation_data->>'created_by')::UUID
  )
  RETURNING id INTO v_reservation_id;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Outro erro (incluindo lock_not_available se não capturado no BEGIN/END interno)
    IF SQLSTATE = '55P03' THEN
      -- Lock not available
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Sistema ocupado. Por favor, tente novamente em alguns instantes.',
        'retry_after', 1
      );
    ELSE
      -- Outro erro
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
    END IF;
END;
$$;

-- Comentário
COMMENT ON FUNCTION public.create_reservation_with_lock IS 'Cria reserva com lock e validação atômica para prevenir race conditions';

