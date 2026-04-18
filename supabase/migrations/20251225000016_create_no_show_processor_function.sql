-- Migration: Criar função RPC para processar no-shows automaticamente
-- Esta função deve ser executada periodicamente (cron job)

CREATE OR REPLACE FUNCTION public.process_no_shows(
  p_establishment_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_processed_count INTEGER := 0;
  v_reservation RECORD;
  v_checkin_deadline TIMESTAMP WITH TIME ZONE;
  v_current_time TIMESTAMP WITH TIME ZONE;
BEGIN
  v_current_time := NOW();
  
  -- Buscar reservas confirmadas com check-in no passado
  FOR v_reservation IN
    SELECT 
      r.id,
      r.checkin_date,
      r.status,
      r.establishment_id,
      r.channel
    FROM public.reservations r
    WHERE r.status = 'confirmed'
      AND r.checkin_date <= v_current_time
      AND (p_establishment_id IS NULL OR r.establishment_id = p_establishment_id)
      AND r.cancelled_at IS NULL
      AND r.no_show_at IS NULL
  LOOP
    -- Calcular deadline de check-in (18:00 do dia do check-in)
    v_checkin_deadline := DATE_TRUNC('day', v_reservation.checkin_date) + INTERVAL '18 hours';
    
    -- Verificar se passou do deadline
    IF v_current_time > v_checkin_deadline THEN
      -- Marcar como no-show
      UPDATE public.reservations
      SET 
        status = 'no_show',
        no_show_at = v_current_time
      WHERE id = v_reservation.id;
      
      v_processed_count := v_processed_count + 1;
      
      -- Log será criado pela aplicação ao processar no-show
      -- (aplicação calculará multa e criará log)
    END IF;
  END LOOP;
  
  RETURN v_processed_count;
END;
$$;

-- Comentário
COMMENT ON FUNCTION public.process_no_shows IS 'Processa no-shows automaticamente. Deve ser executada periodicamente via cron job.';

