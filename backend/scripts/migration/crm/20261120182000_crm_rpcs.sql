-- StayOS CRM — RPCs no Postgres (motor/staff via DataService.rpc)
-- SECURITY DEFINER: enqueue resolve company_id e sincroniza contato.

CREATE OR REPLACE FUNCTION public.crm_upsert_contact_from_client(
  p_company_id UUID,
  p_client_id UUID,
  p_establishment_id UUID,
  p_full_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_document_number TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'pms_client'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  IF p_company_id IS NULL OR COALESCE(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'company_id and full_name required';
  END IF;

  SELECT id INTO v_contact_id
  FROM public.crm_contacts
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND (
      (p_client_id IS NOT NULL AND id IN (
        SELECT crm_contact_id FROM public.crm_contact_client_links WHERE client_id = p_client_id
      ))
      OR (p_email IS NOT NULL AND lower(email) = lower(p_email))
      OR (p_document_number IS NOT NULL AND document_number = p_document_number)
      OR (p_phone IS NOT NULL AND phone = p_phone)
    )
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.crm_contacts (
      company_id, full_name, email, phone, whatsapp, document_type, document_number, source
    ) VALUES (
      p_company_id, p_full_name, p_email, p_phone, p_phone, p_document_type, p_document_number, p_source
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.crm_contacts SET
      full_name = COALESCE(p_full_name, full_name),
      email = COALESCE(p_email, email),
      phone = COALESCE(p_phone, phone),
      whatsapp = COALESCE(p_phone, whatsapp),
      document_type = COALESCE(p_document_type, document_type),
      document_number = COALESCE(p_document_number, document_number),
      source = COALESCE(p_source, source),
      updated_at = now()
    WHERE id = v_contact_id;
  END IF;

  IF p_client_id IS NOT NULL THEN
    INSERT INTO public.crm_contact_client_links (crm_contact_id, client_id, establishment_id)
    VALUES (v_contact_id, p_client_id, p_establishment_id)
    ON CONFLICT (crm_contact_id, client_id) DO UPDATE
      SET establishment_id = COALESCE(EXCLUDED.establishment_id, crm_contact_client_links.establishment_id);
  END IF;

  RETURN v_contact_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_enqueue_outbox(
  p_event_type TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_establishment_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := p_company_id;
  v_id UUID;
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_full_name TEXT;
  v_client_id UUID;
BEGIN
  IF v_company_id IS NULL AND p_establishment_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.establishments
    WHERE id = p_establishment_id;
  END IF;

  INSERT INTO public.crm_outbox_events (
    company_id, establishment_id, event_type, payload, idempotency_key
  ) VALUES (
    v_company_id, p_establishment_id, p_event_type, v_payload, p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        company_id = COALESCE(EXCLUDED.company_id, crm_outbox_events.company_id),
        establishment_id = COALESCE(EXCLUDED.establishment_id, crm_outbox_events.establishment_id)
  RETURNING id INTO v_id;

  v_full_name := COALESCE(v_payload->>'full_name', v_payload->>'guest_name', '');
  BEGIN
    v_client_id := NULLIF(v_payload->>'client_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_client_id := NULL;
  END;

  IF p_event_type IN ('contact.upserted', 'booking.created', 'booking.checked_in', 'booking.checked_out')
     AND v_company_id IS NOT NULL
     AND v_full_name <> ''
  THEN
    PERFORM public.crm_upsert_contact_from_client(
      v_company_id,
      v_client_id,
      p_establishment_id,
      v_full_name,
      NULLIF(v_payload->>'email', ''),
      NULLIF(v_payload->>'phone', ''),
      NULLIF(v_payload->>'document_type', ''),
      NULLIF(v_payload->>'document_number', ''),
      COALESCE(NULLIF(v_payload->>'source', ''), p_event_type)
    );
  END IF;

  UPDATE public.crm_outbox_events
  SET processed_at = now(), error = NULL
  WHERE id = v_id AND processed_at IS NULL;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_enqueue_outbox(TEXT, JSONB, TEXT, UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_upsert_contact_from_client(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
