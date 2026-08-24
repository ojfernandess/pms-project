import { supabase } from "@/integrations/supabase/client";

export type EmailTemplateRecord = {
  id?: string;
  name?: string;
  event_type?: string;
  subject?: string;
  body_html?: string;
  body_text?: string | null;
  variables?: unknown;
  logo_url?: string | null;
  primary_color?: string | null;
  footer_text?: string | null;
  cc_emails?: string | null;
  bcc_emails?: string | null;
  establishment_ids?: string[] | null;
  is_establishment_override?: boolean;
  establishment_template_id?: string;
  parent_template_id?: string | null;
};

function templateAllowsEstablishment(
  establishmentIds: unknown,
  establishmentId: string,
): boolean {
  if (establishmentIds === null || establishmentIds === undefined) return true;
  if (Array.isArray(establishmentIds) && establishmentIds.length === 0) return false;
  if (typeof establishmentIds === "string") {
    const trimmed = establishmentIds.trim();
    if (trimmed === "" || trimmed === "[]") return false;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return false;
        return parsed.includes(establishmentId);
      }
    } catch {
      return true;
    }
  }
  if (Array.isArray(establishmentIds)) {
    return establishmentIds.includes(establishmentId);
  }
  return true;
}

function mergeEstablishmentOverride(
  globalTemplate: EmailTemplateRecord,
  override: EmailTemplateRecord,
): EmailTemplateRecord {
  return {
    ...globalTemplate,
    is_establishment_override: true,
    establishment_template_id: override.id,
    parent_template_id: override.parent_template_id ?? globalTemplate.id ?? null,
    name: override.name ?? globalTemplate.name,
    subject: override.subject ?? globalTemplate.subject,
    body_html: override.body_html ?? globalTemplate.body_html,
    body_text: override.body_text ?? globalTemplate.body_text,
    variables: override.variables ?? globalTemplate.variables,
    logo_url: override.logo_url ?? globalTemplate.logo_url,
    primary_color: override.primary_color ?? globalTemplate.primary_color,
    footer_text: override.footer_text ?? globalTemplate.footer_text,
    cc_emails: override.cc_emails ?? globalTemplate.cc_emails,
    bcc_emails: override.bcc_emails ?? globalTemplate.bcc_emails,
  };
}

async function findGlobalEmailTemplate(
  eventType: string,
  establishmentId?: string,
): Promise<EmailTemplateRecord | null> {
  const { data: allTemplates, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("event_type", eventType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error || !allTemplates?.length) return null;

  if (!establishmentId) return allTemplates[0] as EmailTemplateRecord;

  const filtered = allTemplates.filter((template: EmailTemplateRecord) =>
    templateAllowsEstablishment(template.establishment_ids, establishmentId),
  );

  return filtered[0] ?? null;
}

/**
 * Resolve o template efetivo: personalização do estabelecimento ou padrão global.
 * Mantém compatibilidade com o fluxo anterior quando não há override.
 */
export async function resolveEmailTemplate(
  eventType: string,
  establishmentId?: string,
): Promise<EmailTemplateRecord | null> {
  if (establishmentId) {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_resolved_email_template", {
      p_event_type: eventType,
      p_establishment_id: establishmentId,
    });

    if (!rpcError && rpcData) {
      return rpcData as EmailTemplateRecord;
    }
  }

  const globalTemplate = await findGlobalEmailTemplate(eventType, establishmentId);
  if (!globalTemplate || !establishmentId) return globalTemplate;

  const { data: override, error: overrideError } = await supabase
    .from("establishment_email_templates")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("event_type", eventType)
    .eq("is_active", true)
    .maybeSingle();

  if (overrideError) {
    // Tabela ainda não migrada ou indisponível — manter comportamento anterior
    return globalTemplate;
  }

  if (!override?.use_custom_template) return globalTemplate;
  return mergeEstablishmentOverride(globalTemplate, override as EmailTemplateRecord);
}
