/**
 * Hook para gerenciar Contas a Pagar
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  getAccountsPayable,
  getAccountsPayableSummary,
  payAccountsPayable,
  createAccountsPayable,
  createInstallmentPayable,
  cancelAccountsPayable,
  type AccountsPayable,
  type CreatePayableParams,
} from "@/services/financial/accountsPayableService";
import { toast } from "sonner";

export const useAccountsPayable = (filters?: {
  status?: AccountsPayable['status'];
  type?: AccountsPayable['type'];
  startDate?: string;
  endDate?: string;
  overdueOnly?: boolean;
}) => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  // Buscar contas a pagar
  const payablesQuery = useQuery({
    queryKey: ["accounts_payable", establishmentId, filters],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getAccountsPayable(establishmentId, filters);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar contas a pagar");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Buscar resumo
  const summaryQuery = useQuery({
    queryKey: ["accounts_payable_summary", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getAccountsPayableSummary(establishmentId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar resumo");
      }
      return result.data;
    },
    enabled: !!establishmentId,
  });

  // Registrar pagamento
  const payPayable = useMutation({
    mutationFn: async ({ payableId, amount, paymentDate }: { payableId: string; amount: number; paymentDate?: string }) => {
      const result = await payAccountsPayable(payableId, amount, paymentDate);
      if (!result.success) {
        throw new Error(result.error || "Erro ao registrar pagamento");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_payable_summary"] });
      toast.success("Pagamento registrado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao registrar pagamento");
    },
  });

  // Criar conta a pagar
  const createPayable = useMutation({
    mutationFn: async (params: CreatePayableParams) => {
      const result = await createAccountsPayable(params);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar conta a pagar");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_payable_summary"] });
      toast.success("Conta a pagar criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar conta a pagar");
    },
  });

  // Criar conta parcelada
  const createInstallment = useMutation({
    mutationFn: async (params: CreatePayableParams & { installments: number; intervalDays?: number }) => {
      const result = await createInstallmentPayable(params);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar conta parcelada");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_payable_summary"] });
      toast.success("Conta parcelada criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar conta parcelada");
    },
  });

  // Cancelar conta
  const cancelPayable = useMutation({
    mutationFn: async (payableId: string) => {
      const result = await cancelAccountsPayable(payableId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao cancelar conta");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_payable_summary"] });
      toast.success("Conta cancelada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao cancelar conta");
    },
  });

  return {
    payables: payablesQuery.data || [],
    summary: summaryQuery.data,
    isLoading: payablesQuery.isLoading || summaryQuery.isLoading,
    isError: payablesQuery.isError || summaryQuery.isError,
    error: payablesQuery.error || summaryQuery.error,
    refetch: () => {
      payablesQuery.refetch();
      summaryQuery.refetch();
    },
    payPayable: payPayable.mutate,
    isPaying: payPayable.isPending,
    createPayable: createPayable.mutate,
    isCreating: createPayable.isPending,
    createInstallment: createInstallment.mutate,
    isCreatingInstallment: createInstallment.isPending,
    cancelPayable: cancelPayable.mutate,
    isCancelling: cancelPayable.isPending,
  };
};

