import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const useApiSettings = () => {
  const queryClient = useQueryClient();

  // Buscar configurações de API
  const apiSettingsQuery = useQuery({
    queryKey: ["api_settings"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase.from("api_settings").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("api_name");

      if (error) {
        toast.error("Erro ao carregar configurações de API");
        throw error;
      }
      return data || [];
    },
  });

  // Criar ou atualizar configuração de API
  const saveApiSetting = useMutation({
    mutationFn: async ({
      id,
      ...settings
    }: {
      id?: string;
      api_name: string;
      api_key?: string;
      api_secret?: string;
      api_url?: string;
      is_active?: boolean;
      config?: any;
    }) => {
      if (id) {
        // Atualizar
        const { data, error } = await supabase
          .from("api_settings")
          .update(settings)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar
        const establishmentId = getSelectedEstablishmentId();
        const { data, error } = await supabase
          .from("api_settings")
          .insert([{ ...settings, establishment_id: establishmentId || undefined }])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api_settings"] });
      toast.success("Configuração de API salva com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar configuração de API");
    },
  });

  // Deletar configuração de API
  const deleteApiSetting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_settings").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api_settings"] });
      toast.success("Configuração de API excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir configuração de API");
    },
  });

  return {
    apiSettings: apiSettingsQuery.data || [],
    isLoading: apiSettingsQuery.isLoading,
    refetch: apiSettingsQuery.refetch,
    saveApiSetting: saveApiSetting.mutateAsync,
    deleteApiSetting: deleteApiSetting.mutateAsync,
    isSaving: saveApiSetting.isPending,
  };
};

