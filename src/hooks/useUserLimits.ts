import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserLimit {
  id: string;
  user_id: string;
  max_companies: number;
  max_establishments: number;
  created_at: string;
  updated_at: string;
}

export const useUserLimits = (userId?: string) => {
  const queryClient = useQueryClient();

  const userLimitsQuery = useQuery({
    queryKey: ["user_limits", userId],
    queryFn: async () => {
      let query = supabase.from("user_limits").select("*");
      
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        // Se não encontrar registro, retornar null (não é erro)
        if (error.code === "PGRST116") {
          return null;
        }
        throw error;
      }
      return data as UserLimit | null;
    },
    enabled: !!userId,
  });

  const createOrUpdateUserLimit = useMutation({
    mutationFn: async ({
      user_id,
      max_companies,
      max_establishments,
    }: {
      user_id: string;
      max_companies: number;
      max_establishments: number;
    }) => {
      // Verificar se já existe limite para o usuário
      const { data: existing } = await supabase
        .from("user_limits")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from("user_limits")
          .update({ max_companies, max_establishments })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar
        const { data, error } = await supabase
          .from("user_limits")
          .insert([{ user_id, max_companies, max_establishments }])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_limits"] });
      queryClient.invalidateQueries({ queryKey: ["all_user_limits"] });
      toast.success("Limites configurados com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao configurar limites");
    },
  });

  return {
    userLimit: userLimitsQuery.data || null,
    isLoading: userLimitsQuery.isLoading,
    refetch: userLimitsQuery.refetch,
    createOrUpdateUserLimit: createOrUpdateUserLimit.mutateAsync,
    isSaving: createOrUpdateUserLimit.isPending,
  };
};

