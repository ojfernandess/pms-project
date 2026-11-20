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

export type CrmSegment = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  rules: Record<string, unknown>;
};

export type CrmCampaign = {
  id: string;
  company_id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  segment_id: string | null;
  segment?: { id: string; name: string } | null;
  _count?: { recipients: number };
};

export async function listCrmSegments(companyId: string) {
  try {
    return await crmFetch<CrmSegment[]>(`/segments?companyId=${companyId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_segments")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []) as CrmSegment[];
  }
}

export async function createCrmSegment(body: {
  companyId: string;
  name: string;
  description?: string;
  rules?: Record<string, unknown>;
}) {
  try {
    return await crmFetch<CrmSegment>("/segments", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_segments")
      .insert({
        company_id: body.companyId,
        name: body.name,
        description: body.description || null,
        rules: body.rules || {},
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as CrmSegment;
  }
}

export async function previewCrmSegment(segmentId: string) {
  try {
    return await crmFetch<{ matched: number; sampleContactIds: string[] }>(
      `/segments/${segmentId}/preview`,
      { method: "POST" },
    );
  } catch {
    return { matched: 0, sampleContactIds: [] as string[] };
  }
}

export async function listCrmCampaigns(companyId: string) {
  try {
    return await crmFetch<CrmCampaign[]>(`/campaigns?companyId=${companyId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_campaigns")
      .select("*, segment:crm_segments(id, name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []) as CrmCampaign[];
  }
}

export async function createCrmCampaign(body: {
  companyId: string;
  name: string;
  channel?: string;
  subject?: string;
  body?: string;
  segmentId?: string;
}) {
  try {
    return await crmFetch<CrmCampaign>("/campaigns", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_campaigns")
      .insert({
        company_id: body.companyId,
        name: body.name,
        channel: body.channel || "email",
        subject: body.subject || null,
        body: body.body || "",
        segment_id: body.segmentId || null,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as CrmCampaign;
  }
}

export async function getCrmCampaign(campaignId: string) {
  try {
    return await crmFetch(`/campaigns/${campaignId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_campaigns")
      .select(
        "*, segment:crm_segments(*), recipients:crm_campaign_recipients(*, crm_contact:crm_contacts(id, full_name, email, phone))",
      )
      .eq("id", campaignId)
      .single();
    if (error) throw error;
    return data;
  }
}

export async function buildCrmCampaignRecipients(campaignId: string) {
  return crmFetch<{ total: number; pending: number; skipped: number }>(
    `/campaigns/${campaignId}/build-recipients`,
    { method: "POST" },
  );
}

export async function enqueueCrmCampaign(campaignId: string) {
  return crmFetch<{ pendingCount: number; queued: boolean }>(
    `/campaigns/${campaignId}/enqueue`,
    { method: "POST" },
  );
}

export async function upsertCrmConsent(contactId: string, channel: string, granted: boolean) {
  try {
    return await crmFetch(`/contacts/${contactId}/consent`, {
      method: "POST",
      body: JSON.stringify({ channel, purpose: "marketing", granted }),
    });
  } catch {
    const { data: contact } = await (supabase as any)
      .from("crm_contacts")
      .select("company_id")
      .eq("id", contactId)
      .single();
    const { data, error } = await (supabase as any)
      .from("crm_consent")
      .upsert(
        {
          company_id: contact.company_id,
          crm_contact_id: contactId,
          channel,
          purpose: "marketing",
          granted,
          granted_at: granted ? new Date().toISOString() : null,
          revoked_at: granted ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "crm_contact_id,channel,purpose" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}
