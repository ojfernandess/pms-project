/**
 * Serviço de Contas a Receber
 * 
 * Gerencia a criação automática e manual de contas a receber
 * a partir de reservas, pré-pagamentos, multas, etc.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  computeFinancialTitleStatus,
  reservationReceivableBalance,
  roundMoney,
  titleOpenBalance,
} from "@/lib/financial/financialTitleStatus";
import type { ExpectedPaymentMethodId, ReceivableCategoryId } from "@/lib/financial/receivableCategories";
import {
  buildSettlementIdempotencyKey,
  registerReceivableSettlement,
  registerReceivableSettlementBatch,
  type BatchReceivableSettlementItem,
} from "@/services/financial/financialSettlementsService";
import { searchEstablishmentClients } from "@/services/financial/financialDebtorsService";

export type ReceivableDebtorType = "guest" | "company" | "other";

export interface AccountsReceivable {
  id: string;
  establishment_id: string;
  reservation_id?: string | null;
  client_id?: string | null;
  debtor_type?: ReceivableDebtorType;
  debtor_name?: string | null;
  debtor_document?: string | null;
  financial_category?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expected_payment_method?: string | null;
  installment_number?: number;
  total_installments?: number;
  parent_receivable_id?: string | null;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_date?: string | null;
  origin:
    | "reservation"
    | "prepayment"
    | "penalty"
    | "cancellation_penalty"
    | "no_show_penalty"
    | "extra_consumption"
    | "service_fee"
    | "checkin_charge"
    | "manual"
    | "other";
  type: "reservation" | "penalty" | "service" | "extension" | "other";
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
  metadata?: Record<string, unknown>;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  paid_by?: string | null;
}

export interface CreateReceivableParams {
  establishment_id: string;
  reservation_id?: string;
  client_id?: string;
  debtor_type?: ReceivableDebtorType;
  debtor_name?: string;
  debtor_document?: string;
  financial_category?: ReceivableCategoryId;
  document_number?: string;
  issue_date?: string;
  expected_payment_method?: ExpectedPaymentMethodId | string;
  description: string;
  amount: number;
  due_date: string;
  origin?: AccountsReceivable["origin"];
  type?: AccountsReceivable["type"];
  metadata?: Record<string, unknown>;
  notes?: string;
}

export type AccountsReceivableSummary = {
  totalOpen: number;
  pending: number;
  overdue: number;
  paidInPeriod: number;
  partialOpen: number;
  total: number;
  paid: number;
  partial: number;
};

async function resolveDebtorFromClient(
  establishmentId: string,
  clientId: string,
  debtorType: ReceivableDebtorType,
): Promise<{ debtor_name: string; debtor_document?: string } | null> {
  const result = await searchEstablishmentClients(establishmentId);
  if (!result.success || !result.data) return null;
  const client = result.data.find((c) => c.id === clientId);
  if (!client) {
    const { data } = await supabase
      .from("clients")
      .select("full_name, document_number")
      .eq("id", clientId)
      .maybeSingle();
    if (!data) return null;
    return {
      debtor_name: data.full_name,
      debtor_document: data.document_number ?? undefined,
    };
  }
  return {
    debtor_name: client.full_name,
    debtor_document: client.document_number ?? undefined,
  };
}

/**
 * Criar conta a receber
 */
