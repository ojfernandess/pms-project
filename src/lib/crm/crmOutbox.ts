import { supabase } from "@/integrations/supabase/client";

export type CrmOutboxEventType =
  | "contact.upserted"
  | "booking.created"
  | "booking.cancelled"
  | "booking.checked_in"
  | "booking.checked_out";

export type CrmOutboxPayload = {
  client_id?: string | null;
  reservation_id?: string | null;
  reservation_code?: string | null;
  full_name?: string | null;
  guest_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  source?: string | null;
  company_id?: string | null;
  status?: string | null;
  total_amount?: number | null;
  [key: string]: unknown;
};

/** Enfileira evento CRM via RPC (idempotente) e sincroniza contato quando houver client_id. */
export async function enqueueCrmOutbox(input: {
  eventType: CrmOutboxEventType;
  payload: CrmOutboxPayload;
  idempotencyKey: string;
  establishmentId?: string | null;
  companyId?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data, error } = await (supabase as any).rpc("crm_enqueue_outbox", {
      p_event_type: input.eventType,
      p_payload: input.payload ?? {},
      p_idempotency_key: input.idempotencyKey,
      p_establishment_id: input.establishmentId ?? null,
      p_company_id: input.companyId ?? null,
    });
    if (error) {
      console.warn("enqueueCrmOutbox:", error.message);
      return { id: null, error: error.message };
    }
    return { id: data as string, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("enqueueCrmOutbox:", message);
    return { id: null, error: message };
  }
}

export async function enqueueBookingCreated(input: {
  establishmentId: string;
  companyId?: string | null;
  reservationId: string;
  reservationCode?: string | null;
  clientId?: string | null;
  guestName?: string | null;
  email?: string | null;
  phone?: string | null;
  totalAmount?: number | null;
  status?: string | null;
  source?: string;
}) {
  return enqueueCrmOutbox({
    eventType: "booking.created",
    establishmentId: input.establishmentId,
    companyId: input.companyId,
    idempotencyKey: `booking.created:${input.reservationId}`,
    payload: {
      reservation_id: input.reservationId,
      reservation_code: input.reservationCode,
      client_id: input.clientId,
      full_name: input.guestName,
      guest_name: input.guestName,
      email: input.email,
      phone: input.phone,
      total_amount: input.totalAmount,
      status: input.status,
      source: input.source || "pms",
    },
  });
}

export async function enqueueBookingCancelled(input: {
  establishmentId?: string | null;
  companyId?: string | null;
  reservationId: string;
  reservationCode?: string | null;
  clientId?: string | null;
  guestName?: string | null;
}) {
  return enqueueCrmOutbox({
    eventType: "booking.cancelled",
    establishmentId: input.establishmentId,
    companyId: input.companyId,
    idempotencyKey: `booking.cancelled:${input.reservationId}`,
    payload: {
      reservation_id: input.reservationId,
      reservation_code: input.reservationCode,
      client_id: input.clientId,
      guest_name: input.guestName,
      full_name: input.guestName,
      source: "pms",
    },
  });
}

export async function enqueueContactUpserted(input: {
  establishmentId?: string | null;
  companyId?: string | null;
  clientId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  source?: string;
}) {
  return enqueueCrmOutbox({
    eventType: "contact.upserted",
    establishmentId: input.establishmentId,
    companyId: input.companyId,
    idempotencyKey: `contact.upserted:${input.clientId}:${Date.now() - (Date.now() % 60_000)}`,
    payload: {
      client_id: input.clientId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      document_type: input.documentType,
      document_number: input.documentNumber,
      source: input.source || "motor",
    },
  });
}
