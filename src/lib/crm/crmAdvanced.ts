import { resolvePmsApiUrl } from "@/lib/runtimeConfig";
import { supabase } from "@/integrations/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function crmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolvePmsApiUrl().replace(/\/$/, "");
  const response = await fetch(`${base}/crm${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `CRM API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type CrmB2bCompany = {
  id: string;
  company_id: string;
  legal_name: string;
  trade_name: string | null;
  document_number: string | null;
  partner_type: string;
  email: string | null;
  phone: string | null;
  commercial_owner: string | null;
  notes: string | null;
  _count?: { contacts: number };
  contacts?: Array<{
    id: string;
    role: string | null;
    crm_contact: { id: string; full_name: string; email: string | null };
  }>;
};

export type CrmLoyaltyProgram = {
  id: string;
  name: string;
  points_per_currency: number | string;
  tiers: unknown;
  is_active: boolean;
};

export type CrmLoyaltyAccount = {
  id: string;
  points_balance: number | string;
  lifetime_points: number | string;
  tier_key: string;
  crm_contact: { id: string; full_name: string; email: string | null };
};

export type CrmReportsDashboard = {
  summary: {
    contactsTotal: number;
    contactsNew: number;
    leadsTotal: number;
    opportunitiesOpen: number;
    opportunitiesWon: number;
    opportunitiesLost: number;
    conversionRate: number;
    pipelineAmount: number;
    wonAmount: number;
    averageWonTicket: number;
    bySource: Record<string, number>;
    lostReasons: Record<string, number>;
    vipContacts: number;
    campaignsTotal: number;
    automationsActive: number;
    b2bCompanies: number;
    loyaltyMembers: number;
    loyaltyByTier: Record<string, number>;
  };
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    channel: string;
    recipients: number;
  }>;
  generatedAt: string;
};

export async function listCrmB2bCompanies(companyId: string, q?: string) {
  const qs = new URLSearchParams({ companyId, ...(q ? { q } : {}) });
  try {
    return await crmFetch<CrmB2bCompany[]>(`/companies?${qs}`);
  } catch {
    let query = (supabase as any)
      .from("crm_companies")
      .select("*, contacts:crm_company_contacts(id, role, crm_contact:crm_contacts(id, full_name, email))")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (q?.trim()) {
      query = query.or(
        `legal_name.ilike.%${q}%,trade_name.ilike.%${q}%,document_number.ilike.%${q}%`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as CrmB2bCompany[];
  }
}

export async function upsertCrmB2bCompany(body: Record<string, unknown>) {
  try {
    return await crmFetch<CrmB2bCompany>("/companies", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const payload = {
      company_id: body.companyId,
      legal_name: body.legalName,
      trade_name: body.tradeName || null,
      document_number: body.documentNumber || null,
      partner_type: body.partnerType || "corporate",
      email: body.email || null,
      phone: body.phone || null,
      commercial_owner: body.commercialOwner || null,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (body.id) {
      const { data, error } = await (supabase as any)
        .from("crm_companies")
        .update(payload)
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CrmB2bCompany;
    }
    const { data, error } = await (supabase as any)
      .from("crm_companies")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return data as CrmB2bCompany;
  }
}

export async function getCrmLoyaltyProgram(companyId: string) {
  try {
    return await crmFetch<CrmLoyaltyProgram>(`/loyalty/program?companyId=${companyId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_loyalty_programs")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as CrmLoyaltyProgram;
    const { data: created, error: createErr } = await (supabase as any)
      .from("crm_loyalty_programs")
      .insert({ company_id: companyId, name: "Programa StayOS" })
      .select("*")
      .single();
    if (createErr) throw createErr;
    return created as CrmLoyaltyProgram;
  }
}

export async function listCrmLoyaltyAccounts(companyId: string) {
  try {
    return await crmFetch<CrmLoyaltyAccount[]>(`/loyalty/accounts?companyId=${companyId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_loyalty_accounts")
      .select("*, crm_contact:crm_contacts(id, full_name, email)")
      .eq("company_id", companyId)
      .order("lifetime_points", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []) as CrmLoyaltyAccount[];
  }
}

export async function earnCrmLoyalty(body: {
  companyId: string;
  crmContactId: string;
  amount: number;
  reservationId?: string;
  note?: string;
}) {
  return crmFetch("/loyalty/earn", { method: "POST", body: JSON.stringify(body) });
}

export async function getCrmReportsDashboard(
  companyId: string,
  opts?: { from?: string; to?: string; source?: string },
) {
  const qs = new URLSearchParams({
    companyId,
    ...(opts?.from ? { from: opts.from } : {}),
    ...(opts?.to ? { to: opts.to } : {}),
    ...(opts?.source ? { source: opts.source } : {}),
  });
  return crmFetch<CrmReportsDashboard>(`/reports/dashboard?${qs}`);
}

export async function exportCrmReport(
  companyId: string,
  report: "leads_by_source" | "campaigns",
) {
  return crmFetch<{ filename: string; csv: string }>(
    `/reports/export?companyId=${companyId}&report=${report}`,
  );
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
