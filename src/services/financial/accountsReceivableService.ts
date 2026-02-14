/**
 * Serviço de Contas a Receber
 * 
 * Gerencia a criação automática e manual de contas a receber
 * a partir de reservas, pré-pagamentos, multas, etc.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AccountsReceivable {
  id: string;
  establishment_id: string;
  reservation_id?: string | null;
  client_id?: string | null;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_date?: string | null;
  origin: 'reservation' | 'prepayment' | 'penalty' | 'cancellation_penalty' | 'no_show_penalty' | 'extra_consumption' | 'service_fee' | 'other';
  type: 'reservation' | 'penalty' | 'service' | 'extension' | 'other';
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  metadata?: any;
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
  description: string;
  amount: number;
  due_date: string;
  origin: AccountsReceivable['origin'];
  type: AccountsReceivable['type'];
  metadata?: any;
  notes?: string;
}

/**
 * Criar conta a receber
 */
export async function createAccountsReceivable(
  params: CreateReceivableParams
): Promise<{ success: boolean; data?: AccountsReceivable; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("accounts_receivable")
      .insert({
        ...params,
        paid_amount: 0,
        status: 'pending',
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
        total_amount,
        checkin_date,
        checkout_date,
        reservation_code,
        guest:clients!guest_id(full_name)
      `)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    // Calcular data de vencimento (check-in)
    const dueDate = reservation.checkin_date;

    // Criar conta a receber
    return await createAccountsReceivable({
      establishment_id: reservation.establishment_id,
      reservation_id: reservationId,
      client_id: (reservation as any).client_id,
      description: `Reserva ${reservation.reservation_code} - ${(reservation as any).guest?.full_name || 'Hóspede'}`,
      amount: Number(reservation.total_amount || 0),
      due_date: dueDate,
      origin: 'reservation',
      type: 'reservation',
      metadata: {
        reservation_code: reservation.reservation_code,
        checkin_date: reservation.checkin_date,
        checkout_date: reservation.checkout_date,
      },
    });
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
 * Registrar pagamento de conta a receber
 */
export async function payAccountsReceivable(
  receivableId: string,
  amount: number,
  paymentDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar conta atual
    const { data: receivable, error: fetchError } = await supabase
      .from("accounts_receivable")
      .select("amount, paid_amount")
      .eq("id", receivableId)
      .single();

    if (fetchError) throw fetchError;
    if (!receivable) throw new Error("Conta a receber não encontrada");

    const newPaidAmount = Number(receivable.paid_amount || 0) + amount;
    const totalAmount = Number(receivable.amount || 0);

    // Atualizar conta
    const updateData: any = {
      paid_amount: Math.min(newPaidAmount, totalAmount),
      updated_at: new Date().toISOString(),
    };

    if (newPaidAmount >= totalAmount) {
      updateData.status = 'paid';
      updateData.paid_date = paymentDate || new Date().toISOString().split('T')[0];
    } else if (newPaidAmount > 0) {
      updateData.status = 'partial';
    }

    const { error: updateError } = await supabase
      .from("accounts_receivable")
      .update(updateData)
      .eq("id", receivableId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao registrar pagamento:", error);
    return { success: false, error: error.message || "Erro ao registrar pagamento" };
  }
}

/**
 * Buscar contas a receber
 */
export async function getAccountsReceivable(
  establishmentId: string,
  filters?: {
    status?: AccountsReceivable['status'];
    origin?: AccountsReceivable['origin'];
    startDate?: string;
    endDate?: string;
    overdueOnly?: boolean;
  }
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
  establishmentId: string
): Promise<{
  success: boolean;
  data?: {
    total: number;
    pending: number;
    overdue: number;
    paid: number;
    partial: number;
  };
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("accounts_receivable")
      .select("amount, paid_amount, status")
      .eq("establishment_id", establishmentId)
      .in("status", ["pending", "partial", "paid", "overdue"]);

    if (error) throw error;

    const summary = {
      total: 0,
      pending: 0,
      overdue: 0,
      paid: 0,
      partial: 0,
    };

    (data || []).forEach((item: any) => {
      const amount = Number(item.amount || 0);
      const paid = Number(item.paid_amount || 0);
      const pending = amount - paid;

      summary.total += amount;

      switch (item.status) {
        case 'pending':
          summary.pending += pending;
          break;
        case 'overdue':
          summary.overdue += pending;
          break;
        case 'paid':
          summary.paid += amount;
          break;
        case 'partial':
          summary.partial += pending;
          break;
      }
    });

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("Erro ao buscar resumo:", error);
    return { success: false, error: error.message || "Erro ao buscar resumo" };
  }
}

