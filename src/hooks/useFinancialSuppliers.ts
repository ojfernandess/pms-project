import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  createSupplier,
  listSuppliers,
  updateSupplier,
  type CreateSupplierParams,
  type FinancialSupplier,
} from "@/services/financial/suppliersService";
import { toast } from "sonner";

export function useFinancialSuppliers(activeOnly = true) {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  const suppliersQuery = useQuery({
    queryKey: ["financial_suppliers", establishmentId, activeOnly],
    queryFn: async () => {
      if (!establishmentId) return [] as FinancialSupplier[];
      const result = await listSuppliers(establishmentId, activeOnly);
      if (!result.success) throw new Error(result.error || "Erro ao listar fornecedores");
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  const createMutation = useMutation({
    mutationFn: async (params: Omit<CreateSupplierParams, "establishment_id">) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      const result = await createSupplier({ ...params, establishment_id: establishmentId });
      if (!result.success) throw new Error(result.error || "Erro ao criar fornecedor");
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_suppliers"] });
      toast.success("Fornecedor cadastrado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CreateSupplierParams> & { is_active?: boolean } }) => {
      const result = await updateSupplier(id, patch);
      if (!result.success) throw new Error(result.error || "Erro ao atualizar fornecedor");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_suppliers"] });
      toast.success("Fornecedor atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    suppliers: suppliersQuery.data || [],
    isLoading: suppliersQuery.isLoading,
    refetch: suppliersQuery.refetch,
    createSupplier: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateSupplier: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}