export async function createAccountsReceivable(
  params: CreateReceivableParams,
  options?: { paid_amount?: number; status?: AccountsReceivable["status"] },
): Promise<{ success: boolean; data?: AccountsReceivable; error?: string }> {
  try {
    const paid_amount = roundMoney(options?.paid_amount ?? 0);
    const status =
      options?.status ??
      computeFinancialTitleStatus({
        amount: params.amount,
        paidAmount: paid_amount,
        dueDate: params.due_date,
      });

    const origin = params.origin ?? "manual";
    const type = params.type ?? "other";
    let debtor_name = params.debtor_name;
    let debtor_document = params.debtor_document;
    const debtor_type = params.debtor_type ?? (params.client_id ? "guest" : "other");

    if (params.client_id && !debtor_name) {
      const snap = await resolveDebtorFromClient(params.establishment_id, params.client_id, debtor_type);
      if (snap) {
        debtor_name = snap.debtor_name;
        debtor_document = debtor_document ?? snap.debtor_document;
      }
    }

    if (!debtor_name?.trim()) {
      return { success: false, error: "Informe o cliente ou empresa devedora." };
    }

    const { data, error } = await supabase
      .from("accounts_receivable")
      .insert({
        establishment_id: params.establishment_id,
        reservation_id: params.reservation_id ?? null,
        client_id: params.client_id ?? null,
        debtor_type,
        debtor_name: debtor_name.trim(),
        debtor_document: debtor_document ?? null,
        financial_category: params.financial_category ?? null,
        document_number: params.document_number ?? null,
        issue_date: params.issue_date ?? new Date().toISOString().split("T")[0],
        expected_payment_method: params.expected_payment_method ?? null,
        description: params.description,
        amount: params.amount,
        due_date: params.due_date,
        origin,
        type,
        paid_amount,
        status,
        installment_number: 1,
        total_installments: 1,
        notes: params.notes ?? null,
        metadata: params.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as AccountsReceivable };
  } catch (error: any) {
    console.error("Erro ao criar conta a receber:", error);
    return { success: false, error: error.message || "Erro ao criar conta a receber" };
  }
}

/**
 * Criar conta a receber automaticamente a partir de reserva
 */
export async function createReceivableFromReservation(
  reservationId: string
): Promise<{ success: boolean; data?: AccountsReceivable; error?: string }> {
  try {
    // Buscar dados da reserva
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select(`
        id,
        establishment_id,
        client_id,
        guest_id,
        total_amount,
        paid_amount,
        checkin_date,
        checkout_date,
        reservation_code,
        lodging_reservation_id,
        channel,
        guest:clients!guest_id(full_name)
      `)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    if (
      reservation.lodging_reservation_id &&
      Number(reservation.total_amount || 0) === 0 &&
      reservation.channel === "parking"
    ) {
      return { success: false, error: "Vaga de estacionamento não gera conta a receber neste módulo." };
    }

    const { data: feeRows } = await supabase
      .from("reservation_service_fees")
      .select("amount, quantity")
      .eq("reservation_id", reservationId);

    const serviceFeesTotal = (feeRows ?? []).reduce(
      (sum, row) => sum + Number(row.amount || 0) * Number(row.quantity || 1),
      0,
    );

    const balance = reservationReceivableBalance({
      totalAmount: Number(reservation.total_amount || 0),
      serviceFeesTotal,
      paidAmount: Number(reservation.paid_amount || 0),
    });

    if (!balance.shouldHaveOpenTitle) {
      return {
        success: false,
        error: "Reserva sem saldo pendente — não é necessário título a receber.",
      };
    }

    const { data: existing } = await supabase
      .from("accounts_receivable")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("origin", "reservation")
      .neq("status", "cancelled")
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: "Já existe título vinculado a esta reserva." };
    }

    const dueDate = reservation.checkin_date;
    const status = computeFinancialTitleStatus({
      amount: balance.grossAmount,
      paidAmount: balance.paidAmount,
      dueDate,
    });

    return await createAccountsReceivable(
      {
        establishment_id: reservation.establishment_id,
        reservation_id: reservationId,
        client_id: (reservation as any).client_id,
        description: `Reserva ${reservation.reservation_code} - ${(reservation as any).guest?.full_name || "Hóspede"}`,
        amount: balance.grossAmount,
        due_date: dueDate,
        origin: "reservation",
        type: "reservation",
        metadata: {
          reservation_code: reservation.reservation_code,
          checkin_date: reservation.checkin_date,
          checkout_date: reservation.checkout_date,
          open_balance: balance.openBalance,
        },
      },
      { paid_amount: balance.paidAmount, status },
    );
  } catch (error: any) {
    console.error("Erro ao criar conta a receber da reserva:", error);
    return { success: false, error: error.message || "Erro ao criar conta a receber" };
  }
}

