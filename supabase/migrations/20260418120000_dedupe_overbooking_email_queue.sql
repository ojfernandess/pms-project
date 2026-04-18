-- Evita múltiplos e-mails de overbooking na fila para a mesma reserva (corrida entre
-- syncs Channex, refetch do React Query e processamento da fila).
-- Linhas com status "sent" não entram no índice; um envio concluído é bloqueado via
-- email_logs em triggerEmail (reservation.overbooking).

-- Remover duplicatas já existentes (mantém o registro mais antigo por reserva).
DELETE FROM public.email_queue eq
WHERE eq.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY reservation_id
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.email_queue
    WHERE event_type = 'reservation.overbooking'::email_event_type
      AND reservation_id IS NOT NULL
      AND status = ANY (ARRAY['pending'::email_status, 'queued'::email_status, 'sending'::email_status])
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_queue_overbooking_active_per_reservation
ON public.email_queue (reservation_id)
WHERE event_type = 'reservation.overbooking'::email_event_type
  AND reservation_id IS NOT NULL
  AND status = ANY (ARRAY['pending'::email_status, 'queued'::email_status, 'sending'::email_status]);

COMMENT ON INDEX public.uniq_email_queue_overbooking_active_per_reservation IS
  'No máximo um item ativo (pendente/enviando) de reservation.overbooking por reserva.';
