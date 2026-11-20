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
    headers: {
      ...(await authHeaders()),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `CRM API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type CrmContact = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  document_type: string | null;
  document_number: string | null;
  source: string | null;
  tags: unknown;
  classification: string | null;
  notes: string | null;
  updated_at: string;
  client_links?: Array<{ client_id: string; establishment_id: string | null }>;
};

export async function listCrmContacts(params: {
  companyId: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams({
    companyId: params.companyId,
    ...(params.q ? { q: params.q } : {}),
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 25),
  });
  try {
    return await crmFetch<{
      items: CrmContact[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/contacts?${qs.toString()}`);
  } catch {
    // Fallback: leitura direta (tabelas CRM)
    return listCrmContactsViaSupabase(params);
  }
}

export async function listCrmContactsViaSupabase(params: {
  companyId: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  let query = (supabase as any)
    .from("crm_contacts")
    .select("*, client_links:crm_contact_client_links(client_id, establishment_id)", { count: "exact" })
    .eq("company_id", params.companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.q?.trim()) {
    const q = params.q.trim();
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,document_number.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    items: (data || []) as CrmContact[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getCrmContact360(contactId: string) {
  try {
    return await crmFetch<CrmContact360>(`/contacts/${contactId}/360`);
  } catch {
    return getCrmContact360ViaSupabase(contactId);
  }
}

export type CrmContact360 = {
  contact: CrmContact & {
    activities?: Array<Record<string, unknown>>;
    consents?: Array<Record<string, unknown>>;
  };
  reservations: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  indicators: {
    ltv: number;
    stayCount: number;
    averageTicket: number;
    eligibleReservationIds: string[];
  };
  linkedClientIds: string[];
};

export async function getCrmContact360ViaSupabase(contactId: string): Promise<CrmContact360> {
  const { data: contact, error } = await (supabase as any)
    .from("crm_contacts")
    .select("*, client_links:crm_contact_client_links(*), activities:crm_activities(*), consents:crm_consent(*)")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!contact) throw new Error("Contact not found");

  const clientIds = (contact.client_links || []).map((l: { client_id: string }) => l.client_id) as string[];

  let reservations: Array<Record<string, unknown>> = [];
  let quotes: Array<Record<string, unknown>> = [];
  let enrichedContact = contact;

  if (clientIds.length) {
    const [resResult, quotesResult, clientsResult] = await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id, reservation_code, status, checkin_date, checkout_date, total_amount, paid_amount, payment_status, establishment_id, client_id, guest_id, created_at",
        )
        .or(`client_id.in.(${clientIds.join(",")}),guest_id.in.(${clientIds.join(",")})`)
        .order("checkin_date", { ascending: false })
        .limit(100),
      (supabase as any)
        .from("quotes")
        .select("*")
        .or(`client_id.in.(${clientIds.join(",")}),guest_id.in.(${clientIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("clients")
        .select("id, document_type, document_number")
        .in("id", clientIds),
    ]);
    reservations = (resResult.data || []) as Array<Record<string, unknown>>;
    quotes = (quotesResult.data || []) as Array<Record<string, unknown>>;

    if (!contact.document_number) {
      const withDoc = (clientsResult.data || []).find(
        (c: { document_number?: string | null }) => c.document_number,
      ) as { document_type?: string | null; document_number?: string | null } | undefined;
      if (withDoc?.document_number) {
        enrichedContact = {
          ...contact,
          document_type: contact.document_type || withDoc.document_type || null,
          document_number: withDoc.document_number,
        };
        void (supabase as any)
          .from("crm_contacts")
          .update({
            document_type: enrichedContact.document_type,
            document_number: enrichedContact.document_number,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contact.id)
          .then(() => undefined);
      }
    }
  }

  const excluded = new Set(["cancelled", "no_show", "draft"]);
  const eligible = reservations.filter((r) => !excluded.has(String(r.status ?? "")));
  const ltv = eligible.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  const stayCount = eligible.length;

  return {
    contact: enrichedContact,
    reservations,
    quotes,
    indicators: {
      ltv,
      stayCount,
      averageTicket: stayCount ? ltv / stayCount : 0,
      eligibleReservationIds: eligible.map((r) => String(r.id)),
    },
    linkedClientIds: clientIds,
  };
}

export async function upsertCrmContact(body: Record<string, unknown>) {
  try {
    return await crmFetch<CrmContact>("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (nestError) {
    const { data, error } = await (supabase as any).rpc("crm_upsert_contact_from_client", {
      p_company_id: body.companyId,
      p_client_id: body.clientId || null,
      p_establishment_id: body.establishmentId || null,
      p_full_name: body.fullName,
      p_email: body.email || null,
      p_phone: body.phone || null,
      p_document_type: body.documentType || null,
      p_document_number: body.documentNumber || null,
      p_source: body.source || "manual",
    });
    if (!error && data) {
      const { data: contact } = await (supabase as any)
        .from("crm_contacts")
        .select("*")
        .eq("id", data)
        .single();
      if (contact) return contact as CrmContact;
    }
    const { data: created, error: insertError } = await (supabase as any)
      .from("crm_contacts")
      .insert({
        company_id: body.companyId,
        full_name: body.fullName,
        email: body.email || null,
        phone: body.phone || null,
        whatsapp: body.whatsapp || body.phone || null,
        document_type: body.documentType || null,
        document_number: body.documentNumber || null,
        source: body.source || "manual",
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (insertError) {
      throw new Error(
        insertError.message ||
          (nestError instanceof Error ? nestError.message : "Erro ao criar contato CRM"),
      );
    }
    return created as CrmContact;
  }
}

export async function addCrmActivity(contactId: string, body: {
  activityType: string;
  subject?: string;
  body?: string;
}) {
  try {
    return await crmFetch(`/contacts/${contactId}/activities`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    const { data: contact } = await (supabase as any)
      .from("crm_contacts")
      .select("company_id")
      .eq("id", contactId)
      .single();
    const { data, error } = await (supabase as any)
      .from("crm_activities")
      .insert({
        company_id: contact.company_id,
        crm_contact_id: contactId,
        activity_type: body.activityType,
        subject: body.subject || null,
        body: body.body || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}
