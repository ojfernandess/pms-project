import { resolvePmsApiUrl } from "@/lib/runtimeConfig";
import { supabase } from "@/integrations/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function apiBase(): string {
  return resolvePmsApiUrl().replace(/\/$/, "");
}

export type PlatformDomainRecord = {
  id: string;
  hostname: string;
  company_id: string | null;
  company_name: string | null;
  service_type: string;
  status: string;
  dns_status: string | null;
  ssl_status: string | null;
  last_error: string | null;
  verification_txt: { name: string; value: string };
  dns_instructions: {
    cname: { type: string; name: string; target: string } | null;
    a: { type: string; name: string; target: string } | null;
    note: string;
  };
};

export async function listPlatformDomains(): Promise<PlatformDomainRecord[]> {
  const res = await fetch(`${apiBase()}/platform-custom-domains`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Listagem de domínios falhou (${res.status})`);
  return res.json();
}

export async function createPlatformDomain(body: {
  hostname: string;
  company_id?: string | null;
  service_type?: "web_checkin" | "booking_engine";
}) {
  const res = await fetch(`${apiBase()}/platform-custom-domains`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Criação falhou (${res.status})`);
  return payload as PlatformDomainRecord;
}

export async function verifyPlatformDomain(id: string) {
  const res = await fetch(`${apiBase()}/platform-custom-domains/${id}/verify`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Verificação falhou (${res.status})`);
  return payload;
}

export async function diagnosePlatformDomain(id: string) {
  const res = await fetch(`${apiBase()}/platform-custom-domains/${id}/diagnose`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Diagnóstico falhou (${res.status})`);
  return res.json();
}

export async function ensureBookingEngineDomain(companyId: string) {
  const res = await fetch(`${apiBase()}/platform-custom-domains/booking-engine/ensure`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ company_id: companyId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Ensure falhou (${res.status})`);
  return payload as {
    ok: boolean;
    hostname?: string;
    traefik?: { envBlock: string; rule: string; hosts: string[]; auto_sync_enabled?: boolean };
    infra_sync?: { enabled: boolean; queued: boolean };
  };
}

export async function verifyBookingEngineDomain(companyId: string) {
  const res = await fetch(`${apiBase()}/platform-custom-domains/booking-engine/verify`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ company_id: companyId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Verificação falhou (${res.status})`);
  return payload as {
    checks: { txtOk: boolean; dnsPointsOk: boolean; sslOk: boolean; details: string[] };
    traefik: { envBlock: string; rule: string; hosts: string[]; auto_sync_enabled?: boolean };
    ssl_issue: string | null;
    domain: PlatformDomainRecord | null;
  };
}

export async function importLegacyWebCheckinDomain() {
  const res = await fetch(`${apiBase()}/platform-custom-domains/import-legacy-web-checkin`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Import falhou (${res.status})`);
  return payload as PlatformDomainRecord;
}