import { supabase } from "@/integrations/supabase/client";
import { roundMoney } from "@/lib/financial/financialTitleStatus";

export type FinancialTitleSettlement = {
  id: string;
  establishment_id: string;
  batch_id: string | null;
  direction: "receipt" | "disbursement";
  accounts_receivable_id: string | null;
  accounts_payable_id: string | null;
  amount: number;
  effective_date: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  idempotency_key: string | null;
  payment_id: string | null;
  reversed_at: string | null;
  created_at: string;
  created_by: string | null;
};

export type RegisterReceivableSettlementParams = {
  receivableId: string;
  amount: number;
  effectiveDate?: string;
  paymentMethod?: string;
  reference?: string;
  idempotencyKey?: string;
  notes?: string;
};

export type RegisterPayableSettlementParams = {
  payableId: string;
  amount: number;
  effectiveDate?: string;
  paymentMethod?: string;
  reference?: string;
  idempotencyKey?: string;
  notes?: string;
};

export type BatchReceivableSettlementItem = {
  accounts_receivable_id: string;
  amount: number;
};

export function buildSettlementIdempotencyKey(parts: {
  scope: string;
  entityId: string;
  amount: number;
  effectiveDate: string;
  clientToken?: string;
}): string {
  const amt = roundMoney(parts.amount).toFixed(2);
  const token = parts.clientToken?.trim() || "v1";
  return `${parts.scope}:${parts.entityId}:${amt}:${parts.effectiveDate}:${token}`;
}

export async function registerReceivableSettlement(
  params: RegisterReceivableSettlementParams,
): Promise<{ success: boolean; settlementId?: string; error?: string }> {
  try {
    const effectiveDate = params.effectiveDate || new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.rpc("register_receivable_settlement", {
      p_receivable_id: params.receivableId,
      p_amount: roundMoney(params.amount),
      p_effective_date: effectiveDate,
      p_payment_method: params.paymentMethod ?? null,
      p_reference: params.reference ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_notes: params.notes ?? null,
      p_batch_id: null,
    });

    if (error) throw error;
    return { success: true, settlementId: data as string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("registerReceivableSettlement:", error);
    return { success: false, error: message };
  }
}

export async function registerPayableSettlement(
  params: RegisterPayableSettlementParams,
): Promise<{ success: boolean; settlementId?: string; error?: string }> {
  try {
    const effectiveDate = params.effectiveDate || new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.rpc("register_payable_settlement", {
      p_payable_id: params.payableId,
      p_amount: roundMoney(params.amount),
      p_effective_date: effectiveDate,
      p_payment_method: params.paymentMethod ?? null,
      p_reference: params.reference ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_notes: params.notes ?? null,
      p_batch_id: null,
    });

    if (error) throw error;
    return { success: true, settlementId: data as string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("registerPayableSettlement:", error);
    return { success: false, error: message };
  }
}

export async function registerReceivableSettlementBatch(args: {
  establishmentId: string;
  items: BatchReceivableSettlementItem[];
  effectiveDate?: string;
  paymentMethod?: string;
  reference?: string;
  idempotencyKey?: string;
  notes?: string;
}): Promise<{ success: boolean; batchId?: string; error?: string }> {
  try {
    const effectiveDate = args.effectiveDate || new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.rpc("register_receivable_settlement_batch", {
      p_establishment_id: args.establishmentId,
      p_items: args.items.map((i) => ({
        accounts_receivable_id: i.accounts_receivable_id,
        amount: roundMoney(i.amount),
      })),
      p_effective_date: effectiveDate,
      p_payment_method: args.paymentMethod ?? null,
      p_reference: args.reference ?? null,
      p_idempotency_key: args.idempotencyKey ?? null,
      p_notes: args.notes ?? null,
    });

    if (error) throw error;
    return { success: true, batchId: data as string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function listReceivableSettlements(
  receivableId: string,
): Promise<{ success: boolean; data?: FinancialTitleSettlement[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("financial_title_settlements")
      .select("*")
      .eq("accounts_receivable_id", receivableId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data || []) as FinancialTitleSettlement[] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function listPayableSettlements(
  payableId: string,
): Promise<{ success: boolean; data?: FinancialTitleSettlement[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("financial_title_settlements")
      .select("*")
      .eq("accounts_payable_id", payableId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data || []) as FinancialTitleSettlement[] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}