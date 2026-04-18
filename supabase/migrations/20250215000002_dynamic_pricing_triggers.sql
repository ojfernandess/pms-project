-- =====================================================
-- TRIGGERS: Enfileirar recálculo quando há mudança real
-- =====================================================
-- Regras dinâmicas só recalculam quando: nova reserva, cancelamento,
-- no-show, inventário, regra alterada, etc.

CREATE OR REPLACE FUNCTION public.enqueue_dynamic_pricing_recalc(
  p_establishment_id UUID,
  p_trigger_type TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
  v_settings JSONB;
  v_persist BOOLEAN := false;
BEGIN
  -- Só enfileirar se persist_dynamic_rates estiver habilitado
  SELECT rate_system_settings INTO v_settings
  FROM public.hotel_settings
  WHERE establishment_id = p_establishment_id
  LIMIT 1;
  
  v_persist := (v_settings->>'persist_dynamic_rates')::boolean = true
    OR v_settings->>'persist_dynamic_rates' = 'true';
  
  IF NOT v_persist THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.dynamic_pricing_queue (
    establishment_id,
    trigger_type,
    trigger_metadata,
    status,
    date_from,
    date_to,
    updated_at
  ) VALUES (
    p_establishment_id,
    p_trigger_type,
    p_metadata,
    'pending',
    COALESCE(p_date_from, CURRENT_DATE),
    COALESCE(p_date_to, CURRENT_DATE + 365),
    NOW()
  )
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

-- Trigger: Nova reserva criada
CREATE OR REPLACE FUNCTION public.trg_reservation_insert_dynamic_pricing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in DATE;
  v_check_out DATE;
BEGIN
  v_check_in := NEW.checkin_date;
  v_check_out := NEW.checkout_date;
  
  IF NEW.establishment_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  PERFORM public.enqueue_dynamic_pricing_recalc(
    NEW.establishment_id,
    'reservation_created',
    jsonb_build_object('reservation_id', NEW.id, 'category_id', NEW.category_id),
    v_check_in,
    v_check_out
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_insert_dynamic_pricing ON public.reservations;
CREATE TRIGGER trg_reservation_insert_dynamic_pricing
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reservation_insert_dynamic_pricing();

-- Trigger: Reserva cancelada
CREATE OR REPLACE FUNCTION public.trg_reservation_update_cancelled_dynamic_pricing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in DATE;
  v_check_out DATE;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled', 'no_show') THEN
    v_check_in := NEW.checkin_date;
    v_check_out := NEW.checkout_date;
    
    IF NEW.establishment_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    PERFORM public.enqueue_dynamic_pricing_recalc(
      NEW.establishment_id,
      CASE WHEN NEW.status = 'no_show' THEN 'no_show' ELSE 'reservation_cancelled' END,
      jsonb_build_object('reservation_id', NEW.id, 'category_id', NEW.category_id),
      v_check_in,
      v_check_out
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_update_cancelled_dynamic_pricing ON public.reservations;
CREATE TRIGGER trg_reservation_update_cancelled_dynamic_pricing
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reservation_update_cancelled_dynamic_pricing();

-- Trigger: Regra dinâmica alterada
CREATE OR REPLACE FUNCTION public.trg_dynamic_rule_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_dynamic_pricing_recalc(
    COALESCE(NEW.establishment_id, OLD.establishment_id),
    'rule_changed',
    jsonb_build_object('rule_id', COALESCE(NEW.id, OLD.id)),
    COALESCE(NEW.start_date, CURRENT_DATE),
    COALESCE(NEW.end_date, CURRENT_DATE + 365)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_dynamic_rule_insert_dynamic_pricing ON public.dynamic_pricing_rules;
DROP TRIGGER IF EXISTS trg_dynamic_rule_update_dynamic_pricing ON public.dynamic_pricing_rules;
DROP TRIGGER IF EXISTS trg_dynamic_rule_changed ON public.dynamic_pricing_rules;
CREATE TRIGGER trg_dynamic_rule_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.dynamic_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_dynamic_rule_changed();
