-- Função para cancelar automaticamente pré-reservas expiradas
-- Esta função deve ser executada periodicamente (ex: via pg_cron ou job externo)

CREATE OR REPLACE FUNCTION public.cancel_expired_preregistrations()
RETURNS INTEGER AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_reservation RECORD;
  v_establishment_id UUID;
  v_guest_name TEXT;
BEGIN
  -- Buscar todas as pré-reservas expiradas que ainda não foram canceladas
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
      -- Só cancelar se a data/hora de expiração já passou
      -- Usar < ao invés de <= para garantir que só cancele após o horário exato
      AND r.expiration_date < NOW()
  LOOP
    -- Cancelar a pré-reserva
    UPDATE public.reservations
    SET 
      status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 
              'Cancelada automaticamente: pré-reserva expirada em ' || 
              TO_CHAR(v_reservation.expiration_date, 'DD/MM/YYYY HH24:MI')
    WHERE id = v_reservation.id;
    
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
    
    RAISE NOTICE 'Pré-reserva % cancelada automaticamente (expirou em %)', 
      v_reservation.reservation_code, 
      v_reservation.expiration_date;
  END LOOP;
  
  RETURN v_cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário da função
COMMENT ON FUNCTION public.cancel_expired_preregistrations() IS 
'Cancela automaticamente pré-reservas que expiraram. Retorna o número de pré-reservas canceladas.';

-- Criar índice para melhorar performance da busca de pré-reservas expiradas
CREATE INDEX IF NOT EXISTS idx_reservations_expired_preregistrations 
ON public.reservations(status, expiration_date) 
WHERE status = 'preregistration' AND expiration_date IS NOT NULL;

-- Se pg_cron estiver disponível, configurar execução automática a cada hora
-- Descomente as linhas abaixo se quiser usar pg_cron:
/*
SELECT cron.schedule(
  'cancel-expired-preregistrations',
  '0 * * * *', -- Executar a cada hora
  $$SELECT public.cancel_expired_preregistrations();$$
);
*/

