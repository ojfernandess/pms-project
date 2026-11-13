import { supabase } from "@/integrations/supabase/client";

function apiBase(): string {
  const base = import.meta.env.VITE_PMS_API_URL;
  if (!base) {
    throw new Error("VITE_PMS_API_URL não está configurada");
  }
  return String(base).replace(/\/$/, "");
}

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

export async function invokePmsFunction<T = Record<string, unknown>>(name: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<{ data: T | null; error: Error | null }> {
  const headers = { ...(await authHeaders()) as Record<string, string>, ...(options?.headers ?? {}) };
  const response = await fetch(`${apiBase()}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(options?.body ?? {}),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const message = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : `Erro ${response.status}`;
    return { data: payload, error: new Error(message) };
  }
  return { data: payload, error: null };
}

export async function pmsPost<T>(path: string, body: unknown, authenticated = false): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: authenticated ? await authHeaders() : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : "Erro na API do PMS";
    throw new Error(message);
  }
  return payload as T;
}

export interface ReservationLockArgs {
  p_reservation_data: Record<string, unknown>;
  p_checkin_date: string;
  p_checkout_date: string;
  p_establishment_id: string;
  p_room_id?: string | null;
  p_category_id?: string | null;
}

export function createReservationWithLock(args: ReservationLockArgs) {
  return pmsPost<{ success?: boolean; error?: string; reservation_id?: string }>("/reservations/lock", args);
}

export function quoteRate(args: {
  p_establishment_id: string;
  p_category_id: string;
  p_pricing_plan_id: string;
  p_date: string;
  p_adults?: number;
  p_children?: number;
}) {
  return pmsPost<{ data: number }>("/rates/quote", args);
}

export function checkInReservation(id: string, roomId?: string) {
  return pmsPost<Record<string, unknown>>(`/reservations/${id}/check-in`, { roomId }, true);
}

export function checkOutReservation(id: string) {
  return pmsPost<Record<string, unknown>>(`/reservations/${id}/check-out`, {}, true);
}
