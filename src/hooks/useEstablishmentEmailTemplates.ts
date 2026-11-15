import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveEmailTemplate } from "@/lib/emailTemplateResolver";
import { EMAIL_EVENT_TYPES } from "@/lib/emailTemplateConstants";

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

export type EstablishmentEmailTemplateRow = {
  id: string;
  establishment_id: string;
  event_type: string;
  parent_template_id: string | null;
  use_custom_template: boolean;
  name: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  variables: unknown;
  logo_url: string | null;
  primary_color: string | null;
  footer_text: string | null;
  cc_emails: string | null;
  bcc_emails: string | null;
  is_active: boolean;
};

export type EstablishmentEmailTemplateView = {
  event_type: string;
  event_label: string;
  globalTemplate: Record<string, unknown> | null;
  override: EstablishmentEmailTemplateRow | null;
  resolved: Record<string, unknown> | null;
  isCustomized: boolean;
};

export function useEstablishmentEmailTemplates(establishmentId?: string) {
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["establishment_email_templates", establishmentId],
    enabled: !!establishmentId,
    queryFn: async (): Promise<EstablishmentEmailTemplateView[]> => {
      if (!establishmentId) return [];

      const [{ data: overrides, error: overridesError }, { data: globals, error: globalsError }] =
        await Promise.all([
          supabase
            .from("establishment_email_templates")
            .select("*")
            .eq("establishment_id", establishmentId),
          supabase
            .from("email_templates")
            .select("*")
            .eq("is_active", true)
            .order("updated_at", { ascending: false }),
        ]);

      if (globalsError) throw globalsError;
      if (overridesError && overridesError.code !== "42P01") throw overridesError;

      const overrideByEvent = new Map(
        (overrides || []).map((row: EstablishmentEmailTemplateRow) => [row.event_type, row]),
      );

      const globalByEvent = new Map<string, Record<string, unknown>>();
      for (const global of globals || []) {
        if (!templateAllowsEstablishment(global.establishment_ids, establishmentId)) continue;
        if (!globalByEvent.has(global.event_type)) {
          globalByEvent.set(global.event_type, global);
        }
      }

      const views = await Promise.all(
        EMAIL_EVENT_TYPES.map(async (event) => {
          const globalTemplate = globalByEvent.get(event.value) ?? null;
          const override = overrideByEvent.get(event.value) ?? null;
          const resolved = await resolveEmailTemplate(event.value, establishmentId);

          return {
            event_type: event.value,
            event_label: event.label,
            globalTemplate,
            override,
            resolved: resolved as Record<string, unknown> | null,
            isCustomized: Boolean(override?.use_custom_template),
          };
        }),
      );

      return views;
    },
  });

  const saveOverride = useMutation({
    mutationFn: async (payload: {
      establishment_id: string;
      event_type: string;
      parent_template_id?: string | null;
      use_custom_template: boolean;
      name?: string;
      subject: string;
      body_html: string;
      body_text?: string;
      variables?: unknown;
      logo_url?: string;
      primary_color?: string;
      footer_text?: string;
      cc_emails?: string;
      bcc_emails?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        ...payload,
        is_active: true,
        created_by: user?.id ?? null,
      };

      const { data: existing, error: lookupError } = await supabase
        .from("establishment_email_templates")
        .select("id")
        .eq("establishment_id", payload.establishment_id)
        .eq("event_type", payload.event_type)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing?.id) {
        const { data, error } = await supabase
          .from("establishment_email_templates")
          .update(row)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("establishment_email_templates")
        .insert([row])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment_email_templates", establishmentId] });
      toast.success("Template salvo com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao salvar template");
    },
  });

  const resetToDefault = useMutation({
    mutationFn: async ({ event_type }: { event_type: string }) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");

      const { error } = await supabase
        .from("establishment_email_templates")
        .delete()
        .eq("establishment_id", establishmentId)
        .eq("event_type", event_type);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment_email_templates", establishmentId] });
      toast.success("Template restaurado para o padrão do sistema");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao restaurar template");
    },
  });

  return {
    templates: templatesQuery.data || [],
    isLoading: templatesQuery.isLoading,
    isError: templatesQuery.isError,
    refetch: templatesQuery.refetch,
    saveOverride,
    resetToDefault,
  };
}
