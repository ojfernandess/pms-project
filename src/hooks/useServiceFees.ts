import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export const useServiceFees = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Buscar todas as taxas/serviços
  const serviceFeesQuery = useQuery({
    queryKey: ["service_fees", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("service_fees")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Erro ao buscar taxas:", error);
        throw error;
      }

      return data || [];
    },
  });

  // Criar nova taxa/serviço
  const createServiceFee = useMutation({
    mutationFn: async (data: { name: string; description?: string; is_active?: boolean }) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");

      const { data: { user } } = await supabase.auth.getUser();

      const { data: newFee, error } = await supabase
        .from("service_fees")
        .insert([{
          ...data,
          establishment_id: establishmentId,
          created_by: user?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;
      return newFee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_fees"] });
      toast.success("Taxa criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar taxa");
    },
  });

  // Atualizar taxa/serviço
  const updateServiceFee = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; is_active?: boolean }) => {
      const { error } = await supabase
        .from("service_fees")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_fees"] });
      toast.success("Taxa atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar taxa");
    },
  });

  // Deletar taxa/serviço
  const deleteServiceFee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("service_fees")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_fees"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Taxa deletada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao deletar taxa");
    },
  });

  return {
    serviceFees: serviceFeesQuery.data || [],
    isLoading: serviceFeesQuery.isLoading,
    error: serviceFeesQuery.error,
    refetch: serviceFeesQuery.refetch,
    createServiceFee: createServiceFee.mutateAsync,
    updateServiceFee: updateServiceFee.mutateAsync,
    deleteServiceFee: deleteServiceFee.mutateAsync,
    isCreating: createServiceFee.isPending,
    isUpdating: updateServiceFee.isPending,
    isDeleting: deleteServiceFee.isPending,
  };
};


