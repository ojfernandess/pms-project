-- Atualizar função cancel_expired_preregistrations para usar timezone do hotel
-- Isso garante que a comparação de datas seja feita no timezone correto

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
  v_hotel_timezone TEXT;
BEGIN
  -- Obter o timestamp atual em UTC
  v_current_time := NOW();
  
  -- Contar total de pré-reservas com expiration_date
  SELECT COUNT(*) INTO v_total_preregistrations
  FROM public.reservations
  WHERE status = 'preregistration'
    AND expiration_date IS NOT NULL;
  
  -- Contar quantas estão expiradas usando comparação direta
  SELECT COUNT(*) INTO v_expired_count
  FROM public.reservations
  WHERE status = 'preregistration'
    AND expiration_date IS NOT NULL
    AND expiration_date <= v_current_time;
  
  -- Log inicial
  RAISE NOTICE '🔍 Verificando pré-reservas expiradas';
  RAISE NOTICE '   Hora atual (UTC): %', v_current_time;
  RAISE NOTICE '   Total de pré-reservas com expiration_date: %', v_total_preregistrations;
  RAISE NOTICE '   Pré-reservas expiradas encontradas: %', v_expired_count;
  
  -- Buscar e cancelar todas as pré-reservas expiradas
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
      -- Comparação direta: expiration_date <= NOW()
      -- expiration_date já está em UTC, então comparamos diretamente com NOW() (UTC)
      AND r.expiration_date <= v_current_time
    ORDER BY r.expiration_date ASC
  LOOP
    -- Obter timezone do hotel para este estabelecimento (se disponível)
    SELECT timezone INTO v_hotel_timezone
    FROM public.hotel_settings
    WHERE establishment_id = v_reservation.establishment_id
    LIMIT 1;
    
    -- Se não encontrar timezone, usar padrão
    v_hotel_timezone := COALESCE(v_hotel_timezone, 'America/Sao_Paulo');
    
    -- Log antes de cancelar
    RAISE NOTICE '🔴 Cancelando pré-reserva: %', v_reservation.reservation_code;
    RAISE NOTICE '   Status atual: %', v_reservation.status;
    RAISE NOTICE '   Expira em (UTC): %', v_reservation.expiration_date;
    RAISE NOTICE '   Expira em (%): %', v_hotel_timezone, 
      (v_reservation.expiration_date AT TIME ZONE 'UTC' AT TIME ZONE v_hotel_timezone);
    RAISE NOTICE '   Agora (UTC): %', v_current_time;
    RAISE NOTICE '   Agora (%): %', v_hotel_timezone,
      (v_current_time AT TIME ZONE 'UTC' AT TIME ZONE v_hotel_timezone);
    RAISE NOTICE '   Diferença: % segundos', EXTRACT(EPOCH FROM (v_current_time - v_reservation.expiration_date))::INTEGER;
    
    -- Cancelar a pré-reserva usando UPDATE direto
    UPDATE public.reservations
    SET 
      status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 
              'Cancelada automaticamente: pré-reserva expirada em ' || 
              TO_CHAR(v_reservation.expiration_date AT TIME ZONE 'UTC' AT TIME ZONE v_hotel_timezone, 'DD/MM/YYYY HH24:MI:SS') ||
              ' (' || v_hotel_timezone || ')'
    WHERE id = v_reservation.id
      AND status = 'preregistration'; -- Garantir que só cancela se ainda for pré-reserva
    
    -- Verificar se o update foi bem-sucedido
    IF FOUND THEN
      -- Criar notificação para o estabelecimento
      v_establishment_id := v_reservation.establishment_id;
      v_guest_name := COALESCE(
        v_reservation.guest_name,
        v_reservation.guest_full_name,
        v_reservation.financial_full_name,
        'Hóspede'
      );
      
      IF v_establishment_id IS NOT NULL THEN
        BEGIN
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
        EXCEPTION WHEN OTHERS THEN
          -- Se houver erro ao criar notificação, continuar mesmo assim
          RAISE WARNING 'Erro ao criar notificação para pré-reserva %: %', v_reservation.reservation_code, SQLERRM;
        END;
      END IF;
      
      v_cancelled_count := v_cancelled_count + 1;
      RAISE NOTICE '✅ Pré-reserva % cancelada com sucesso', v_reservation.reservation_code;
    ELSE
      RAISE WARNING '⚠️ Não foi possível cancelar pré-reserva % (status pode ter mudado)', v_reservation.reservation_code;
    END IF;
  END LOOP;
  
  -- Log final
  IF v_cancelled_count > 0 THEN
    RAISE NOTICE '✅ Total de pré-reservas canceladas: %', v_cancelled_count;
  ELSE
    RAISE NOTICE 'ℹ️ Nenhuma pré-reserva expirada encontrada para cancelar';
  END IF;
  
  RETURN v_cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário da função
COMMENT ON FUNCTION public.cancel_expired_preregistrations() IS 
'Cancela automaticamente pré-reservas que expiraram. Compara expiration_date (TIMESTAMPTZ em UTC) com NOW() em UTC. Usa timezone do hotel apenas para logs e mensagens. Retorna o número de pré-reservas canceladas.';

