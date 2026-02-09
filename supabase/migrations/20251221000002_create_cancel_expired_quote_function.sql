-- Função para cancelar um quote expirado e suas reservas relacionadas
CREATE OR REPLACE FUNCTION public.cancel_expired_quote(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_reservation_ids UUID[];
  v_result JSONB;
BEGIN
  -- Buscar o quote
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND status IN ('pending', 'sent')
  FOR UPDATE;

  -- Se não encontrou o quote ou já está cancelado/convertido, retornar
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Quote não encontrado ou já processado'
    );
  END IF;

  -- Extrair reservation_ids do campo notes se existir
  IF v_quote.notes IS NOT NULL THEN
    DECLARE
      v_match TEXT;
      v_json_str TEXT;
      v_parsed JSONB;
    BEGIN
      v_match := substring(v_quote.notes from '<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->');
      IF v_match IS NOT NULL THEN
        v_json_str := trim(v_match);
        BEGIN
          v_parsed := v_json_str::jsonb;
          IF v_parsed ? 'reservation_ids' AND jsonb_typeof(v_parsed->'reservation_ids') = 'array' THEN
            SELECT ARRAY(
              SELECT jsonb_array_elements_text(v_parsed->'reservation_ids')
            ) INTO v_reservation_ids;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Se não conseguir parsear, continuar sem cancelar reservas
          v_reservation_ids := ARRAY[]::UUID[];
        END;
      END IF;
    END;
  END IF;

  -- Cancelar reservas relacionadas se existirem
  IF array_length(v_reservation_ids, 1) > 0 THEN
    UPDATE public.reservations
    SET 
      status = 'cancelled'::reservation_status,
      updated_at = NOW()
    WHERE id = ANY(v_reservation_ids)
      AND status IN ('pending', 'confirmed')
      AND payment_status = 'pending'::payment_status;
  END IF;

  -- Atualizar o quote para 'expired'
  UPDATE public.quotes
  SET 
    status = 'expired'::quote_status,
    updated_at = NOW()
  WHERE id = p_quote_id;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Quote cancelado com sucesso',
    'reservations_cancelled', COALESCE(array_length(v_reservation_ids, 1), 0)
  );
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.cancel_expired_quote IS 'Cancela um quote expirado e todas as reservas relacionadas que ainda estão pendentes de pagamento';