/**
 * Criar conta a receber para multa de cancelamento
 */
export async function createReceivableFromCancellationPenalty(
  reservationId: string,
  penaltyAmount: number,
  policyName: string
): Promise<{ success: boolean; data?: AccountsReceivable; error?: string }> {
  try {
    // Buscar dados da reserva
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select(`
        id,
        establishment_id,
        client_id,
        reservation_code,
        guest:clients!guest_id(full_name)
      `)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    // Vencimento: 7 dias após cancelamento
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    return await createAccountsReceivable({
      establishment_id: reservation.establishment_id,
      reservation_id: reservationId,
      client_id: (reservation as any).client_id,
      description: `Multa de Cancelamento - Reserva ${reservation.reservation_code} - Política: ${policyName}`,
      amount: penaltyAmount,
      due_date: dueDate.toISOString().split('T')[0],
      origin: 'cancellation_penalty',
      type: 'penalty',
      metadata: {
        reservation_code: reservation.reservation_code,
        policy_name: policyName,
        penalty_type: 'cancellation',
      },
    });
  } catch (error: any) {
    console.error("Erro ao criar conta a receber de multa:", error);
    return { success: false, error: error.message || "Erro ao criar conta a receber" };
  }
}

/**
 * Criar conta a receber para multa de no-show
 */
export async function createReceivableFromNoShowPenalty(
  reservationId: string,
  penaltyAmount: number,
  policyName: string
): Promise<{ success: boolean; data?: AccountsReceivable; error?: string }> {
  try {
    // Buscar dados da reserva
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select(`
        id,
        establishment_id,
        client_id,
        reservation_code,
        guest:clients!guest_id(full_name)
      `)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    // Vencimento: 7 dias após no-show
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    return await createAccountsReceivable({
      establishment_id: reservation.establishment_id,
      reservation_id: reservationId,
      client_id: (reservation as any).client_id,
      description: `Multa de No-Show - Reserva ${reservation.reservation_code} - Política: ${policyName}`,
      amount: penaltyAmount,
      due_date: dueDate.toISOString().split('T')[0],
      origin: 'no_show_penalty',
      type: 'penalty',
      metadata: {
        reservation_code: reservation.reservation_code,
        policy_name: policyName,
        penalty_type: 'no_show',
      },
    });
  } catch (error: any) {
    console.error("Erro ao criar conta a receber de no-show:", error);
    return { success: false, error: error.message || "Erro ao criar conta a receber" };
  }
}

/**
 * Criar contas a receber parceladas (manual)
 */
