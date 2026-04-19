-- Corrige RPC: email_queue não possui client_id (42703); usar email_logs.
CREATE OR REPLACE FUNCTION public.merge_duplicate_clients_into_primary(
  p_primary_id uuid,
  p_duplicate_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_duplicate_ids IS NULL OR COALESCE(array_length(p_duplicate_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF p_primary_id = ANY(p_duplicate_ids) THEN
    RAISE EXCEPTION 'INVALID_MERGE: o cliente primário não pode estar na lista de duplicados';
  END IF;

  UPDATE public.reservations
  SET client_id = p_primary_id
  WHERE client_id = ANY(p_duplicate_ids);

  UPDATE public.reservations
  SET guest_id = p_primary_id
  WHERE guest_id = ANY(p_duplicate_ids);

  UPDATE public.accounts_receivable
  SET client_id = p_primary_id
  WHERE client_id = ANY(p_duplicate_ids);

  UPDATE public.invoices
  SET client_id = p_primary_id
  WHERE client_id = ANY(p_duplicate_ids);

  UPDATE public.quotes
  SET client_id = p_primary_id
  WHERE client_id = ANY(p_duplicate_ids);

  UPDATE public.quotes
  SET guest_id = p_primary_id
  WHERE guest_id = ANY(p_duplicate_ids);

  UPDATE public.email_logs
  SET client_id = p_primary_id
  WHERE client_id = ANY(p_duplicate_ids);

  UPDATE public.checkin_charges
  SET guest_id = p_primary_id
  WHERE guest_id = ANY(p_duplicate_ids);

  UPDATE public.stripe_payment_methods
  SET guest_id = p_primary_id
  WHERE guest_id = ANY(p_duplicate_ids);

  UPDATE public.stripe_payments
  SET guest_id = p_primary_id
  WHERE guest_id = ANY(p_duplicate_ids);

  DELETE FROM public.clients
  WHERE id = ANY(p_duplicate_ids);

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.merge_duplicate_clients_into_primary(uuid, uuid[]) IS
  'Centralização de clientes: reaponta reservas/financeiro/cotações/email_logs para o primário e exclui duplicados.';
