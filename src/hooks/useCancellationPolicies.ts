import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export interface CancellationPolicy {
  id: string;
  establishment_id: string;
  name: string;
  has_free_cancellation: boolean;
  free_cancellation_deadline: string | null;
  cancellation_fee_type: "first_night" | "percentage";
  cancellation_fee_percentage: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useCancellationPolicies = () => {
  const queryClient = useQueryClient();

  const getEstablishmentId = (): string | null => {
    return getSelectedEstablishmentId();
  };

  const policiesQuery = useQuery({
    queryKey: ["cancellation_policies", getEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("cancellation_policies")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as CancellationPolicy[];
    },
  });

  const createPolicyMutation = useMutation({
    mutationFn: async (policyData: Omit<CancellationPolicy, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("cancellation_policies")
        .insert([policyData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cancellation_policies"] });
      toast.success("Política de cancelamento criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar política de cancelamento");
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ id, ...policyData }: Partial<CancellationPolicy> & { id: string }) => {
      const { data, error } = await supabase
        .from("cancellation_policies")
        .update(policyData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cancellation_policies"] });
      toast.success("Política de cancelamento atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar política de cancelamento");
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => {
      // Verificar se há planos tarifários usando esta política
      const { data: plansUsingPolicy } = await supabase
        .from("pricing_plans")
        .select("id, name")
        .eq("cancellation_policy_id", id);

      if (plansUsingPolicy && plansUsingPolicy.length > 0) {
        throw new Error(
          `Não é possível excluir esta política. Ela está sendo usada por ${plansUsingPolicy.length} plano(s) tarifário(s).`
        );
      }

      const { error } = await supabase
        .from("cancellation_policies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cancellation_policies"] });
      toast.success("Política de cancelamento excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir política de cancelamento");
    },
  });

  return {
    policies: policiesQuery.data || [],
    isLoading: policiesQuery.isLoading,
    error: policiesQuery.error,
    refetch: policiesQuery.refetch,
    createPolicy: createPolicyMutation.mutate,
    updatePolicy: updatePolicyMutation.mutate,
    deletePolicy: deletePolicyMutation.mutate,
    isCreating: createPolicyMutation.isPending,
    isUpdating: updatePolicyMutation.isPending,
    isDeleting: deletePolicyMutation.isPending,
  };
};