export async function createInstallmentReceivable(
  params: CreateReceivableParams & { installments: number; intervalDays?: number },
): Promise<{ success: boolean; data?: AccountsReceivable[]; error?: string }> {
  try {
    const { installments, intervalDays = 30, ...baseParams } = params;
    if (installments < 2) {
      const single = await createAccountsReceivable(baseParams);
      if (!single.success || !single.data) throw new Error(single.error);
      return { success: true, data: [single.data] };
    }

    const installmentAmount = roundMoney(baseParams.amount / installments);
    const dueDate = new Date(baseParams.due_date);
    const created: AccountsReceivable[] = [];
    let parentId: string | undefined;

    for (let i = 0; i < installments; i++) {
      const installmentDue = new Date(dueDate);
      installmentDue.setDate(installmentDue.getDate() + i * intervalDays);

      const result = await createAccountsReceivable({
        ...baseParams,
        description: `${baseParams.description} (${i + 1}/${installments})`,
        amount: installmentAmount,
        due_date: installmentDue.toISOString().split("T")[0],
        metadata: {
          ...(baseParams.metadata || {}),
          installment_number: i + 1,
          total_installments: installments,
          parent_receivable_id: parentId,
        },
      });

      if (!result.success || !result.data) throw new Error(result.error);

      if (!parentId) {
        parentId = result.data.id;
        await supabase
          .from("accounts_receivable")
          .update({
            installment_number: 1,
            total_installments: installments,
            updated_at: new Date().toISOString(),
          })
          .eq("id", parentId);
      }

      await supabase
        .from("accounts_receivable")
        .update({
          installment_number: i + 1,
          total_installments: installments,
          parent_receivable_id: parentId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.data.id);

      created.push({ ...result.data, installment_number: i + 1, total_installments: installments, parent_receivable_id: parentId });
    }

    return { success: true, data: created };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function payAccountsReceivableBatch(
  establishmentId: string,
  items: BatchReceivableSettlementItem[],
  options?: {
    effectiveDate?: string;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
    idempotencyKey?: string;
  },
): Promise<{ success: boolean; batchId?: string; error?: string }> {
  if (!items.length) return { success: false, error: "Nenhum título selecionado" };
  return registerReceivableSettlementBatch({
    establishmentId,
    items,
    effectiveDate: options?.effectiveDate,
    paymentMethod: options?.paymentMethod,
    reference: options?.reference,
    notes: options?.notes,
    idempotencyKey: options?.idempotencyKey,
  });
}

export async function cancelAccountsReceivable(
  receivableId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("accounts_receivable")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", receivableId);

    if (error) throw error;
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Registrar pagamento de conta a receber
 */
export async function payAccountsReceivable(
  receivableId: string,
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
      scope: "ar",
      entityId: receivableId,
      amount,
      effectiveDate,
    });

  const result = await registerReceivableSettlement({
    receivableId,
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
 * Buscar contas a receber
 */
export async function getAccountsReceivable(
  establishmentId: string,
  filters?: {
    status?: AccountsReceivable["status"];
    origin?: AccountsReceivable["origin"];
    debtorType?: ReceivableDebtorType;
    category?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
    overdueOnly?: boolean;
  },
): Promise<{ success: boolean; data?: AccountsReceivable[]; error?: string }> {
  try {
    let query = supabase
      .from("accounts_receivable")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("due_date", { ascending: true });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.origin) {
      query = query.eq("origin", filters.origin);
    }

    if (filters?.debtorType) {
      query = query.eq("debtor_type", filters.debtorType);
    }

    if (filters?.category) {
      query = query.eq("financial_category", filters.category);
    }

    if (filters?.clientId) {
      query = query.eq("client_id", filters.clientId);
    }

    if (filters?.startDate) {
      query = query.gte("due_date", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("due_date", filters.endDate);
    }

    if (filters?.overdueOnly) {
      query = query.eq("status", "overdue");
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data as AccountsReceivable[] };
  } catch (error: any) {
    console.error("Erro ao buscar contas a receber:", error);
    return { success: false, error: error.message || "Erro ao buscar contas a receber" };
  }
}

/**
 * Buscar resumo de contas a receber
 */
export async function getAccountsReceivableSummary(
  establishmentId: string,
): Promise<{ success: boolean; data?: AccountsReceivableSummary; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("accounts_receivable")
      .select("amount, paid_amount, status")
      .eq("establishment_id", establishmentId)
      .in("status", ["pending", "partial", "paid", "overdue"]);

    if (error) throw error;

    const summary = {
      totalOpen: 0,
      pending: 0,
      overdue: 0,
      paidInPeriod: 0,
      partialOpen: 0,
      /** @deprecated use totalOpen — mantido para compatibilidade de UI */
      total: 0,
      paid: 0,
      partial: 0,
    };

    (data || []).forEach((item: any) => {
      const amount = Number(item.amount || 0);
      const paid = Number(item.paid_amount || 0);
      const open = titleOpenBalance(amount, paid);

      if (item.status === "paid" || open <= 0.02) {
        summary.paidInPeriod += paid;
        summary.paid += paid;
        return;
      }

      summary.totalOpen += open;
      summary.total += open;

      if (item.status === "overdue") {
        summary.overdue += open;
      } else if (item.status === "partial") {
        summary.partialOpen += open;
        summary.partial += open;
      } else {
        summary.pending += open;
      }
    });

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("Erro ao buscar resumo:", error);
    return { success: false, error: error.message || "Erro ao buscar resumo" };
  }
}

