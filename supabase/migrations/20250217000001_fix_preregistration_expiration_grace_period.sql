-- Evitar cancelar pré-reservas recém-criadas (grace period de 2 minutos)
-- Resolve: cancelamento imediato ao criar pré-reserva no mapa (race condition + possível bug de timezone)
-- A comparação expiration_date <= NOW() permanece correta; só não cancelamos se criada há menos de 2 min

CREATE OR REPLACE FUNCTION public.cancel_expired_preregistrations()
RETURNS INTEGER AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_reservation RECORD;
  v_establishment_id UUID;
  v_guest_name TEXT;
  v_current_time TIMESTAMPTZ;
  v_grace_cutoff TIMESTAMPTZ;
  v_total_preregistrations INTEGER := 0;
  v_expired_count INTEGER := 0;
  v_template_id UUID;
  v_recipient_email TEXT;
  v_recipient_name TEXT;
  v_subject TEXT;
  v_body_html TEXT;
  v_hotel_name TEXT;
  v_hotel_email TEXT;
  v_hotel_phone TEXT;
  v_hotel_address TEXT;
  v_hotel_website TEXT;
  v_hotel_logo TEXT;
  v_site_logo TEXT;
  v_checkin_time TEXT;
  v_checkout_time TEXT;
  v_hotel_timezone TEXT;
