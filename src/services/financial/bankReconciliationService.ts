/**
 * Serviço de Conciliação Bancária
 */

import { supabase } from "@/integrations/supabase/client";

export interface BankAccount {
  id: string;
  establishment_id: string;
  bank_name: string;
  bank_code?: string;
  agency_number: string;
  agency_digit?: string;
  account_number: string;
  account_digit?: string;
  account_type: 'checking' | 'savings' | 'investment' | 'other';
  holder_name: string;
  holder_document?: string;
  holder_type?: 'individual' | 'company';
  is_active: boolean;
  is_default: boolean;
  currency: string;
  integration_type?: string;
  integration_config?: any;
  notes?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface BankReconciliation {
  id: string;
  establishment_id: string;
  bank_account_id?: string;
  bank_name: string;
  account_number?: string;
  transaction_date: string;
  amount: number;
  description?: string;
  transaction_type: 'credit' | 'debit';
  import_source: 'ofx' | 'cnab' | 'csv' | 'api' | 'manual';
  import_file_name?: string;
  import_date?: string;
  raw_data?: any;
  matched_payment_id?: string;
  matched_accounts_receivable_id?: string;
  matched_accounts_payable_id?: string;
  reconciliation_status: 'pending' | 'auto_matched' | 'manual_matched' | 'divergent' | 'ignored';
  matched_at?: string;
  matched_by?: string;
  matching_rules?: any;
  metadata?: any;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationMatch {
  transaction: BankReconciliation;
  match_type: 'payment' | 'receivable' | 'payable';
  match_id: string;
  match_score: number;
  matching_rules: string[];
}

/**
 * Criar conta bancária
 */
export async function createBankAccount(
  establishmentId: string,
  data: Omit<BankAccount, 'id' | 'establishment_id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; data?: BankAccount; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Se for conta padrão, desmarcar outras
    if (data.is_default) {
      const { error: updateError } = await supabase
        .from("bank_accounts")
        .update({ is_default: false })
        .eq("establishment_id", establishmentId)
        .eq("is_default", true);
      
      // Ignorar erro se tabela não existir
      if (updateError && updateError.code !== 'PGRST205') {
        console.warn("Erro ao atualizar contas padrão:", updateError);
      }
    }

    const { data: account, error } = await supabase
      .from("bank_accounts")
      .insert({
        establishment_id: establishmentId,
        ...data,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('not found')) {
        return { 
          success: false, 
          error: "Tabela bank_accounts não encontrada. Execute a migration 20250126000003_create_bank_accounts.sql no Supabase" 
        };
      }
      throw error;
    }

    return { success: true, data: account };
  } catch (error: any) {
    console.error("Erro ao criar conta bancária:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Listar contas bancárias
 */
export async function getBankAccounts(
  establishmentId: string
): Promise<{ success: boolean; data?: BankAccount[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    // Se a tabela não existir, retornar array vazio
    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('not found')) {
        console.warn("Tabela bank_accounts não encontrada. Execute a migration 20250126000003_create_bank_accounts.sql");
        return { success: true, data: [] };
      }
      throw error;
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar contas bancárias:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Importar transações bancárias (CSV/OFX)
 */
export async function importBankTransactions(
  establishmentId: string,
  bankAccountId: string,
  transactions: Array<{
    transaction_date: string;
    amount: number;
    description: string;
    transaction_type: 'credit' | 'debit';
  }>,
  importSource: 'ofx' | 'cnab' | 'csv' | 'api' | 'manual',
  fileName?: string
): Promise<{ success: boolean; imported: number; error?: string }> {
  try {
    const bankAccount = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("id", bankAccountId)
      .single();

    if (bankAccount.error) throw bankAccount.error;

    const transactionsToInsert = transactions.map((t) => ({
      establishment_id: establishmentId,
      bank_account_id: bankAccountId,
      bank_name: bankAccount.data.bank_name,
      account_number: bankAccount.data.account_number,
      transaction_date: t.transaction_date,
      amount: Math.abs(t.amount),
      description: t.description,
      transaction_type: t.transaction_type,
      import_source: importSource,
      import_file_name: fileName,
      import_date: new Date().toISOString(),
      reconciliation_status: 'pending' as const,
    }));

    const { error } = await supabase
      .from("bank_reconciliation")
      .insert(transactionsToInsert);

    if (error) throw error;

    // Tentar matching automático
    await autoMatchTransactions(establishmentId, bankAccountId);

    return { success: true, imported: transactions.length };
  } catch (error: any) {
    console.error("Erro ao importar transações:", error);
    return { success: false, imported: 0, error: error.message };
  }
}

/**
 * Matching automático de transações
 */
export async function autoMatchTransactions(
  establishmentId: string,
  bankAccountId?: string
): Promise<{ success: boolean; matched: number; error?: string }> {
  try {
    // Buscar transações pendentes
    let query = supabase
      .from("bank_reconciliation")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("reconciliation_status", "pending");

    if (bankAccountId) {
      query = query.eq("bank_account_id", bankAccountId);
    }

    const { data: transactions, error: transError } = await query;

    if (transError) throw transError;
    if (!transactions || transactions.length === 0) {
      return { success: true, matched: 0 };
    }

    let matchedCount = 0;

    for (const transaction of transactions) {
      const match = await findBestMatch(transaction);
      
      if (match) {
        const { error: updateError } = await supabase
          .from("bank_reconciliation")
          .update({
            reconciliation_status: 'auto_matched',
            matched_payment_id: match.match_type === 'payment' ? match.match_id : null,
            matched_accounts_receivable_id: match.match_type === 'receivable' ? match.match_id : null,
            matched_accounts_payable_id: match.match_type === 'payable' ? match.match_id : null,
            matched_at: new Date().toISOString(),
            matching_rules: match.matching_rules,
          })
          .eq("id", transaction.id);

        if (!updateError) {
          matchedCount++;
        }
      }
    }

    return { success: true, matched: matchedCount };
  } catch (error: any) {
    console.error("Erro no matching automático:", error);
    return { success: false, matched: 0, error: error.message };
  }
}

/**
 * Encontrar melhor match para uma transação
 */
async function findBestMatch(
  transaction: BankReconciliation
): Promise<ReconciliationMatch | null> {
  const matches: ReconciliationMatch[] = [];

  // Regra 1: Match por valor e data (tolerância de 2 dias)
  const dateTolerance = 2; // dias
  const minDate = new Date(transaction.transaction_date);
  minDate.setDate(minDate.getDate() - dateTolerance);
  const maxDate = new Date(transaction.transaction_date);
  maxDate.setDate(maxDate.getDate() + dateTolerance);

  // Buscar em pagamentos
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("establishment_id", transaction.establishment_id)
    .eq("amount", transaction.amount)
    .gte("payment_date", minDate.toISOString().split('T')[0])
    .lte("payment_date", maxDate.toISOString().split('T')[0]);

  if (payments && payments.length > 0) {
    matches.push({
      transaction,
      match_type: 'payment',
      match_id: payments[0].id,
      match_score: 100,
      matching_rules: ['Valor e data correspondem'],
    });
  }

  // Buscar em contas a receber
  const { data: receivables } = await supabase
    .from("accounts_receivable")
    .select("*")
    .eq("establishment_id", transaction.establishment_id)
    .eq("amount", transaction.amount)
    .gte("due_date", minDate.toISOString().split('T')[0])
    .lte("due_date", maxDate.toISOString().split('T')[0])
    .in("status", ['pending', 'partial']);

  if (receivables && receivables.length > 0) {
    matches.push({
      transaction,
      match_type: 'receivable',
      match_id: receivables[0].id,
      match_score: 90,
      matching_rules: ['Valor e data de vencimento correspondem'],
    });
  }

  // Retornar melhor match
  if (matches.length > 0) {
    return matches.sort((a, b) => b.match_score - a.match_score)[0];
  }

  return null;
}

/**
 * Listar transações bancárias
 */
export async function getBankTransactions(
  establishmentId: string,
  filters?: {
    bankAccountId?: string;
    status?: BankReconciliation['reconciliation_status'];
    startDate?: string;
    endDate?: string;
  }
): Promise<{ success: boolean; data?: BankReconciliation[]; error?: string }> {
  try {
    let query = supabase
      .from("bank_reconciliation")
      .select("*")
      .eq("establishment_id", establishmentId);

    if (filters?.bankAccountId) {
      query = query.eq("bank_account_id", filters.bankAccountId);
    }

    if (filters?.status) {
      query = query.eq("reconciliation_status", filters.status);
    }

    if (filters?.startDate) {
      query = query.gte("transaction_date", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("transaction_date", filters.endDate);
    }

    query = query.order("transaction_date", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar transações:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Match manual de transação
 */
export async function manualMatchTransaction(
  transactionId: string,
  matchType: 'payment' | 'receivable' | 'payable',
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const updateData: any = {
      reconciliation_status: 'manual_matched',
      matched_at: new Date().toISOString(),
      matched_by: user?.id,
    };

    if (matchType === 'payment') {
      updateData.matched_payment_id = matchId;
    } else if (matchType === 'receivable') {
      updateData.matched_accounts_receivable_id = matchId;
    } else if (matchType === 'payable') {
      updateData.matched_accounts_payable_id = matchId;
    }

    const { error } = await supabase
      .from("bank_reconciliation")
      .update(updateData)
      .eq("id", transactionId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao fazer match manual:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obter resumo de conciliação
 */
export async function getReconciliationSummary(
  establishmentId: string,
  bankAccountId?: string
): Promise<{
  success: boolean;
  data?: {
    total: number;
    pending: number;
    auto_matched: number;
    manual_matched: number;
    divergent: number;
    total_amount: number;
    matched_amount: number;
  };
  error?: string;
}> {
  try {
    let query = supabase
      .from("bank_reconciliation")
      .select("reconciliation_status, amount")
      .eq("establishment_id", establishmentId);

    if (bankAccountId) {
      query = query.eq("bank_account_id", bankAccountId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const summary = {
      total: data?.length || 0,
      pending: data?.filter((t) => t.reconciliation_status === 'pending').length || 0,
      auto_matched: data?.filter((t) => t.reconciliation_status === 'auto_matched').length || 0,
      manual_matched: data?.filter((t) => t.reconciliation_status === 'manual_matched').length || 0,
      divergent: data?.filter((t) => t.reconciliation_status === 'divergent').length || 0,
      total_amount: data?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0,
      matched_amount: data?.filter((t) => 
        t.reconciliation_status === 'auto_matched' || t.reconciliation_status === 'manual_matched'
      ).reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0,
    };

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("Erro ao buscar resumo:", error);
    return { success: false, error: error.message };
  }
}

