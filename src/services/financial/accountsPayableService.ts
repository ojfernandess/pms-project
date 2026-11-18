/**
 * Serviço de Contas a Pagar
 */

import { supabase } from "@/integrations/supabase/client";
import { titleOpenBalance } from "@/lib/financial/financialTitleStatus";
import type { RecurrencePatternId } from "@/lib/financial/expenseCategories";
import {
  buildSettlementIdempotencyKey,
  registerPayableSettlement,
} from "@/services/financial/financialSettlementsService";
import { getSupplierById } from "@/services/financial/suppliersService";

export type PayableApprovalStatus = "pending_approval" | "approved" | "rejected";

export interface AccountsPayable {
  id: string;
  establishment_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  supplier_document?: string;
  supplier_email?: string;
  supplier_phone?: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_date?: string;
  type: "ota_commission" | "gateway_fee" | "supplier" | "operational" | "tax" | "other";
  category?: string;
  cost_center?: string | null;
  document_number?: string | null;
  installment_number: number;
  total_installments: number;
  parent_payable_id?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  next_due_date?: string;
  recurrence_active?: boolean;
  approval_status?: PayableApprovalStatus;
  approval_notes?: string | null;
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
  metadata?: unknown;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  paid_by?: string;
}

export interface CreatePayableParams {
  establishment_id: string;
  supplier_id?: string;
  supplier_name: string;
  supplier_document?: string;
  supplier_email?: string;
  supplier_phone?: string;
  description: string;
  amount: number;
  due_date: string;
  type: AccountsPayable["type"];
  category?: string;
  cost_center?: string;
  document_number?: string;
  installment_number?: number;
  total_installments?: number;
  parent_payable_id?: string;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePatternId;
  next_due_date?: string;
  recurrence_active?: boolean;
  custom_interval_days?: number;
  request_approval?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Criar conta a pagar
 */
async function resolveSupplierSnapshot(params: CreatePayableParams): Promise<CreatePayableParams> {
  if (!params.supplier_id) return params;
  const supplier = await getSupplierById(params.supplier_id);
  if (!supplier.success || !supplier.data) return params;
  const s = supplier.data;
  return {
    ...params,
    supplier_name: s.name,
    supplier_document: s.document_number ?? params.supplier_document,
    supplier_email: s.email ?? params.supplier_email,
    supplier_phone: s.phone ?? params.supplier_phone,
    category: params.category || s.category || undefined,
  };
}

export async function createAccountsPayable(
  params: CreatePayableParams,
): Promise<{ success: boolean; data?: AccountsPayable; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const resolved = await resolveSupplierSnapshot(params);
    const approval_status: PayableApprovalStatus = params.request_approval ? "pending_approval" : "approved";
    const isTemplate = !!params.is_recurring;

    const metadata = {
      ...(params.metadata || {}),
      ...(params.custom_interval_days ? { custom_interval_days: params.custom_interval_days } : {}),
    };

    const { data, error } = await supabase
      .from("accounts_payable")
      .insert({
        establishment_id: resolved.establishment_id,
        supplier_id: resolved.supplier_id ?? null,
        supplier_name: resolved.supplier_name,
        supplier_document: resolved.supplier_document,
        supplier_email: resolved.supplier_email,
        supplier_phone: resolved.supplier_phone,
        description: resolved.description,
        amount: resolved.amount,
        due_date: resolved.due_date,
        type: resolved.type,
        category: resolved.category,
        cost_center: resolved.cost_center,
        document_number: resolved.document_number,
        installment_number: params.installment_number || 1,
        total_installments: params.total_installments || 1,
        parent_payable_id: params.parent_payable_id,
        is_recurring: isTemplate,
        recurrence_pattern: params.recurrence_pattern,
        next_due_date: isTemplate ? params.due_date : params.next_due_date,
        recurrence_active: isTemplate ? params.recurrence_active ?? true : false,
        approval_status,
        status: "pending",
        paid_amount: 0,
        notes: params.notes,
        metadata,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    if (isTemplate && approval_status === "approved") {
      await supabase.rpc("spawn_due_recurring_payables", {
        p_establishment_id: resolved.establishment_id,
      });
    }

    return { success: true, data: data as AccountsPayable };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Erro ao criar conta a pagar:", error);
    return { success: false, error: message };
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
        due_date: installmentDueDate.toISOString().split("T")[0],
        installment_number: i + 1,
        total_installments: installments,
        parent_payable_id: parentId,
        is_recurring: false,
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
  paymentDate?: string,
  options?: {
    paymentMethod?: string;
    reference?: string;
    idempotencyKey?: string;
    notes?: string;
  },
): Promise<{ success: boolean; settlementId?: string; error?: string }> {
  const effectiveDate = paymentDate || new Date().toISOString().split("T")[0];
  const idempotencyKey =
    options?.idempotencyKey ||
    buildSettlementIdempotencyKey({
      scope: "ap",
      entityId: payableId,
      amount,
      effectiveDate,
    });

  const result = await registerPayableSettlement({
    payableId,
    amount,
    effectiveDate,
    paymentMethod: options?.paymentMethod,
    reference: options?.reference,
    idempotencyKey,
    notes: options?.notes,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, settlementId: result.settlementId };
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
      .eq("establishment_id", establishmentId)
      .eq("is_recurring", false);

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
export type AccountsPayableSummary = {
  totalOpen: number;
  pending: number;
  overdue: number;
  paidInPeriod: number;
  pendingApproval: number;
  total: number;
  paid: number;
};

export async function getAccountsPayableSummary(
  establishmentId: string,
): Promise<{ success: boolean; data?: AccountsPayableSummary; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("accounts_payable")
      .select("amount, paid_amount, due_date, status, approval_status")
      .eq("establishment_id", establishmentId)
      .eq("is_recurring", false)
      .neq("approval_status", "rejected");

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];

    const summary = {
      totalOpen: 0,
      pending: 0,
      overdue: 0,
      paidInPeriod: 0,
      pendingApproval: 0,
      total: 0,
      paid: 0,
    };

    (data || []).forEach((p) => {
      const amount = Number(p.amount || 0);
      const paid = Number(p.paid_amount || 0);
      const open = titleOpenBalance(amount, paid);

      if (p.approval_status === "pending_approval") {
        summary.pendingApproval += amount;
        return;
      }

      if (p.status === "paid" || open <= 0.02) {
        summary.paidInPeriod += paid;
        summary.paid += paid;
        return;
      }

      if (p.status === "cancelled") return;

      summary.totalOpen += open;
      summary.total += open;

      if ((p.status === "pending" || p.status === "partial") && p.due_date < today) {
        summary.overdue += open;
      } else if (p.status === "overdue") {
        summary.overdue += open;
      } else {
        summary.pending += open;
      }
    });

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("Erro ao buscar resumo:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancelar conta a pagar
 */
export async function spawnRecurringPayables(
  establishmentId: string,
): Promise<{ success: boolean; spawned?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("spawn_due_recurring_payables", {
      p_establishment_id: establishmentId,
    });
    if (error) throw error;
    return { success: true, spawned: Number(data || 0) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function approveAccountsPayable(
  payableId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc("approve_accounts_payable", {
      p_payable_id: payableId,
      p_notes: notes ?? null,
    });
    if (error) throw error;
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function rejectAccountsPayable(
  payableId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc("reject_accounts_payable", {
      p_payable_id: payableId,
      p_notes: notes ?? null,
    });
    if (error) throw error;
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

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

