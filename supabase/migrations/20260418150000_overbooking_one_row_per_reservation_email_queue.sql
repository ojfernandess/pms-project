-- Um único registro de reservation.overbooking por reserva em email_queue (qualquer status).
-- O índice anterior só cobria pending/queued/sending, permitindo nova linha após envio (sent)
-- quando email_logs não era visível por RLS — e-mails duplicados ao hóspede.

DROP INDEX IF EXISTS public.uniq_email_queue_overbooking_active_per_reservation;

DELETE FROM public.email_queue eq
WHERE eq.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY reservation_id
        ORDER BY
          CASE status
            WHEN 'sent'::email_status THEN 1
            WHEN 'sending'::email_status THEN 2
            WHEN 'queued'::email_status THEN 3
            WHEN 'pending'::email_status THEN 4
            WHEN 'failed'::email_status THEN 5
            ELSE 6
          END,
          created_at ASC NULLS LAST,
          id ASC
      ) AS rn
    FROM public.email_queue
    WHERE event_type = 'reservation.overbooking'::email_event_type
      AND reservation_id IS NOT NULL
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_queue_overbooking_per_reservation
ON public.email_queue (reservation_id)
WHERE event_type = 'reservation.overbooking'::email_event_type
  AND reservation_id IS NOT NULL;

COMMENT ON INDEX public.uniq_email_queue_overbooking_per_reservation IS
  'No máximo um item reservation.overbooking por reserva (inclui sent; evita re-enfileirar após envio).';

-- insert_email_queue: não propagar 23505 para overbooking duplicado (retorna NULL como o cliente TS)
CREATE OR REPLACE FUNCTION public.insert_email_queue(
  p_template_id UUID,
  p_event_type TEXT,
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_subject TEXT,
  p_body_html TEXT,
  p_reservation_id UUID DEFAULT NULL,
  p_variables JSONB DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_cc_emails TEXT DEFAULT NULL,
  p_bcc_emails TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  INSERT INTO public.email_queue (
    template_id,
    event_type,
    recipient_email,
    recipient_name,
    subject,
    body_html,
    reservation_id,
    variables,
    priority,
    cc_emails,
    bcc_emails,
    status,
    scheduled_at
  )
  VALUES (
    NULLIF(p_template_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_event_type::email_event_type,
    p_recipient_email,
    NULLIF(p_recipient_name, ''),
    p_subject,
    p_body_html,
    p_reservation_id,
    p_variables,
    p_priority,
    p_cc_emails,
    p_bcc_emails,
    'pending',
    NOW()
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_event_type = 'reservation.overbooking' THEN
      RETURN NULL;
    END IF;
    RAISE;
END;
$$;
