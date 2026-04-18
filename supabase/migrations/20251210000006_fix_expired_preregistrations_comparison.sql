-- Melhorar a função de cancelamento de pré-reservas expiradas
-- Garantir que a comparação de datas funcione corretamente com timezone

CREATE OR REPLACE FUNCTION public.cancel_expired_preregistrations()
RETURNS INTEGER AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_reservation RECORD;
  v_establishment_id UUID;
  v_guest_name TEXT;
  v_current_time TIMESTAMPTZ;
  v_total_preregistrations INTEGER := 0;
  v_expired_count INTEGER := 0;
BEGIN
  -- Obter o timestamp atual em UTC
  v_current_time := NOW();
  
  -- Contar total de pré-reservas com expiration_date
  SELECT COUNT(*) INTO v_total_preregistrations
  FROM public.reservations
  WHERE status = 'preregistration'
    AND expiration_date IS NOT NULL;
  
  -- Contar quantas estão expiradas
  SELECT COUNT(*) INTO v_expired_count
  FROM public.reservations
  WHERE status = 'preregistration'
    AND expiration_date IS NOT NULL
    AND expiration_date <= v_current_time;
  
  -- Debug: Log para verificar o que está sendo comparado
  RAISE NOTICE 'Verificando pré-reservas expiradas. Hora atual (UTC): %. Total de pré-reservas: %. Expiradas: %', 
    v_current_time, v_total_preregistrations, v_expired_count;
  
  -- Debug: Listar todas as pré-reservas com expiration_date para diagnóstico
  FOR v_reservation IN
    SELECT 
      r.id, 
      r.reservation_code, 
      r.expiration_date,
      r.establishment_id,
      r.guest_name,
      c.full_name as guest_full_name,
      c2.full_name as financial_full_name
    FROM public.reservations r
    LEFT JOIN public.clients c ON c.id = r.guest_id
    LEFT JOIN public.clients c2 ON c2.id = r.client_id
    WHERE r.status = 'preregistration'
      AND r.expiration_date IS NOT NULL
    ORDER BY r.expiration_date ASC
    LIMIT 10
  LOOP
    RAISE NOTICE 'Pré-reserva encontrada: % - Expira em: % - Agora: % - Expirada: %', 
      v_reservation.reservation_code,
      v_reservation.expiration_date,
      v_current_time,
      (v_reservation.expiration_date <= v_current_time);
  END LOOP;
  
  -- Buscar todas as pré-reservas expiradas que ainda não foram canceladas
  -- IMPORTANTE: Verificar todas as pré-reservas primeiro para debug
  FOR v_reservation IN
    SELECT 
      r.id, 
      r.reservation_code, 
      r.expiration_date,
      r.establishment_id,
      r.guest_name,
      r.status,
      c.full_name as guest_full_name,
      c2.full_name as financial_full_name
    FROM public.reservations r
    LEFT JOIN public.clients c ON c.id = r.guest_id
    LEFT JOIN public.clients c2 ON c2.id = r.client_id
    WHERE r.status = 'preregistration'
      AND r.expiration_date IS NOT NULL
      -- Comparar usando <= para garantir que cancele exatamente no horário ou após
      -- TIMESTAMPTZ compara automaticamente em UTC
      AND r.expiration_date <= v_current_time
    ORDER BY r.expiration_date ASC
  LOOP
    -- Debug: Verificar se encontrou a reserva antes de cancelar
    RAISE NOTICE '🔍 Encontrada pré-reserva para cancelar: % - Status: % - Expira em: % - Agora: %', 
      v_reservation.reservation_code,
      v_reservation.status,
      v_reservation.expiration_date,
      v_current_time;
    -- Debug: Log antes de cancelar
    RAISE NOTICE '🔴 Cancelando pré-reserva: % (expirou em: %, agora: %, diferença: % segundos)', 
      v_reservation.reservation_code, 
      v_reservation.expiration_date,
      v_current_time,
      EXTRACT(EPOCH FROM (v_current_time - v_reservation.expiration_date))::INTEGER;
    
    -- Cancelar a pré-reserva
    UPDATE public.reservations
    SET 
      status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 
              'Cancelada automaticamente: pré-reserva expirada em ' || 
              TO_CHAR(v_reservation.expiration_date AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') ||
              ' (UTC)'
    WHERE id = v_reservation.id;
    
    -- Verificar se o update foi bem-sucedido
    IF NOT FOUND THEN
      RAISE WARNING '⚠️ Não foi possível atualizar a pré-reserva %', v_reservation.reservation_code;
    ELSE
      RAISE NOTICE '✅ Pré-reserva % atualizada com sucesso', v_reservation.reservation_code;
    END IF;
    
    -- Criar notificação para o estabelecimento
    v_establishment_id := v_reservation.establishment_id;
    v_guest_name := COALESCE(
      v_reservation.guest_name,
      v_reservation.guest_full_name,
      v_reservation.financial_full_name,
      'Hóspede'
    );
    
    IF v_establishment_id IS NOT NULL THEN
      -- Criar notificação usando a função existente
      PERFORM public.create_notification_for_establishment(
        p_establishment_id := v_establishment_id,
        p_type := 'reservation_cancelled',
        p_title := 'Pré-reserva Cancelada',
        p_message := 'Pré-reserva ' || v_reservation.reservation_code || 
                     ' de ' || v_guest_name || 
                     ' foi cancelada automaticamente por expiração',
        p_priority := 'medium',
        p_metadata := jsonb_build_object(
          'reservation_id', v_reservation.id,
          'reservation_code', v_reservation.reservation_code,
          'cancellation_reason', 'expired',
          'expiration_date', v_reservation.expiration_date
        )
      );
    END IF;
    
    v_cancelled_count := v_cancelled_count + 1;
    
    RAISE NOTICE '✅ Pré-reserva % cancelada automaticamente (expirou em %, atual: %)', 
      v_reservation.reservation_code, 
      v_reservation.expiration_date,
      v_current_time;
  END LOOP;
  
  -- Log final
  IF v_cancelled_count > 0 THEN
    RAISE NOTICE 'Total de pré-reservas canceladas: %', v_cancelled_count;
  ELSE
    RAISE NOTICE 'Nenhuma pré-reserva expirada encontrada para cancelar';
  END IF;
  
  RETURN v_cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário da função
COMMENT ON FUNCTION public.cancel_expired_preregistrations() IS 
'Cancela automaticamente pré-reservas que expiraram. Retorna o número de pré-reservas canceladas. Compara expiration_date com NOW() usando timezone-aware comparison.';

