import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const usePricingPlans = () => {
  const queryClient = useQueryClient();

  // Buscar planos de tarifa
  const plansQuery = useQuery({
    queryKey: ["pricing_plans"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase.from("pricing_plans").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("name");

      if (error) {
        toast.error("Erro ao carregar planos de tarifa");
        throw error;
      }
      return data;
    },
  });

  // Criar plano de tarifa
  const createPlan = useMutation({
    mutationFn: async (plan: { name: string; description?: string; is_active?: boolean }) => {
      const establishmentId = getSelectedEstablishmentId();
      const { data, error } = await supabase
        .from("pricing_plans")
        .insert([{ ...plan, establishment_id: establishmentId || undefined }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plans"] });
      toast.success("Plano de tarifa criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar plano de tarifa");
    },
  });

  // Atualizar plano de tarifa
  const updatePlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("pricing_plans")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plans"] });
      toast.success("Plano de tarifa atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar plano de tarifa");
    },
  });

  // Deletar plano de tarifa
  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plans"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Plano de tarifa excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir plano de tarifa");
    },
  });

  return {
    plans: plansQuery.data || [],
    isLoading: plansQuery.isLoading,
    refetch: plansQuery.refetch,
    createPlan: createPlan.mutateAsync,
    updatePlan: updatePlan.mutateAsync,
    deletePlan: deletePlan.mutateAsync,
    isCreating: createPlan.isPending,
    isUpdating: updatePlan.isPending,
  };
};

