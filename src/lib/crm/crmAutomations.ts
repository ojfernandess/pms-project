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

export type CrmAutomationTemplate = {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  trigger_type: string;
  conditions: unknown;
  actions: unknown;
  is_system: boolean;
};

export type CrmAutomation = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  template_key: string | null;
  trigger_type: string;
  conditions: unknown;
  actions: unknown;
  is_active: boolean;
  updated_at: string;
};

export type CrmAutomationRun = {
  id: string;
  company_id: string;
  automation_id: string;
  trigger_type: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  automation?: { id: string; name: string; trigger_type: string };
};

export async function listCrmAutomationTemplates() {
  try {
    return await crmFetch<CrmAutomationTemplate[]>("/automation-templates");
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_automation_templates")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data || []) as CrmAutomationTemplate[];
  }
}

export async function listCrmAutomations(companyId: string) {
  try {
    return await crmFetch<CrmAutomation[]>(`/automations?companyId=${companyId}`);
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_automations")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []) as CrmAutomation[];
  }
}

export async function createCrmAutomationFromTemplate(body: {
  companyId: string;
  templateKey: string;
  name?: string;
}) {
  try {
    return await crmFetch<CrmAutomation>("/automations/from-template", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const { data: template, error: tErr } = await (supabase as any)
      .from("crm_automation_templates")
      .select("*")
      .eq("template_key", body.templateKey)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template) throw new Error("Template not found");
    const { data, error } = await (supabase as any)
      .from("crm_automations")
      .insert({
        company_id: body.companyId,
        name: body.name?.trim() || template.name,
        description: template.description,
        template_key: template.template_key,
        trigger_type: template.trigger_type,
        conditions: template.conditions,
        actions: template.actions,
        is_active: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as CrmAutomation;
  }
}

export async function setCrmAutomationActive(automationId: string, isActive: boolean) {
  try {
    return await crmFetch<CrmAutomation>(`/automations/${automationId}/active`, {
      method: "POST",
      body: JSON.stringify({ isActive }),
    });
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_automations")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", automationId)
      .select("*")
      .single();
    if (error) throw error;
    return data as CrmAutomation;
  }
}

export async function listCrmAutomationRuns(companyId: string, limit = 50) {
  try {
    return await crmFetch<CrmAutomationRun[]>(
      `/automation-runs?companyId=${companyId}&limit=${limit}`,
    );
  } catch {
    const { data, error } = await (supabase as any)
      .from("crm_automation_runs")
      .select("*, automation:crm_automations(id, name, trigger_type)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as CrmAutomationRun[];
  }
}
