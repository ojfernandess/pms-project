/**
 * Utilitário para recalcular política de cancelamento quando datas são alteradas
 */

import { getReservationCancellationPolicy, applyCancellation } from "./cancellationPolicyService";
import { calculateCancellationPenalty } from "./cancellationPolicyCalculator";
import { supabase } from "@/integrations/supabase/client";
import type { CancellationPolicy } from "./cancellationPolicyCalculator";

export interface DateChangeResult {
  shouldRecalculate: boolean;
  newPenalty: number;
  oldPenalty: number;
  policy: CancellationPolicy | null;
  warning?: string;
}

/**
 * Verificar se alteração de datas requer recálculo de política
 */
export async function checkDateChangeImpact(
  reservationId: string,
  oldCheckinDate: string,
  newCheckinDate: string,
  oldCheckoutDate: string,
  newCheckoutDate: string
): Promise<DateChangeResult> {
  // Se as datas não mudaram, não precisa recalcular
  if (oldCheckinDate === newCheckinDate && oldCheckoutDate === newCheckoutDate) {
    return {
      shouldRecalculate: false,
      newPenalty: 0,
      oldPenalty: 0,
      policy: null,
    };
  }

  // Buscar política atual
  const policy = await getReservationCancellationPolicy(reservationId);
  if (!policy) {
    return {
      shouldRecalculate: false,
      newPenalty: 0,
      oldPenalty: 0,
      policy: null,
    };
  }

  // Buscar dados da reserva
  const { data: reservation } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (!reservation) {
    return {
      shouldRecalculate: false,
      newPenalty: 0,
      oldPenalty: 0,
      policy: null,
    };
  }

  // Calcular multa com datas antigas (se houvesse cancelamento agora)
  const oldReservationData = {
    id: reservationId,
    checkin_date: oldCheckinDate,
    checkout_date: oldCheckoutDate,
    total_amount: reservation.total_amount || 0,
    paid_amount: reservation.paid_amount || 0,
    pricing_plan_id: (reservation as any).pricing_plan_id || null,
    status: reservation.status,
    establishment_id: (reservation as any).establishment_id,
    created_at: reservation.created_at,
    channel: (reservation as any).channel || "direct",
  };

  const oldCalculation = calculateCancellationPenalty(
    policy,
    oldReservationData,
    new Date()
  );

  // Calcular multa com datas novas (se houvesse cancelamento agora)
  const newReservationData = {
    ...oldReservationData,
    checkin_date: newCheckinDate,
    checkout_date: newCheckoutDate,
  };

  const newCalculation = calculateCancellationPenalty(
    policy,
    newReservationData,
    new Date()
  );

  // Se a multa mudou, precisa recalcular
  const penaltyChanged = oldCalculation.penalty !== newCalculation.penalty;

  let warning: string | undefined;
  if (penaltyChanged) {
    if (newCalculation.penalty > oldCalculation.penalty) {
      warning = `Atenção: A alteração de datas aumentou a multa de cancelamento de R$ ${oldCalculation.penalty.toFixed(2)} para R$ ${newCalculation.penalty.toFixed(2)}.`;
    } else {
      warning = `A alteração de datas reduziu a multa de cancelamento de R$ ${oldCalculation.penalty.toFixed(2)} para R$ ${newCalculation.penalty.toFixed(2)}.`;
    }
  }

  return {
    shouldRecalculate: penaltyChanged,
    newPenalty: newCalculation.penalty,
    oldPenalty: oldCalculation.penalty,
    policy,
    warning,
  };
}

/**
 * Recalcular e atualizar política após alteração de datas
 */
export async function recalculatePolicyAfterDateChange(
  reservationId: string,
  newCheckinDate: string,
  newCheckoutDate: string
): Promise<{ success: boolean; penalty: number }> {
  try {
    // Buscar política
    const policy = await getReservationCancellationPolicy(reservationId);
    if (!policy) {
      return { success: false, penalty: 0 };
    }

    // Buscar reserva
    const { data: reservation } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    if (!reservation) {
      return { success: false, penalty: 0 };
    }

    // Calcular nova multa
    const reservationData = {
      id: reservationId,
      checkin_date: newCheckinDate,
      checkout_date: newCheckoutDate,
      total_amount: reservation.total_amount || 0,
      paid_amount: reservation.paid_amount || 0,
      pricing_plan_id: (reservation as any).pricing_plan_id || null,
      status: reservation.status,
      establishment_id: (reservation as any).establishment_id,
      created_at: reservation.created_at,
      channel: (reservation as any).channel || "direct",
    };

    const calculation = calculateCancellationPenalty(
      policy,
      reservationData,
      new Date()
    );

    // Atualizar reserva com nova multa calculada (se ainda não cancelada)
    if (reservation.status !== "cancelled" && reservation.status !== "noshow") {
      await supabase
        .from("reservations")
        .update({
          cancellation_calculation_details: calculation.calculationDetails,
          // Não atualizar cancellation_penalty aqui, apenas quando cancelar
        })
        .eq("id", reservationId);
    }

    return {
      success: true,
      penalty: calculation.penalty,
    };
  } catch (error) {
    console.error("Erro ao recalcular política:", error);
    return { success: false, penalty: 0 };
  }
}

