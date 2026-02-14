/**
 * Hook para gerenciar Estornos
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  getRefunds,
  createRefund,
  approveRefund,
  processRefund,
  rejectRefund,
  type Refund,
  type CreateRefundParams,
} from "@/services/financial/refundService";
import { toast } from "sonner";

export const useRefunds = (filters?: {
  status?: Refund['status'];
  startDate?: string;
  endDate?: string;
}) => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  // Buscar estornos
  const refundsQuery = useQuery({
    queryKey: ["refunds", establishmentId, filters],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getRefunds(establishmentId, filters);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar estornos");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Criar estorno
  const create = useMutation({
    mutationFn: async (params: CreateRefundParams) => {
      const result = await createRefund(params);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar estorno");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      toast.success("Solicitação de estorno criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar estorno");
    },
  });

  // Aprovar estorno
  const approve = useMutation({
    mutationFn: async (refundId: string) => {
      const result = await approveRefund(refundId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao aprovar estorno");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      toast.success("Estorno aprovado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao aprovar estorno");
    },
  });

  // Processar estorno
  const process = useMutation({
    mutationFn: async (refundId: string) => {
      const result = await processRefund(refundId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao processar estorno");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      toast.success("Estorno processado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao processar estorno");
    },
  });

  // Rejeitar estorno
  const reject = useMutation({
    mutationFn: async ({ refundId, reason }: { refundId: string; reason: string }) => {
      const result = await rejectRefund(refundId, reason);
      if (!result.success) {
        throw new Error(result.error || "Erro ao rejeitar estorno");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      toast.success("Estorno rejeitado");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao rejeitar estorno");
    },
  });

  return {
    refunds: refundsQuery.data || [],
    isLoading: refundsQuery.isLoading,
    isError: refundsQuery.isError,
    error: refundsQuery.error,
    refetch: refundsQuery.refetch,
    create: create.mutate,
    isCreating: create.isPending,
    approve: approve.mutate,
    isApproving: approve.isPending,
    process: process.mutate,
    isProcessing: process.isPending,
    reject: reject.mutate,
    isRejecting: reject.isPending,
  };
};

