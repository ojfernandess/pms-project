-- Migration: Geração Automática de Contas a Receber a partir de Reservas
-- Data: 2025-01-26
-- Descrição: Trigger para criar automaticamente conta a receber quando reserva é confirmada

-- ============================================
-- FUNÇÃO: Criar conta a receber automaticamente
-- ============================================
CREATE OR REPLACE FUNCTION auto_create_receivable_from_reservation()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable_exists BOOLEAN;
  v_guest_name TEXT;
BEGIN
  -- Apenas processar se status for 'confirmed' ou 'checkedin'
  IF NEW.status NOT IN ('confirmed', 'checkedin') THEN
    RETURN NEW;
  END IF;

  -- Verificar se já existe conta a receber para esta reserva
  SELECT EXISTS(
    SELECT 1 
    FROM public.accounts_receivable 
    WHERE reservation_id = NEW.id 
      AND origin = 'reservation'
      AND status != 'cancelled'
  ) INTO v_receivable_exists;

  -- Se já existe, não criar novamente
  IF v_receivable_exists THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do hóspede
  SELECT full_name INTO v_guest_name
  FROM public.clients
  WHERE id = COALESCE(NEW.guest_id, NEW.client_id)
  LIMIT 1;

  -- Criar conta a receber
  INSERT INTO public.accounts_receivable (
    establishment_id,
    reservation_id,
    client_id,
    description,
    amount,
    due_date,
    origin,
    type,
    status,
    metadata,
    created_by
  ) VALUES (
    NEW.establishment_id,
    NEW.id,
    COALESCE(NEW.client_id, NEW.guest_id),
    COALESCE(
      'Reserva ' || NEW.reservation_code || ' - ' || COALESCE(v_guest_name, NEW.guest_name, 'Hóspede'),
      'Reserva ' || NEW.reservation_code
    ),
    COALESCE(NEW.total_amount, 0),
    NEW.checkin_date, -- Vencimento no check-in
    'reservation',
    'reservation',
    CASE 
      WHEN NEW.paid_amount >= NEW.total_amount THEN 'paid'
      WHEN NEW.paid_amount > 0 THEN 'partial'
      ELSE 'pending'
    END,
    jsonb_build_object(
      'reservation_code', NEW.reservation_code,
      'checkin_date', NEW.checkin_date,
      'checkout_date', NEW.checkout_date,
      'channel', NEW.channel
    ),
    NEW.created_by
  );

  -- Se já tem pagamento, atualizar conta a receber
  IF NEW.paid_amount > 0 THEN
    UPDATE public.accounts_receivable
    SET paid_amount = NEW.paid_amount,
        status = CASE 
          WHEN NEW.paid_amount >= NEW.total_amount THEN 'paid'
          ELSE 'partial'
        END,
        paid_date = CASE 
          WHEN NEW.paid_amount >= NEW.total_amount THEN CURRENT_DATE
          ELSE NULL
        END
    WHERE reservation_id = NEW.id 
      AND origin = 'reservation'
      AND status != 'cancelled';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Após inserção de reserva
-- ============================================
DROP TRIGGER IF EXISTS trigger_auto_create_receivable_on_reservation_insert ON public.reservations;

CREATE TRIGGER trigger_auto_create_receivable_on_reservation_insert
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  WHEN (NEW.status IN ('confirmed', 'checkedin'))
  EXECUTE FUNCTION auto_create_receivable_from_reservation();

-- ============================================
-- TRIGGER: Após atualização de reserva
-- ============================================
DROP TRIGGER IF EXISTS trigger_auto_create_receivable_on_reservation_update ON public.reservations;

CREATE TRIGGER trigger_auto_create_receivable_on_reservation_update
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  WHEN (
    -- Criar se mudou para confirmed/checkedin
    (NEW.status IN ('confirmed', 'checkedin') AND OLD.status NOT IN ('confirmed', 'checkedin'))
    OR
    -- Atualizar se mudou valor ou pagamento
    (NEW.status IN ('confirmed', 'checkedin') AND (
      NEW.total_amount != OLD.total_amount 
      OR NEW.paid_amount != OLD.paid_amount
    ))
  )
  EXECUTE FUNCTION auto_create_receivable_from_reservation();

-- ============================================
-- FUNÇÃO: Sincronizar pagamentos com contas a receber
-- ============================================
CREATE OR REPLACE FUNCTION sync_receivable_on_payment()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_status TEXT;
  v_reservation_total DECIMAL(10,2);
  v_reservation_paid DECIMAL(10,2);
BEGIN
  -- Buscar dados da reserva
  SELECT status, total_amount, paid_amount
  INTO v_reservation_status, v_reservation_total, v_reservation_paid
  FROM public.reservations
  WHERE id = NEW.reservation_id;

  -- Se reserva não está confirmada, não fazer nada
  IF v_reservation_status NOT IN ('confirmed', 'checkedin', 'checkedout') THEN
    RETURN NEW;
  END IF;

  -- Verificar se já existe conta a receber
  -- Se não existir, será criada pelo trigger de reserva
  -- Aqui apenas atualizamos se já existir

  -- Atualizar conta existente
  UPDATE public.accounts_receivable
  SET paid_amount = v_reservation_paid,
      status = CASE 
        WHEN v_reservation_paid >= v_reservation_total THEN 'paid'
        WHEN v_reservation_paid > 0 THEN 'partial'
        ELSE 'pending'
      END,
      paid_date = CASE 
        WHEN v_reservation_paid >= v_reservation_total THEN CURRENT_DATE
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE reservation_id = NEW.reservation_id 
    AND origin = 'reservation'
    AND status != 'cancelled';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Após inserção de pagamento
-- ============================================
DROP TRIGGER IF EXISTS trigger_sync_receivable_on_payment ON public.payments;

CREATE TRIGGER trigger_sync_receivable_on_payment
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_receivable_on_payment();

COMMENT ON FUNCTION auto_create_receivable_from_reservation() IS 'Cria automaticamente conta a receber quando reserva é confirmada';
COMMENT ON FUNCTION sync_receivable_on_payment() IS 'Sincroniza pagamentos com contas a receber';

