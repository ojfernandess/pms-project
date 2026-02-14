/**
 * Hook para gerenciar Conciliação Bancária
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  getBankAccounts,
  createBankAccount,
  getBankTransactions,
  importBankTransactions,
  autoMatchTransactions,
  manualMatchTransaction,
  getReconciliationSummary,
  type BankAccount,
  type BankReconciliation,
} from "@/services/financial/bankReconciliationService";
import { toast } from "sonner";

export const useBankReconciliation = (filters?: {
  bankAccountId?: string;
  status?: BankReconciliation['reconciliation_status'];
  startDate?: string;
  endDate?: string;
}) => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  // Buscar contas bancárias
  const bankAccountsQuery = useQuery({
    queryKey: ["bank_accounts", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getBankAccounts(establishmentId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar contas bancárias");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Buscar transações
  const transactionsQuery = useQuery({
    queryKey: ["bank_transactions", establishmentId, filters],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getBankTransactions(establishmentId, filters);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar transações");
      }
      return result.data || [];
    },
    enabled: !!establishmentId,
  });

  // Buscar resumo
  const summaryQuery = useQuery({
    queryKey: ["reconciliation_summary", establishmentId, filters?.bankAccountId],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getReconciliationSummary(establishmentId, filters?.bankAccountId);
      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar resumo");
      }
      return result.data;
    },
    enabled: !!establishmentId,
  });

  // Criar conta bancária
  const createAccount = useMutation({
    mutationFn: async (data: Omit<BankAccount, 'id' | 'establishment_id' | 'created_at' | 'updated_at'>) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      const result = await createBankAccount(establishmentId, data);
      if (!result.success) {
        throw new Error(result.error || "Erro ao criar conta bancária");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      toast.success("Conta bancária criada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar conta bancária");
    },
  });

  // Importar transações
  const importTransactions = useMutation({
    mutationFn: async (params: {
      bankAccountId: string;
      transactions: Array<{
        transaction_date: string;
        amount: number;
        description: string;
        transaction_type: 'credit' | 'debit';
      }>;
      importSource: 'ofx' | 'cnab' | 'csv' | 'api' | 'manual';
      fileName?: string;
    }) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      const result = await importBankTransactions(
        establishmentId,
        params.bankAccountId,
        params.transactions,
        params.importSource,
        params.fileName
      );
      if (!result.success) {
        throw new Error(result.error || "Erro ao importar transações");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation_summary"] });
      toast.success(`${result.imported} transações importadas com sucesso`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao importar transações");
    },
  });

  // Matching automático
  const matchTransactions = useMutation({
    mutationFn: async (bankAccountId?: string) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      const result = await autoMatchTransactions(establishmentId, bankAccountId);
      if (!result.success) {
        throw new Error(result.error || "Erro no matching automático");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation_summary"] });
      toast.success(`${result.matched} transações conciliadas automaticamente`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro no matching automático");
    },
  });

  // Matching manual
  const matchManual = useMutation({
    mutationFn: async (params: {
      transactionId: string;
      matchType: 'payment' | 'receivable' | 'payable';
      matchId: string;
    }) => {
      const result = await manualMatchTransaction(
        params.transactionId,
        params.matchType,
        params.matchId
      );
      if (!result.success) {
        throw new Error(result.error || "Erro ao fazer match manual");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation_summary"] });
      toast.success("Transação conciliada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao fazer match manual");
    },
  });

  return {
    bankAccounts: bankAccountsQuery.data || [],
    transactions: transactionsQuery.data || [],
    summary: summaryQuery.data,
    isLoading: bankAccountsQuery.isLoading || transactionsQuery.isLoading || summaryQuery.isLoading,
    isError: bankAccountsQuery.isError || transactionsQuery.isError || summaryQuery.isError,
    error: bankAccountsQuery.error || transactionsQuery.error || summaryQuery.error,
    refetch: () => {
      bankAccountsQuery.refetch();
      transactionsQuery.refetch();
      summaryQuery.refetch();
    },
    createAccount: createAccount.mutate,
    isCreatingAccount: createAccount.isPending,
    importTransactions: importTransactions.mutate,
    isImporting: importTransactions.isPending,
    matchTransactions: matchTransactions.mutate,
    isMatching: matchTransactions.isPending,
    matchManual: matchManual.mutate,
    isMatchingManual: matchManual.isPending,
  };
};

