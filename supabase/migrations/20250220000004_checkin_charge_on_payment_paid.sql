-- Ao registrar pagamento de uma reserva, marcar checkin_charge como pago (se existir)
CREATE OR REPLACE FUNCTION public.mark_checkin_charge_paid_on_reservation_payment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reservation_id IS NOT NULL THEN
    UPDATE public.checkin_charges
    SET status = 'paid', updated_at = NOW()
    WHERE reservation_id = NEW.reservation_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mark_checkin_charge_paid ON public.payments;
CREATE TRIGGER trigger_mark_checkin_charge_paid
  AFTER INSERT OR UPDATE OF amount ON public.payments
  FOR EACH ROW
  WHEN (NEW.reservation_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_checkin_charge_paid_on_reservation_payment();

-- Stripe: ao confirmar pagamento com reservation_id, marcar checkin_charge como pago
DROP TRIGGER IF EXISTS trigger_mark_checkin_charge_paid_stripe ON public.stripe_payments;
CREATE TRIGGER trigger_mark_checkin_charge_paid_stripe
  AFTER INSERT OR UPDATE OF status ON public.stripe_payments
  FOR EACH ROW
  WHEN (NEW.reservation_id IS NOT NULL AND NEW.status = 'succeeded')
  EXECUTE FUNCTION public.mark_checkin_charge_paid_on_reservation_payment();

COMMENT ON FUNCTION public.mark_checkin_charge_paid_on_reservation_payment IS 'Atualiza checkin_charges para paid quando um pagamento da reserva é registrado (payments ou stripe_payments).';
