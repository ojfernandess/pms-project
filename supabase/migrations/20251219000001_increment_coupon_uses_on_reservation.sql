-- ============================================
-- INCREMENTAR USOS DE CUPOM QUANDO RESERVA É CRIADA
-- ============================================

-- Primeiro, atualizar a função create_reservation_with_lock para incluir coupon_id
-- Verificar se a função existe e adicionar coupon_id se necessário
DO $$
BEGIN
  -- Verificar se coupon_id já está na função
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'create_reservation_with_lock'
    AND p.prosrc LIKE '%coupon_id%'
  ) THEN
    -- A função será atualizada abaixo
    RAISE NOTICE 'Função create_reservation_with_lock precisa ser atualizada para incluir coupon_id';
  END IF;
END $$;

-- Criar função para incrementar current_uses quando uma reserva é criada com cupom
CREATE OR REPLACE FUNCTION public.increment_coupon_uses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se a reserva tem um coupon_id, incrementar current_uses
  IF NEW.coupon_id IS NOT NULL THEN
    UPDATE public.discount_coupons
    SET current_uses = current_uses + 1,
        updated_at = NOW()
    WHERE id = NEW.coupon_id
      AND (max_uses IS NULL OR current_uses < max_uses);
    
    -- Log para debug (opcional)
    RAISE NOTICE 'Cupom % usado na reserva %', NEW.coupon_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para incrementar usos quando reserva é criada
DROP TRIGGER IF EXISTS trigger_increment_coupon_uses ON public.reservations;
CREATE TRIGGER trigger_increment_coupon_uses
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  WHEN (NEW.coupon_id IS NOT NULL)
  EXECUTE FUNCTION public.increment_coupon_uses();

-- Comentários
COMMENT ON FUNCTION public.increment_coupon_uses() IS 'Incrementa current_uses do cupom quando uma reserva é criada com coupon_id';
COMMENT ON TRIGGER trigger_increment_coupon_uses ON public.reservations IS 'Trigger que incrementa current_uses do cupom quando uma reserva é criada';

-- Atualizar a função create_reservation_with_lock para incluir coupon_id
-- Primeiro, vamos verificar a estrutura atual da função
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
BEGIN
  -- Validar datas
  IF p_checkin_date >= p_checkout_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Data de check-in deve ser anterior à data de check-out'
    );
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
    BEGIN
      PERFORM 1
      FROM public.reservations
      WHERE room_id = v_room_id
        AND establishment_id = p_establishment_id
        AND status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
        AND (
          (checkin_date < p_checkout_date AND checkout_date > p_checkin_date)
        )
      FOR UPDATE NOWAIT;
      
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
      );
    
    IF v_available_rooms = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Nenhum quarto disponível nesta categoria no período solicitado',
        'available_rooms', 0
      );
    END IF;
    
    -- Buscar um quarto disponível
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
    COALESCE(p_reservation_data->>'channel', 'direct'),
    CASE 
      WHEN p_reservation_data->>'coupon_id' IS NOT NULL AND p_reservation_data->>'coupon_id' != '' 
      THEN (p_reservation_data->>'coupon_id')::UUID
      ELSE NULL
    END
  )
  RETURNING id INTO v_reservation_id;

  -- Retornar resultado incluindo o quarto atribuído
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'room_id', v_room_id,
    'available_rooms', v_available_rooms
  );
END;
$$;

-- Comentário atualizado
COMMENT ON FUNCTION public.create_reservation_with_lock IS 'Cria uma reserva com lock e inclui suporte para coupon_id';

