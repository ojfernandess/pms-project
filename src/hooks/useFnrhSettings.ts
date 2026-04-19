import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FnrhSettingsPublic = {
  establishment_id: string;
  enabled: boolean;
  environment: string;
  base_url_override: string | null;
  api_username: string | null;
  password_configured: boolean;
  cpf_solicitante: string;
  default_motivo_viagem_id: string | null;
  default_meio_transporte_id: string | null;
  default_raca_id: string | null;
  default_deficiencia_id: string | null;
  default_genero_id: string | null;
  situacao_hospede_inicial: string;
  auto_submit_on_web_checkin: boolean;
  auto_submit_on_manual_checkin: boolean;
  fnrh_category_scope: string;
  fnrh_category_ids: string[] | null;
  updated_at: string | null;
};

export function useFnrhSettings(establishmentId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fnrh_settings", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_fnrh_settings_public", {
        p_establishment_id: establishmentId!,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as FnrhSettingsPublic | null;
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      environment: string;
      base_url_override: string;
      api_username: string;
      api_password: string;
      cpf_solicitante: string;
      default_motivo_viagem_id: string;
      default_meio_transporte_id: string;
      default_raca_id: string;
      default_deficiencia_id: string;
      default_genero_id: string;
      situacao_hospede_inicial: string;
      auto_submit_on_web_checkin: boolean;
      auto_submit_on_manual_checkin: boolean;
      fnrh_category_scope: string;
      fnrh_category_ids: string[];
    }) => {
      const { error } = await supabase.rpc("upsert_fnrh_settings", {
        p_establishment_id: establishmentId!,
        p_enabled: input.enabled,
        p_environment: input.environment,
        p_base_url_override: input.base_url_override || null,
        p_api_username: input.api_username || null,
        p_api_password: input.api_password?.trim() ? input.api_password : null,
        p_cpf_solicitante: input.cpf_solicitante,
        p_default_motivo_viagem_id: input.default_motivo_viagem_id || null,
        p_default_meio_transporte_id: input.default_meio_transporte_id || null,
        p_default_raca_id: input.default_raca_id || null,
        p_default_deficiencia_id: input.default_deficiencia_id || null,
        p_default_genero_id: input.default_genero_id || null,
        p_situacao_hospede_inicial: input.situacao_hospede_inicial,
        p_auto_submit_on_web_checkin: input.auto_submit_on_web_checkin,
        p_auto_submit_on_manual_checkin: input.auto_submit_on_manual_checkin,
        p_fnrh_category_scope: input.fnrh_category_scope,
        p_fnrh_category_ids: input.fnrh_category_ids,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fnrh_settings", establishmentId] });
    },
  });

  return { ...query, saveSettings: save.mutateAsync, isSaving: save.isPending };
}
