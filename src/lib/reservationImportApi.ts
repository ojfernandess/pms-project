import { resolvePmsApiUrl } from "@/lib/runtimeConfig";
import { supabase } from "@/integrations/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function importFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolvePmsApiUrl().replace(/\/$/, "");
  const response = await fetch(`${base}/reservation-import${path}`, {
    ...init,
    headers: {
      ...(await authHeaders()),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type ReservationImportJob = {
  id: string;
  establishment_id: string;
  status: string;
  batch_size: number;
  total: number;
  processed: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  progress_pct: number;
  errors: Array<{
    code?: string;
    reservation_code?: string | null;
    guest_name?: string | null;
    mapping_field?: string | null;
    external_code?: string | null;
    message: string;
    index?: number;
  }>;
  created_at?: string;
  updated_at?: string;
};

export async function fetchReservationImportExample() {
  return importFetch<Record<string, unknown>>("/example");
}

export async function exportReservationsJson(params: {
  establishmentId: string;
  checkinFrom?: string;
  checkinTo?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("establishmentId", params.establishmentId);
  if (params.checkinFrom) qs.set("checkinFrom", params.checkinFrom);
  if (params.checkinTo) qs.set("checkinTo", params.checkinTo);
  if (params.status) qs.set("status", params.status);
  return importFetch<Record<string, unknown>>(`/export?${qs.toString()}`);
}

export async function createReservationImportJob(params: {
  establishmentId: string;
  batchSize?: number;
  payload: Record<string, unknown>;
}) {
  return importFetch<ReservationImportJob>("/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getReservationImportJob(jobId: string, establishmentId: string) {
  const qs = new URLSearchParams({ establishmentId });
  return importFetch<ReservationImportJob>(`/jobs/${jobId}?${qs.toString()}`);
}
