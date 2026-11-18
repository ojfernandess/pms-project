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
  createInstallmentReceivable,
  payAccountsReceivableBatch,
  cancelAccountsReceivable,
  type AccountsReceivable,
  type CreateReceivableParams,
} from "@/services/financial/accountsReceivableService";
import type { BatchReceivableSettlementItem } from "@/services/financial/financialSettlementsService";
import { buildSettlementIdempotencyKey } from "@/services/financial/financialSettlementsService";
import { toast } from "sonner";

export const useAccountsReceivable = (filters?: {
  status?: AccountsReceivable["status"];
  origin?: AccountsReceivable["origin"];
  debtorType?: AccountsReceivable["debtor_type"];
  category?: string;
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
    mutationFn: async ({
      receivableId,
      amount,
      paymentDate,
      paymentMethod,
      reference,
    }: {
      receivableId: string;
      amount: number;
      paymentDate?: string;
      paymentMethod?: string;
      reference?: string;
    }) => {
      const result = await payAccountsReceivable(receivableId, amount, paymentDate, {
        paymentMethod,
        reference,
      });
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

  const createInstallment = useMutation({
    mutationFn: async (params: CreateReceivableParams & { installments: number; intervalDays?: number }) => {
      const result = await createInstallmentReceivable(params);
      if (!result.success) throw new Error(result.error || "Erro ao parcelar conta a receber");
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable_summary"] });
      toast.success("Parcelas criadas com sucesso");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const payReceivableBatch = useMutation({
    mutationFn: async (args: {
      items: BatchReceivableSettlementItem[];
      effectiveDate?: string;
      paymentMethod?: string;
      reference?: string;
      notes?: string;
    }) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      const effectiveDate = args.effectiveDate || new Date().toISOString().split("T")[0];
      const total = args.items.reduce((s, i) => s + i.amount, 0);
      const idempotencyKey = buildSettlementIdempotencyKey({
        scope: "ar_batch",
        entityId: args.items.map((i) => i.accounts_receivable_id).join(","),
        amount: total,
        effectiveDate,
      });
      const result = await payAccountsReceivableBatch(establishmentId, args.items, {
        ...args,
        idempotencyKey,
      });
      if (!result.success) throw new Error(result.error || "Erro no recebimento em lote");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable_summary"] });
      toast.success("Recebimento em lote registrado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelReceivable = useMutation({
    mutationFn: async (receivableId: string) => {
      const result = await cancelAccountsReceivable(receivableId);
      if (!result.success) throw new Error(result.error || "Erro ao cancelar");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable_summary"] });
      toast.success("Título cancelado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
    createInstallment: createInstallment.mutate,
    isCreatingInstallment: createInstallment.isPending,
    payReceivableBatch: payReceivableBatch.mutate,
    isPayingBatch: payReceivableBatch.isPending,
    cancelReceivable: cancelReceivable.mutate,
    isCancelling: cancelReceivable.isPending,
  };
};