BEGIN
  v_current_time := NOW();
  -- Não cancelar pré-reservas criadas nos últimos 2 minutos (evitar race com criação + conversão de timezone)
  v_grace_cutoff := v_current_time - INTERVAL '2 minutes';
  
  -- Buscar e cancelar todas as pré-reservas expiradas (que não estejam no grace period)
  FOR v_reservation IN
    SELECT 
      r.id, 
      r.reservation_code, 
      r.expiration_date,
      r.created_at,
      r.establishment_id,
      r.guest_name,
      r.status,
      r.checkin_date,
      r.checkout_date,
      r.total_amount,
      c.id as guest_id,
      c.full_name as guest_full_name,
      c.email as guest_email,
      c2.id as client_id,
      c2.full_name as financial_full_name,
      c2.email as financial_email,
      rm.room_number,
      rc.name as category_name
    FROM public.reservations r
    LEFT JOIN public.clients c ON c.id = r.guest_id
    LEFT JOIN public.clients c2 ON c2.id = r.client_id
    LEFT JOIN public.rooms rm ON rm.id = r.room_id
    LEFT JOIN public.room_categories rc ON rc.id = r.category_id
    WHERE r.status = 'preregistration'
      AND r.expiration_date IS NOT NULL
      AND r.expiration_date <= v_current_time
      -- Grace period: NÃO cancelar se foi criada há menos de 2 minutos
      -- Só cancelar quando created_at existe E é anterior ao cutoff (reserva antiga)
      AND (r.created_at IS NOT NULL AND r.created_at < v_grace_cutoff)
    ORDER BY r.expiration_date ASC
  LOOP
    UPDATE public.reservations
    SET 
      status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 
              'Cancelada automaticamente: pré-reserva expirada em ' || 
              TO_CHAR(v_reservation.expiration_date AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI:SS') ||
              ' UTC'
    WHERE id = v_reservation.id
      AND status = 'preregistration';

    IF FOUND THEN
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
          RAISE WARNING 'Erro ao criar notificação para pré-reserva %: %', v_reservation.reservation_code, SQLERRM;
        END;
      END IF;
      
      BEGIN
          SELECT id, subject, body_html INTO v_template_id, v_subject, v_body_html
          FROM public.email_templates
          WHERE event_type = 'preregistration.expired'::email_event_type
            AND is_active = true
          ORDER BY updated_at DESC
          LIMIT 1;
          
          IF v_template_id IS NOT NULL THEN
            v_recipient_email := COALESCE(v_reservation.guest_email, v_reservation.financial_email);
            v_recipient_name := COALESCE(
              v_reservation.guest_full_name,
              v_reservation.financial_full_name,
              v_reservation.guest_name,
              'Hóspede'
            );
            
            IF v_recipient_email IS NOT NULL THEN
              SELECT 
                COALESCE(name, '') as hotel_name,
                COALESCE(email, '') as hotel_email,
                COALESCE(
                  CASE 
                    WHEN phone_ddi IS NOT NULL AND phone_number IS NOT NULL THEN
                      phone_ddi || ' ' || phone_number
                    WHEN phone_number IS NOT NULL THEN
                      phone_number
                    ELSE ''
                  END, ''
                ) as hotel_phone,
                COALESCE(
                  CASE 
                    WHEN street IS NOT NULL OR city IS NOT NULL THEN
                      TRIM(
                        COALESCE(NULLIF(street, '') || ', ', '') || 
                        COALESCE(NULLIF(number, '') || ', ', '') || 
                        COALESCE(NULLIF(neighborhood, '') || ', ', '') || 
                        COALESCE(NULLIF(city, '') || ', ', '') || 
                        COALESCE(NULLIF(state, '') || ', ', '') || 
                        COALESCE(NULLIF(zip_code, ''), '')
                      )
                    ELSE ''
                  END, ''
                ) as hotel_address,
                COALESCE(website, '') as hotel_website,
                COALESCE(logo_url, '') as hotel_logo,
                COALESCE(TO_CHAR(checkin_time, 'HH24:MI'), '14:00') as checkin_time,
                COALESCE(TO_CHAR(checkout_time, 'HH24:MI'), '12:00') as checkout_time,
                COALESCE(timezone, 'America/Sao_Paulo') as hotel_timezone
              INTO v_hotel_name, v_hotel_email, v_hotel_phone, v_hotel_address, v_hotel_website, v_hotel_logo, v_checkin_time, v_checkout_time, v_hotel_timezone
              FROM public.hotel_settings
              WHERE establishment_id = v_reservation.establishment_id
              LIMIT 1;
              
              v_hotel_timezone := COALESCE(NULLIF(v_hotel_timezone, ''), 'America/Sao_Paulo');
              
              SELECT COALESCE(logo_url, '') INTO v_site_logo
              FROM public.site_settings
              LIMIT 1;
              
              v_hotel_logo := COALESCE(NULLIF(v_hotel_logo, ''), NULLIF(v_site_logo, ''), '');
              v_hotel_name := COALESCE(NULLIF(v_hotel_name, ''), 'Hotel');
              v_checkin_time := COALESCE(NULLIF(v_checkin_time, ''), '14:00');
              v_checkout_time := COALESCE(NULLIF(v_checkout_time, ''), '12:00');
              IF v_checkin_time LIKE '%:%:%' THEN
                v_checkin_time := SUBSTRING(v_checkin_time FROM 1 FOR 5);
              END IF;
              IF v_checkout_time LIKE '%:%:%' THEN
                v_checkout_time := SUBSTRING(v_checkout_time FROM 1 FOR 5);
              END IF;
              
              PERFORM public.insert_email_queue(
                p_template_id := v_template_id,
                p_event_type := 'preregistration.expired',
                p_recipient_email := v_recipient_email,
                p_recipient_name := v_recipient_name,
                p_subject := v_subject,
                p_body_html := v_body_html,
                p_reservation_id := v_reservation.id,
                p_variables := jsonb_build_object(
                  'reservation_code', v_reservation.reservation_code,
                  'guest_name', v_recipient_name,
                  'checkin_date', TO_CHAR(v_reservation.checkin_date, 'DD/MM/YYYY'),
                  'checkout_date', TO_CHAR(v_reservation.checkout_date, 'DD/MM/YYYY'),
                  'checkin_time', v_checkin_time,
                  'checkout_time', v_checkout_time,
                  'total_amount', COALESCE(ROUND(v_reservation.total_amount::NUMERIC, 2)::TEXT, '0,00'),
                  'room_number', COALESCE(v_reservation.room_number, ''),
                  'category_name', COALESCE(v_reservation.category_name, ''),
                  'expiration_date', TO_CHAR(
                    timezone(v_hotel_timezone, v_reservation.expiration_date),
                    'DD/MM/YYYY HH24:MI'
                  ),
                  'hotel_name', COALESCE(v_hotel_name, ''),
                  'hotel_email', COALESCE(v_hotel_email, ''),
                  'hotel_phone', COALESCE(v_hotel_phone, ''),
                  'hotel_address', COALESCE(v_hotel_address, ''),
                  'hotel_website', COALESCE(v_hotel_website, ''),
                  'hotel_logo', v_hotel_logo,
                  'logo_url', v_hotel_logo
                ),
                p_priority := 1
              );
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Erro ao enviar email para pré-reserva %: %', v_reservation.reservation_code, SQLERRM;
        END;
      
      v_cancelled_count := v_cancelled_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cancel_expired_preregistrations() IS 
'Cancela automaticamente pré-reservas que expiraram. Grace period de 2 minutos: não cancela pré-reservas recém-criadas. Compara expiration_date (TIMESTAMPTZ) com NOW(). Retorna o número de pré-reservas canceladas.';
