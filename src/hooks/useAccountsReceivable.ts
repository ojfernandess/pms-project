/**
 * Hook para gerenciar Contas a Receber
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  getAccountsReceivable,
  getAccountsReceivableSummary,
  payAccountsReceivable,
  createAccountsReceivable,
  type AccountsReceivable,
  type CreateReceivableParams,
} from "@/services/financial/accountsReceivableService";
import { toast } from "sonner";

export const useAccountsReceivable = (filters?: {
  status?: AccountsReceivable['status'];
  origin?: AccountsReceivable['origin'];
  startDate?: string;
  endDate?: string;
  overdueOnly?: boolean;
}) => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  // Buscar contas a receber
  const receivablesQuery = useQuery({
    queryKey: ["accounts_receivable", establishmentId, filters],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getAccountsReceivable(establishmentId, filters);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar contas a receber");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Buscar resumo
  const summaryQuery = useQuery({
    queryKey: ["accounts_receivable_summary", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getAccountsReceivableSummary(establishmentId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar resumo");
      }
      return result.data;
    },
    enabled: !!establishmentId,
  });

  // Registrar pagamento
  const payReceivable = useMutation({
    mutationFn: async ({ receivableId, amount, paymentDate }: { receivableId: string; amount: number; paymentDate?: string }) => {
      const result = await payAccountsReceivable(receivableId, amount, paymentDate);
      if (!result.success) {
        throw new Error(result.error || "Erro ao registrar pagamento");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable_summary"] });
      toast.success("Pagamento registrado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao registrar pagamento");
    },
  });

  // Criar conta a receber manualmente
  const createReceivable = useMutation({
    mutationFn: async (params: CreateReceivableParams) => {
      const result = await createAccountsReceivable(params);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar conta a receber");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable_summary"] });
      toast.success("Conta a receber criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar conta a receber");
    },
  });

  return {
    receivables: receivablesQuery.data || [],
    summary: summaryQuery.data,
    isLoading: receivablesQuery.isLoading || summaryQuery.isLoading,
    isError: receivablesQuery.isError || summaryQuery.isError,
    error: receivablesQuery.error || summaryQuery.error,
    refetch: () => {
      receivablesQuery.refetch();
      summaryQuery.refetch();
    },
    payReceivable: payReceivable.mutate,
    isPaying: payReceivable.isPending,
    createReceivable: createReceivable.mutate,
    isCreating: createReceivable.isPending,
  };
};

