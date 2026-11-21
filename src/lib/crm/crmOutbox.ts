import { supabase } from "@/integrations/supabase/client";
import { resolvePmsApiUrl } from "@/lib/runtimeConfig";

export type CrmOutboxEventType =
  | "contact.upserted"
  | "booking.created"
  | "booking.paid"
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

async function resolveCompanyId(
  establishmentId?: string | null,
  companyId?: string | null,
): Promise<string | null> {
  if (companyId) return companyId;
  if (!establishmentId) return null;
  const { data } = await supabase
    .from("establishments")
    .select("company_id")
    .eq("id", establishmentId)
    .maybeSingle();
  return (data as { company_id?: string } | null)?.company_id ?? null;
}

async function enqueueViaNestApi(input: {
  eventType: CrmOutboxEventType;
  payload: CrmOutboxPayload;
  idempotencyKey: string;
  establishmentId?: string | null;
  companyId?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { id: null, error: "no_session" };

  const base = resolvePmsApiUrl().replace(/\/$/, "");
  const response = await fetch(`${base}/crm/outbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      establishmentId: input.establishmentId ?? undefined,
      companyId: input.companyId ?? undefined,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { id: null, error: body.message || body.error || `CRM outbox ${response.status}` };
  }
  const body = (await response.json()) as { id?: string };
  return { id: body.id ?? null, error: null };
}

/**
 * Enfileira evento CRM no Postgres.
 * 1) Nest /crm/outbox (com sessão) — processa na hora
 * 2) RPC crm_enqueue_outbox (anon/motor) — SECURITY DEFINER + sync contato
 */
export async function enqueueCrmOutbox(input: {
  eventType: CrmOutboxEventType;
  payload: CrmOutboxPayload;
  idempotencyKey: string;
  establishmentId?: string | null;
  companyId?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const companyId = await resolveCompanyId(input.establishmentId, input.companyId);
    const payload = {
      ...input.payload,
      ...(companyId ? { company_id: companyId } : {}),
    };

    const viaNest = await enqueueViaNestApi({
      ...input,
      companyId,
      payload,
    });
    if (!viaNest.error && viaNest.id) return viaNest;

    const { data, error } = await (supabase as any).rpc("crm_enqueue_outbox", {
      p_event_type: input.eventType,
      p_payload: payload ?? {},
      p_idempotency_key: input.idempotencyKey,
      p_establishment_id: input.establishmentId ?? null,
      p_company_id: companyId,
    });
    if (error) {
      console.warn("enqueueCrmOutbox:", viaNest.error || error.message);
      return { id: null, error: error.message || viaNest.error };
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

/** Lead/hóspede quitou a reserva (pagamento total). */
export async function enqueueBookingPaid(input: {
  establishmentId?: string | null;
  companyId?: string | null;
  reservationId: string;
  reservationCode?: string | null;
  quoteId?: string | null;
  clientId?: string | null;
  guestName?: string | null;
  email?: string | null;
  phone?: string | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  paymentIntentId?: string | null;
  source?: string;
}) {
  const payKey = input.paymentIntentId || "full";
  return enqueueCrmOutbox({
    eventType: "booking.paid",
    establishmentId: input.establishmentId,
    companyId: input.companyId,
    idempotencyKey: `booking.paid:${input.reservationId}:${payKey}`,
    payload: {
      reservation_id: input.reservationId,
      reservation_code: input.reservationCode,
      quote_id: input.quoteId,
      client_id: input.clientId,
      guest_name: input.guestName,
      full_name: input.guestName,
      email: input.email,
      phone: input.phone,
      total_amount: input.totalAmount,
      paid_amount: input.paidAmount,
      payment_intent_id: input.paymentIntentId,
      source: input.source || "payment",
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
