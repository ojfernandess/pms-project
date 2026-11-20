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

export type CrmStage = {
  id: string;
  name: string;
  position: number;
  stage_key: string;
  is_won: boolean;
  is_lost: boolean;
};

export type CrmDeal = {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  amount: number | string;
  source: string | null;
  status: string;
  quote_id: string | null;
  reservation_id: string | null;
  crm_contact_id: string | null;
  crm_contact?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  updated_at?: string;
};

export type CrmBoard = {
  pipeline: { id: string; name: string; stages: CrmStage[] };
  columns: Array<{ stage: CrmStage; deals: CrmDeal[] }>;
  totalDeals: number;
};

export async function getCrmBoard(companyId: string, pipelineId?: string): Promise<CrmBoard> {
  const qs = new URLSearchParams({ companyId });
  if (pipelineId) qs.set("pipelineId", pipelineId);
  try {
    return await crmFetch<CrmBoard>(`/board?${qs.toString()}`);
  } catch {
    return getCrmBoardViaSupabase(companyId, pipelineId);
  }
}

async function getCrmBoardViaSupabase(companyId: string, pipelineId?: string): Promise<CrmBoard> {
  await (supabase as any).rpc("crm_ensure_default_pipeline", { p_company_id: companyId });

  let pipelineQuery = (supabase as any)
    .from("crm_pipelines")
    .select("id, name, stages:crm_pipeline_stages(*)")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (pipelineId) pipelineQuery = pipelineQuery.eq("id", pipelineId);
  else pipelineQuery = pipelineQuery.eq("is_default", true);

  const { data: pipeline, error } = await pipelineQuery.maybeSingle();
  if (error) throw error;
  if (!pipeline) throw new Error("Pipeline not found");

  const stages = ((pipeline.stages || []) as CrmStage[]).sort(
    (a, b) => a.position - b.position,
  );

  const { data: deals, error: dealsError } = await (supabase as any)
    .from("crm_deals")
    .select("*, crm_contact:crm_contacts(id, full_name, email, phone)")
    .eq("company_id", companyId)
    .eq("pipeline_id", pipeline.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (dealsError) throw dealsError;

  const list = (deals || []) as CrmDeal[];
  return {
    pipeline: { id: pipeline.id, name: pipeline.name, stages },
    columns: stages.map((stage) => ({
      stage,
      deals: list.filter((d) => d.stage_id === stage.id),
    })),
    totalDeals: list.length,
  };
}

export async function moveCrmDeal(dealId: string, stageId: string) {
  try {
    return await crmFetch(`/deals/${dealId}/move`, {
      method: "POST",
      body: JSON.stringify({ stageId }),
    });
  } catch {
    const { data: stage } = await (supabase as any)
      .from("crm_pipeline_stages")
      .select("id, is_won, is_lost, stage_key")
      .eq("id", stageId)
      .single();
    let status = "open";
    const patch: Record<string, unknown> = {
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    };
    if (stage?.is_won || stage?.stage_key === "won") {
      status = "won";
      patch.converted_at = new Date().toISOString();
    } else if (stage?.is_lost || stage?.stage_key === "lost") {
      status = "lost";
    }
    patch.status = status;
    const { data, error } = await (supabase as any)
      .from("crm_deals")
      .update(patch)
      .eq("id", dealId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}

export async function convertCrmDeal(dealId: string, reservationId: string) {
  try {
    return await crmFetch(`/deals/${dealId}/convert`, {
      method: "POST",
      body: JSON.stringify({ reservationId }),
    });
  } catch {
    const { data: deal } = await (supabase as any)
      .from("crm_deals")
      .select("pipeline_id")
      .eq("id", dealId)
      .single();
    const { data: wonStage } = await (supabase as any)
      .from("crm_pipeline_stages")
      .select("id")
      .eq("pipeline_id", deal.pipeline_id)
      .eq("is_won", true)
      .maybeSingle();
    const { data, error } = await (supabase as any)
      .from("crm_deals")
      .update({
        reservation_id: reservationId,
        status: "won",
        converted_at: new Date().toISOString(),
        stage_id: wonStage?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dealId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}

export async function createCrmDeal(body: {
  companyId: string;
  title: string;
  amount?: number;
  stageId?: string;
  contactId?: string;
  establishmentId?: string;
  source?: string;
}) {
  try {
    return await crmFetch("/deals", { method: "POST", body: JSON.stringify(body) });
  } catch {
    await (supabase as any).rpc("crm_ensure_default_pipeline", { p_company_id: body.companyId });
    const { data: pipeline } = await (supabase as any)
      .from("crm_pipelines")
      .select("id, stages:crm_pipeline_stages(id, stage_key, position)")
      .eq("company_id", body.companyId)
      .eq("is_default", true)
      .maybeSingle();
    const stages = (pipeline?.stages || []).sort(
      (a: CrmStage, b: CrmStage) => a.position - b.position,
    );
    const stageId =
      body.stageId ||
      stages.find((s: CrmStage) => s.stage_key === "lead")?.id ||
      stages[0]?.id;
    const { data, error } = await (supabase as any)
      .from("crm_deals")
      .insert({
        company_id: body.companyId,
        pipeline_id: pipeline.id,
        stage_id: stageId,
        title: body.title,
        amount: body.amount ?? 0,
        crm_contact_id: body.contactId || null,
        establishment_id: body.establishmentId || null,
        source: body.source || "manual",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}

/** Lead a partir de orçamento (staff ou motor). */
export async function upsertDealFromQuote(input: {
  companyId: string;
  establishmentId?: string | null;
  quoteId: string;
  title: string;
  amount?: number;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  source?: string;
  stageKey?: string;
}) {
  try {
    return await crmFetch("/deals/from-quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch {
    const { data, error } = await (supabase as any).rpc("crm_upsert_deal_from_quote", {
      p_company_id: input.companyId,
      p_establishment_id: input.establishmentId ?? null,
      p_quote_id: input.quoteId,
      p_title: input.title,
      p_amount: input.amount ?? 0,
      p_full_name: input.fullName ?? null,
      p_email: input.email ?? null,
      p_phone: input.phone ?? null,
      p_client_id: input.clientId ?? null,
      p_source: input.source ?? "quote",
      p_stage_key: input.stageKey ?? "proposal",
    });
    if (error) throw error;
    return { id: data };
  }
}

/** Abandono no motor: cria lead se houver e-mail/telefone. */
export async function upsertAbandonedMotorLead(input: {
  companyId: string;
  establishmentId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  amount?: number;
  checkinDate?: string | null;
  checkoutDate?: string | null;
  idempotencyKey?: string;
}) {
  const { data, error } = await (supabase as any).rpc("crm_upsert_abandoned_lead", {
    p_company_id: input.companyId,
    p_establishment_id: input.establishmentId,
    p_full_name: input.fullName,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_amount: input.amount ?? 0,
    p_checkin_date: input.checkinDate ?? null,
    p_checkout_date: input.checkoutDate ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) {
    console.warn("upsertAbandonedMotorLead:", error.message);
    return { id: null, error: error.message };
  }
  return { id: data as string, error: null };
}
