/**
 * Hook para gerenciar Faturas
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  getInvoices,
  createInvoice,
  createInvoiceFromReceivable,
  issueInvoice,
  payInvoice,
  cancelInvoice,
  type Invoice,
  type CreateInvoiceParams,
} from "@/services/financial/invoiceService";
import { toast } from "sonner";

export const useInvoices = (filters?: {
  status?: Invoice['status'];
  type?: Invoice['type'];
  startDate?: string;
  endDate?: string;
}) => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  // Buscar faturas
  const invoicesQuery = useQuery({
    queryKey: ["invoices", establishmentId, filters],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getInvoices(establishmentId, filters);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar faturas");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Criar fatura
  const create = useMutation({
    mutationFn: async (params: CreateInvoiceParams) => {
      const result = await createInvoice(params);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar fatura");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Fatura criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar fatura");
    },
  });

  // Criar fatura de conta a receber
  const createFromReceivable = useMutation({
    mutationFn: async (receivableId: string) => {
      const result = await createInvoiceFromReceivable(receivableId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar fatura");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      toast.success("Fatura criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar fatura");
    },
  });

  // Emitir fatura
  const issue = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await issueInvoice(invoiceId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao emitir fatura");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Fatura emitida com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao emitir fatura");
    },
  });

  // Registrar pagamento
  const pay = useMutation({
    mutationFn: async ({ invoiceId, amount }: { invoiceId: string; amount: number }) => {
      const result = await payInvoice(invoiceId, amount);
      if (!result.success) {
        throw new Error(result.error || "Erro ao registrar pagamento");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      toast.success("Pagamento registrado com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao registrar pagamento");
    },
  });

  // Cancelar fatura
  const cancel = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await cancelInvoice(invoiceId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao cancelar fatura");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Fatura cancelada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao cancelar fatura");
    },
  });

  return {
    invoices: invoicesQuery.data || [],
    isLoading: invoicesQuery.isLoading,
    isError: invoicesQuery.isError,
    error: invoicesQuery.error,
    refetch: invoicesQuery.refetch,
    create: create.mutate,
    isCreating: create.isPending,
    createFromReceivable: createFromReceivable.mutate,
    isCreatingFromReceivable: createFromReceivable.isPending,
    issue: issue.mutate,
    isIssuing: issue.isPending,
    pay: pay.mutate,
    isPaying: pay.isPending,
    cancel: cancel.mutate,
    isCancelling: cancel.isPending,
  };
};

