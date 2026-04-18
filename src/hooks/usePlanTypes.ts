import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlanType {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sort_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const usePlanTypes = () => {
  const queryClient = useQueryClient();

  const planTypesQuery = useQuery({
    queryKey: ["pricing_plan_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_plan_types")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as PlanType[];
    },
  });

  const activePlanTypesQuery = useQuery({
    queryKey: ["pricing_plan_types", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_plan_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as PlanType[];
    },
  });

  const createPlanType = useMutation({
    mutationFn: async (planType: Partial<PlanType>) => {
      if (!planType.name) {
        throw new Error("Nome do tipo é obrigatório");
      }

      // Verificar se já existe um tipo com o mesmo nome
      const { data: existing, error: checkError } = await supabase
        .from("pricing_plan_types")
        .select("id")
        .eq("name", planType.name.trim())
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 = nenhum resultado encontrado (esperado)
        throw checkError;
      }

      if (existing) {
        throw new Error("Já existe um tipo de plano com este nome");
      }

      const { data, error } = await supabase
        .from("pricing_plan_types")
        .insert([{ ...planType, name: planType.name.trim() }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plan_types"] });
      toast.success("Tipo de plano criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar tipo de plano");
    },
  });

  const updatePlanType = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PlanType>) => {
      // Se o nome está sendo atualizado, verificar se já existe outro tipo com o mesmo nome
      if (updates.name) {
        const { data: existing, error: checkError } = await supabase
          .from("pricing_plan_types")
          .select("id")
          .eq("name", updates.name.trim());

        if (checkError) {
          throw checkError;
        }

        // Verificar se existe algum tipo com o mesmo nome mas ID diferente
        const duplicate = existing?.find((type) => type.id !== id);
        if (duplicate) {
          throw new Error("Já existe um tipo de plano com este nome");
        }
      }

      const updateData = updates.name ? { ...updates, name: updates.name.trim() } : updates;

      const { data, error } = await supabase
        .from("pricing_plan_types")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plan_types"] });
      toast.success("Tipo de plano atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tipo de plano");
    },
  });

  const deletePlanType = useMutation({
    mutationFn: async (id: string) => {
      // Buscar o nome do tipo primeiro
      const { data: planType, error: fetchError } = await supabase
        .from("pricing_plan_types")
        .select("name")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;
      if (!planType) throw new Error("Tipo de plano não encontrado");

      // Verificar se há planos usando este tipo
      const { data: plansUsingType, error: checkError } = await supabase
        .from("pricing_plans")
        .select("id, name")
        .eq("plan_type", planType.name)
        .limit(1);

      if (checkError) throw checkError;

      if (plansUsingType && plansUsingType.length > 0) {
        throw new Error("Não é possível excluir este tipo pois existem planos tarifários usando-o");
      }

      const { error } = await supabase
        .from("pricing_plan_types")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_plan_types"] });
      toast.success("Tipo de plano excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir tipo de plano");
    },
  });

  return {
    planTypes: planTypesQuery.data || [],
    activePlanTypes: activePlanTypesQuery.data || [],
    isLoading: planTypesQuery.isLoading,
    createPlanType: createPlanType.mutateAsync,
    updatePlanType: updatePlanType.mutateAsync,
    deletePlanType: deletePlanType.mutateAsync,
    refetch: () => {
      planTypesQuery.refetch();
      activePlanTypesQuery.refetch();
    },
  };
};

