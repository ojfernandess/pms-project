/**
 * Serviço de Estornos
 */

import { supabase } from "@/integrations/supabase/client";

export interface Refund {
  id: string;
  establishment_id: string;
  payment_id?: string | null;
  accounts_receivable_id?: string;
  invoice_id?: string;
  reservation_id?: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'processed' | 'rejected' | 'cancelled';
  refund_method: 'original' | 'bank_transfer' | 'credit' | 'other';
  refund_date?: string;
  processed_by?: string;
  processed_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  metadata?: any;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRefundParams {
  establishment_id: string;
  payment_id: string;
  accounts_receivable_id?: string;
  invoice_id?: string;
  reservation_id?: string;
  amount: number;
  reason: string;
  refund_method?: Refund['refund_method'];
  notes?: string;
  metadata?: any;
}

export interface RecordProcessedRefundParams {
  establishment_id: string;
  payment_id: string;
  reservation_id?: string;
  amount: number;
  reason: string;
  refund_method?: Refund['refund_method'];
  notes?: string;
  metadata?: any;
}

/**
 * Criar solicitação de estorno
 */
export async function createRefund(
  params: CreateRefundParams
): Promise<{ success: boolean; data?: Refund; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Verificar se o pagamento existe e se o valor é válido
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", params.payment_id)
      .single();

    if (paymentError) throw paymentError;
    if (!payment) throw new Error("Pagamento não encontrado");

    if (params.amount > Number(payment.amount || 0)) {
      throw new Error("Valor do estorno não pode ser maior que o valor do pagamento");
    }

    const { data, error } = await supabase
      .from("financial_refunds")
      .insert({
        ...params,
        status: 'pending',
        refund_method: params.refund_method || 'original',
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      // Se a tabela não existir, criar log de auditoria
      console.warn("Tabela financial_refunds não encontrada. Criar migration.");
      return { success: false, error: "Sistema de estornos não configurado" };
    }

    // Registrar log de auditoria
    await logFinancialAudit({
      establishment_id: params.establishment_id,
      action: 'refund_created',
      entity_type: 'refund',
      entity_id: data.id,
      old_value: null,
      new_value: data,
      user_id: user?.id,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao criar estorno:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Registrar estorno já processado (estorno imediato da tela de reserva).
 * O pagamento será deletado em seguida; com ON DELETE SET NULL, payment_id ficará null.
 */
export async function recordProcessedRefund(
  params: RecordProcessedRefundParams
): Promise<{ success: boolean; data?: Refund; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const { data, error } = await supabase
      .from("financial_refunds")
      .insert({
        establishment_id: params.establishment_id,
        payment_id: params.payment_id,
        reservation_id: params.reservation_id,
        amount: params.amount,
        reason: params.reason,
        status: 'processed',
        refund_method: params.refund_method || 'original',
        refund_date: today,
        processed_by: user?.id,
        processed_at: now,
        created_by: user?.id,
        notes: params.notes,
        metadata: params.metadata,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: "Sistema de estornos não configurado (tabela financial_refunds não existe)" };
      }
      return { success: false, error: error.message || error.details || String(error) };
    }

    await logFinancialAudit({
      establishment_id: params.establishment_id,
      action: 'refund_recorded_processed',
      entity_type: 'refund',
      entity_id: data.id,
      old_value: null,
      new_value: data,
      user_id: user?.id,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao registrar estorno processado:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Aprovar estorno
 */
export async function approveRefund(
  refundId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: refund, error: fetchError } = await supabase
      .from("financial_refunds")
      .select("*")
      .eq("id", refundId)
      .single();

    if (fetchError) throw fetchError;
    if (!refund) throw new Error("Estorno não encontrado");

    if (refund.status !== 'pending') {
      throw new Error("Estorno já foi processado");
    }

    const { error } = await supabase
      .from("financial_refunds")
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);

    if (error) throw error;

    // Registrar log de auditoria
    await logFinancialAudit({
      establishment_id: refund.establishment_id,
      action: 'refund_approved',
      entity_type: 'refund',
      entity_id: refundId,
      old_value: refund,
      new_value: { ...refund, status: 'approved', approved_by: user?.id },
      user_id: user?.id,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao aprovar estorno:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Processar estorno
 */
export async function processRefund(
  refundId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: refund, error: fetchError } = await supabase
      .from("financial_refunds")
      .select("*")
      .eq("id", refundId)
      .single();

    if (fetchError) throw fetchError;
    if (!refund) throw new Error("Estorno não encontrado");

    if (refund.status !== 'approved') {
      throw new Error("Estorno precisa ser aprovado antes de ser processado");
    }

    // Atualizar status do estorno
    const { error: updateError } = await supabase
      .from("financial_refunds")
      .update({
        status: 'processed',
        processed_by: user?.id,
        processed_at: new Date().toISOString(),
        refund_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);

    if (updateError) throw updateError;

    // Reverter pagamento na conta a receber se houver
    if (refund.accounts_receivable_id) {
      const { data: receivable } = await supabase
        .from("accounts_receivable")
        .select("*")
        .eq("id", refund.accounts_receivable_id)
        .single();

      if (receivable) {
        const newPaidAmount = Math.max(0, Number(receivable.paid_amount || 0) - refund.amount);
        const newStatus = newPaidAmount === 0 ? 'pending' : 
                         newPaidAmount < Number(receivable.amount) ? 'partial' : 'paid';

        await supabase
          .from("accounts_receivable")
          .update({
            paid_amount: newPaidAmount,
            status: newStatus,
            paid_date: newStatus === 'paid' ? receivable.paid_date : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", refund.accounts_receivable_id);
      }
    }

    // Registrar log de auditoria
    await logFinancialAudit({
      establishment_id: refund.establishment_id,
      action: 'refund_processed',
      entity_type: 'refund',
      entity_id: refundId,
      old_value: refund,
      new_value: { ...refund, status: 'processed', processed_by: user?.id },
      user_id: user?.id,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao processar estorno:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Rejeitar estorno
 */
export async function rejectRefund(
  refundId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: refund, error: fetchError } = await supabase
      .from("financial_refunds")
      .select("*")
      .eq("id", refundId)
      .single();

    if (fetchError) throw fetchError;
    if (!refund) throw new Error("Estorno não encontrado");

    const { error } = await supabase
      .from("financial_refunds")
      .update({
        status: 'rejected',
        rejected_by: user?.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao rejeitar estorno:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Buscar estornos
 */
export async function getRefunds(
  establishmentId: string,
  filters?: {
    status?: Refund['status'];
    startDate?: string;
    endDate?: string;
  }
): Promise<{ success: boolean; data?: Refund[]; error?: string }> {
  try {
    let query = supabase
      .from("financial_refunds")
      .select("*")
      .eq("establishment_id", establishmentId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      // Se a tabela não existir, retornar vazio
      if (error.code === '42P01') {
        return { success: true, data: [] };
      }
      throw error;
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar estornos:", error);
    return { success: false, error: error.message };
  }
}

/** Mapeia o rótulo da operação para action_type (CHECK em financial_audit_logs). */
function mapAuditActionType(
  detail: string
): "create" | "update" | "delete" | "approve" | "reject" | "reverse" | "refund" {
  switch (detail) {
    case "refund_created":
      return "create";
    case "refund_recorded_processed":
      return "refund";
    case "refund_approved":
      return "approve";
    case "refund_processed":
      return "update";
    default:
      return "update";
  }
}

/**
 * Registrar log de auditoria financeira
 */
async function logFinancialAudit(params: {
  establishment_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: any;
  new_value: any;
  user_id?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from("financial_audit_logs").insert({
      establishment_id: params.establishment_id,
      action_type: mapAuditActionType(params.action),
      reason: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      old_values: params.old_value,
      new_values: params.new_value,
      user_id: params.user_id,
      ip_address: null,
      user_agent: null,
    });
    if (error) {
      console.warn("Erro ao registrar log de auditoria:", error);
    }
  } catch (error) {
    console.warn("Erro ao registrar log de auditoria:", error);
  }
}

