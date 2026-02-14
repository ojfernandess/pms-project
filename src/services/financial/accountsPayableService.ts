/**
 * Serviço de Contas a Pagar
 */

import { supabase } from "@/integrations/supabase/client";

export interface AccountsPayable {
  id: string;
  establishment_id: string;
  supplier_name: string;
  supplier_document?: string;
  supplier_email?: string;
  supplier_phone?: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_date?: string;
  type: 'ota_commission' | 'gateway_fee' | 'supplier' | 'operational' | 'tax' | 'other';
  category?: string;
  installment_number: number;
  total_installments: number;
  parent_payable_id?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  next_due_date?: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  metadata?: any;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  paid_by?: string;
}

export interface CreatePayableParams {
  establishment_id: string;
  supplier_name: string;
  supplier_document?: string;
  supplier_email?: string;
  supplier_phone?: string;
  description: string;
  amount: number;
  due_date: string;
  type: AccountsPayable['type'];
  category?: string;
  installment_number?: number;
  total_installments?: number;
  parent_payable_id?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
  next_due_date?: string;
  notes?: string;
  metadata?: any;
}

/**
 * Criar conta a pagar
 */
export async function createAccountsPayable(
  params: CreatePayableParams
): Promise<{ success: boolean; data?: AccountsPayable; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("accounts_payable")
      .insert({
        ...params,
        status: 'pending',
        paid_amount: 0,
        installment_number: params.installment_number || 1,
        total_installments: params.total_installments || 1,
        is_recurring: params.is_recurring || false,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao criar conta a pagar:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Criar conta a pagar parcelada
 */
export async function createInstallmentPayable(
  params: CreatePayableParams & { installments: number; intervalDays?: number }
): Promise<{ success: boolean; data?: AccountsPayable[]; error?: string }> {
  try {
    const { installments, intervalDays = 30, ...baseParams } = params;
    const installmentAmount = baseParams.amount / installments;
    const dueDate = new Date(baseParams.due_date);
    
    const createdPayables: AccountsPayable[] = [];
    let parentId: string | undefined;

    for (let i = 0; i < installments; i++) {
      const installmentDueDate = new Date(dueDate);
      installmentDueDate.setDate(installmentDueDate.getDate() + (i * intervalDays));

      const result = await createAccountsPayable({
        ...baseParams,
        amount: installmentAmount,
        due_date: installmentDueDate.toISOString().split('T')[0],
        installment_number: i + 1,
        total_installments: installments,
        parent_payable_id: parentId,
      });

      if (!result.success) {
        throw new Error(result.error || "Erro ao criar parcela");
      }

      if (result.data) {
        if (!parentId) parentId = result.data.id;
        createdPayables.push(result.data);
      }
    }

    return { success: true, data: createdPayables };
  } catch (error: any) {
    console.error("Erro ao criar conta a pagar parcelada:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Registrar pagamento de conta a pagar
 */
export async function payAccountsPayable(
  payableId: string,
  amount: number,
  paymentDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Buscar conta atual
    const { data: payable, error: fetchError } = await supabase
      .from("accounts_payable")
      .select("*")
      .eq("id", payableId)
      .single();

    if (fetchError) throw fetchError;
    if (!payable) throw new Error("Conta a pagar não encontrada");

    const newPaidAmount = Number(payable.paid_amount || 0) + amount;
    const totalAmount = Number(payable.amount);

    let newStatus: AccountsPayable['status'] = 'pending';
    if (newPaidAmount >= totalAmount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    const { error } = await supabase
      .from("accounts_payable")
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        paid_date: newStatus === 'paid' ? (paymentDate || new Date().toISOString().split('T')[0]) : payable.paid_date,
        paid_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payableId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao registrar pagamento:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Buscar contas a pagar
 */
export async function getAccountsPayable(
  establishmentId: string,
  filters?: {
    status?: AccountsPayable['status'];
    type?: AccountsPayable['type'];
    startDate?: string;
    endDate?: string;
    overdueOnly?: boolean;
  }
): Promise<{ success: boolean; data?: AccountsPayable[]; error?: string }> {
  try {
    let query = supabase
      .from("accounts_payable")
      .select("*")
      .eq("establishment_id", establishmentId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.type) {
      query = query.eq("type", filters.type);
    }

    if (filters?.startDate) {
      query = query.gte("due_date", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("due_date", filters.endDate);
    }

    if (filters?.overdueOnly) {
      query = query
        .eq("status", "pending")
        .lt("due_date", new Date().toISOString().split('T')[0]);
    }

    query = query.order("due_date", { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar contas a pagar:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obter resumo de contas a pagar
 */
export async function getAccountsPayableSummary(
  establishmentId: string
): Promise<{
  success: boolean;
  data?: {
    total: number;
    pending: number;
    overdue: number;
    paid: number;
  };
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("accounts_payable")
      .select("amount, paid_amount, due_date, status")
      .eq("establishment_id", establishmentId);

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];

    const summary = {
      total: data?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0,
      pending: data?.filter((p) => p.status === 'pending' || p.status === 'partial').reduce((sum, p) => {
        const remaining = Number(p.amount || 0) - Number(p.paid_amount || 0);
        return sum + remaining;
      }, 0) || 0,
      overdue: data?.filter((p) => 
        (p.status === 'pending' || p.status === 'partial') && p.due_date < today
      ).reduce((sum, p) => {
        const remaining = Number(p.amount || 0) - Number(p.paid_amount || 0);
        return sum + remaining;
      }, 0) || 0,
      paid: data?.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0,
    };

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("Erro ao buscar resumo:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancelar conta a pagar
 */
export async function cancelAccountsPayable(
  payableId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("accounts_payable")
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq("id", payableId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao cancelar conta a pagar:", error);
    return { success: false, error: error.message };
  }
}

