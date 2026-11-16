-- ============================================
-- CORRIGIR VERIFICAÇÃO DE CONFLITOS DE RESERVA
-- ============================================
-- Este migration corrige a lógica de verificação de conflitos para permitir
-- criação de múltiplas reservas sequenciais para o mesmo cliente no mesmo período

-- Atualizar a função create_reservation_with_lock para melhorar a verificação de conflitos
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_room_id UUID;
  v_category_id UUID;
  v_available_rooms INTEGER;
  v_lock_key TEXT;
  v_lock_acquired BOOLEAN;
  v_room_is_blocked BOOLEAN;
  v_room_status TEXT;
  v_conflict_count INTEGER;
  v_client_id UUID;
BEGIN
  -- Validar datas
  IF p_checkin_date >= p_checkout_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Data de check-in deve ser anterior à data de check-out'
    );
  END IF;

  -- Extrair client_id do JSONB
  IF p_reservation_data->>'client_id' IS NOT NULL THEN
    v_client_id := (p_reservation_data->>'client_id')::UUID;
  END IF;

  -- Obter category_id
  IF p_category_id IS NOT NULL THEN
    v_category_id := p_category_id;
  ELSIF p_reservation_data->>'category_id' IS NOT NULL THEN
    v_category_id := (p_reservation_data->>'category_id')::UUID;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'category_id é obrigatório'
    );
  END IF;

  -- Verificar disponibilidade e atribuir quarto se necessário
  IF p_room_id IS NOT NULL THEN
    -- Quarto específico fornecido: verificar apenas esse quarto
    v_room_id := p_room_id;
    
    -- Verificar se quarto está bloqueado ou em manutenção
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
    
    -- Verificar se está bloqueado
    IF COALESCE(v_room_is_blocked, FALSE) = TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está interditado - não é possível criar reservas'
      );
    END IF;
    
    -- Verificar se está em manutenção
    IF v_room_status = 'maintenance' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Quarto está em manutenção - não é possível criar reservas'
      );
    END IF;
    
    -- Verificar conflitos de reserva com lock
    -- Excluir reservas criadas recentemente (últimos 60 segundos) pelo mesmo cliente no mesmo período
    -- Isso evita que reservas criadas na mesma sessão sejam consideradas como conflito
    BEGIN
      -- Tentar fazer lock apenas em reservas que não foram criadas recentemente pelo mesmo cliente
      PERFORM 1
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        )
        -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
        -- Usar lógica OR para evitar problemas com NULL
        AND (
          v_client_id IS NULL
          OR client_id IS NULL
          OR client_id != v_client_id
          OR checkin_date != p_checkin_date
          OR checkout_date != p_checkout_date
          OR created_at <= NOW() - INTERVAL '60 seconds'
        )
      FOR UPDATE NOWAIT;
      
      -- Contar conflitos excluindo reservas criadas recentemente pelo mesmo cliente
      SELECT COUNT(*) INTO v_conflict_count
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        )
        -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
        AND (
          v_client_id IS NULL
          OR client_id IS NULL
          OR client_id != v_client_id
          OR checkin_date != p_checkin_date
          OR checkout_date != p_checkout_date
          OR created_at <= NOW() - INTERVAL '60 seconds'
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
    
    -- Se chegou aqui, o quarto está disponível
    v_available_rooms := 1;
  ELSE
    -- Sem quarto específico: buscar quarto disponível automaticamente na categoria
    -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
    SELECT COUNT(*) INTO v_available_rooms
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.establishment_id = p_establishment_id
      AND (r.is_blocked IS NULL OR r.is_blocked = FALSE)
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
          AND (
            (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          )
          -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
          AND (
            v_client_id IS NULL
            OR res.client_id IS NULL
            OR res.client_id != v_client_id
            OR res.checkin_date != p_checkin_date
            OR res.checkout_date != p_checkout_date
            OR res.created_at <= NOW() - INTERVAL '60 seconds'
          )
      );
    
    IF v_available_rooms = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Nenhum quarto disponível nesta categoria no período solicitado',
        'available_rooms', 0
      );
    END IF;
    
    -- Buscar um quarto disponível
    -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
    SELECT id INTO v_room_id
    FROM public.rooms r
    WHERE r.category_id = v_category_id
      AND r.establishment_id = p_establishment_id
      AND (r.is_blocked IS NULL OR r.is_blocked = FALSE)
      AND r.status IN ('available', 'cleaning')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations res
        WHERE res.room_id = r.id
          AND res.establishment_id = p_establishment_id
          AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
          AND (
            (res.checkin_date < p_checkout_date AND res.checkout_date > p_checkin_date)
          )
          -- Excluir reservas criadas recentemente pelo mesmo cliente no mesmo período
          AND (
            v_client_id IS NULL
            OR res.client_id IS NULL
            OR res.client_id != v_client_id
            OR res.checkin_date != p_checkin_date
            OR res.checkout_date != p_checkout_date
            OR res.created_at <= NOW() - INTERVAL '60 seconds'
          )
      )
    LIMIT 1;
  END IF;

  -- Criar a reserva (incluindo coupon_id se presente)
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
    channel,
    coupon_id
  )
  VALUES (
    p_establishment_id,
    v_room_id,
    v_category_id,
    p_checkin_date,
    p_checkout_date,
    COALESCE((p_reservation_data->>'client_id')::UUID, NULL),
    COALESCE((p_reservation_data->>'guest_id')::UUID, NULL),
    p_reservation_data->>'guest_name',
    COALESCE((p_reservation_data->>'adults')::INTEGER, 1),
    COALESCE((p_reservation_data->>'children')::INTEGER, 0),
    COALESCE((p_reservation_data->>'total_amount')::NUMERIC, 0),
    COALESCE((p_reservation_data->>'paid_amount')::NUMERIC, 0),
    CASE 
      WHEN p_reservation_data->>'payment_status' IS NOT NULL 
      THEN (p_reservation_data->>'payment_status')::payment_status 
      ELSE 'pending'::payment_status 
    END,
    CASE 
      WHEN p_reservation_data->>'status' IS NOT NULL 
      THEN (p_reservation_data->>'status')::reservation_status 
      ELSE 'pending'::reservation_status 
    END,
    p_reservation_data->>'notes',
    COALESCE((p_reservation_data->>'checkin_time')::TIME, NULL),
    COALESCE((p_reservation_data->>'checkout_time')::TIME, NULL),
    COALESCE((p_reservation_data->>'pricing_plan_id')::UUID, NULL),
    COALESCE((p_reservation_data->>'created_by')::UUID, NULL),
    CASE
      WHEN NULLIF(trim(p_reservation_data->>'expiration_date'), '') IS NULL THEN NULL
      ELSE (p_reservation_data->>'expiration_date')::timestamptz
    END,
    COALESCE(p_reservation_data->>'channel', 'direct'),
    COALESCE((p_reservation_data->>'coupon_id')::UUID, NULL)
  )
  RETURNING id INTO v_reservation_id;

  -- Retornar sucesso com ID da reserva criada
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'room_id', v_room_id,
    'category_id', v_category_id
  );
END;
$$;

-- Comentários
COMMENT ON FUNCTION public.create_reservation_with_lock(JSONB, DATE, DATE, UUID, UUID, UUID) IS 
'Cria uma reserva com verificação de conflitos e lock. Exclui reservas criadas recentemente (60 segundos) pelo mesmo cliente no mesmo período para permitir criação de múltiplas reservas sequenciais.';

