/**
 * Sistema de Cálculo e Aplicação de Políticas de Cancelamento
 * 
 * Este módulo implementa a lógica completa para:
 * - Calcular multas de cancelamento baseadas em políticas
 * - Detectar no-show automático
 * - Aplicar regras financeiras
 * - Registrar logs de auditoria
 */

import { format, parseISO, differenceInDays, differenceInHours, isAfter, isBefore, addDays, subDays } from "date-fns";

export interface CancellationPolicy {
  id: string;
  name: string;
  has_free_cancellation: boolean;
  free_cancellation_deadline: string | null;
  cancellation_fee_type: "first_night" | "percentage";
  cancellation_fee_percentage: number | null;
  cancellation_fee_when: string;
  cancellation_fee_after_deadline_type: "first_night" | "percentage" | null;
  cancellation_fee_after_deadline_percentage: number | null;
  no_show_fee_type: "same_as_cancellation" | "first_night" | "percentage";
  no_show_fee_percentage: number | null;
  requires_prepayment: boolean;
  prepayment_percentage: number | null;
  prepayment_when: string;
  policy_summary: string | null;
  prepayment_summary: string | null;
}

export interface ReservationData {
  id: string;
  checkin_date: string;
  checkout_date: string;
  total_amount: number;
  paid_amount: number;
  pricing_plan_id: string | null;
  pricing_plan?: {
    cancellation_policy_id: string | null;
  };
  status: string;
  cancellation_policy_id?: string | null;
  establishment_id: string;
  created_at: string;
  channel?: string; // 'direct', 'booking', 'expedia', etc.
}

export interface CancellationCalculationResult {
  penalty: number;
  penaltyType: "none" | "cancellation" | "no_show";
  reason: string;
  policyApplied: string;
  freeDeadline: Date | null;
  cancellationDate: Date;
  checkinDate: Date;
  withinFreePeriod: boolean;
  calculationDetails: {
    baseAmount: number;
    feeType: string;
    feeValue: number | null;
    appliedPercentage?: number;
    appliedFixedAmount?: number;
  };
}

export interface CancellationLog {
  reservation_id: string;
  policy_id: string | null;
  cancellation_date: Date;
  checkin_date: Date;
  penalty_amount: number;
  penalty_type: "none" | "cancellation" | "no_show";
  calculation_details: any;
  reason: string;
  user_id?: string;
  channel: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Parse deadline string to Date
 * Examples: 
 * - "até 7 dias antes da chegada" -> 7 days before checkin
 * - "até 7 dias após a compra" -> 7 days after reservation creation
 * - "até 7 dias da compra" -> 7 days after reservation creation
 */
function parseDeadline(
  deadline: string, 
  checkinDate: Date, 
  timezone: string = "America/Sao_Paulo",
  reservationCreatedAt?: Date
): Date {
  const checkin = new Date(checkinDate);
  const deadlineLower = deadline.toLowerCase();
  
  // Verificar se o deadline é relativo à data de criação da reserva
  const isRelativeToCreation = reservationCreatedAt && (
    deadlineLower.includes("após a compra") || 
    deadlineLower.includes("da compra") ||
    deadlineLower.includes("após compra") ||
    deadlineLower.includes("após reserva") ||
    deadlineLower.includes("da reserva")
  );
  
  const referenceDate = isRelativeToCreation && reservationCreatedAt 
    ? new Date(reservationCreatedAt) 
    : checkin;
  
  // Extrair número de dias
  const daysMatch = deadline.match(/(\d+)\s*dia/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    let deadlineDate: Date;
    
    if (isRelativeToCreation) {
      // Adicionar dias à data de criação
      deadlineDate = addDays(referenceDate, days);
    } else {
      // Subtrair dias da data de check-in
      deadlineDate = subDays(referenceDate, days);
    }
    
    // Quando o deadline é calculado em dias, definir para o final do dia (23:59:59)
    // para que qualquer cancelamento no dia do deadline seja considerado dentro do prazo
    deadlineDate.setHours(23, 59, 59, 999);
    return deadlineDate;
  }
  
  // Extrair horário (ex: "até 18:00 do dia da chegada")
  const timeMatch = deadline.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const deadlineDate = new Date(referenceDate);
    deadlineDate.setHours(hours, minutes, 0, 0);
    return deadlineDate;
  }
  
  // Default: mesmo dia da referência, final do dia
  const deadlineDate = new Date(referenceDate);
  deadlineDate.setHours(23, 59, 59, 999);
  return deadlineDate;
}

/**
 * Calculate cancellation penalty based on policy
 */
export function calculateCancellationPenalty(
  policy: CancellationPolicy,
  reservation: ReservationData,
  cancellationDate: Date = new Date(),
  timezone: string = "America/Sao_Paulo"
): CancellationCalculationResult {
  const checkinDate = parseISO(reservation.checkin_date);
  const checkinZoned = new Date(checkinDate);
  const cancellationZoned = new Date(cancellationDate);
  
  const baseAmount = reservation.total_amount;
  let penalty = 0;
  let penaltyType: "none" | "cancellation" | "no_show" = "none";
  let reason = "";
  let withinFreePeriod = false;
  let freeDeadline: Date | null = null;
  
  // Normalizar datas para comparação (apenas dia, sem horário)
  const cancellationDateOnly = new Date(cancellationZoned);
  cancellationDateOnly.setHours(0, 0, 0, 0);
  
  const checkinDateOnly = new Date(checkinZoned);
  checkinDateOnly.setHours(0, 0, 0, 0);
  
  // Verificar se cancelamento é no mesmo dia do check-in
  const isSameDayAsCheckin = cancellationDateOnly.getTime() === checkinDateOnly.getTime();
  
  // Calcular prazo de cancelamento gratuito
  if (policy.has_free_cancellation && policy.free_cancellation_deadline) {
    const reservationCreatedAt = reservation.created_at ? parseISO(reservation.created_at) : undefined;
    freeDeadline = parseDeadline(policy.free_cancellation_deadline, checkinZoned, timezone, reservationCreatedAt);
    
    // Verificar se o deadline tem horário específico (não é 23:59:59)
    const hasSpecificTime = freeDeadline.getHours() !== 23 || freeDeadline.getMinutes() !== 59;
    
    if (hasSpecificTime) {
      // Deadline com horário específico: comparar data e horário
      withinFreePeriod = isBefore(cancellationZoned, freeDeadline) || 
                         cancellationZoned.getTime() <= freeDeadline.getTime();
    } else {
      // Deadline calculado em dias: comparar apenas a data (sem horário)
      const freeDeadlineDateOnly = new Date(freeDeadline);
      freeDeadlineDateOnly.setHours(0, 0, 0, 0);
      
      // Considerar dentro do prazo se a data de cancelamento for anterior ou igual ao deadline
      // Usar <= para incluir o próprio dia do deadline
      withinFreePeriod = cancellationDateOnly.getTime() <= freeDeadlineDateOnly.getTime();
    }
  }
  
  // Se está dentro do prazo gratuito
  if (withinFreePeriod) {
    return {
      penalty: 0,
      penaltyType: "none",
      reason: "Cancelamento dentro do prazo de cancelamento gratuito",
      policyApplied: policy.name,
      freeDeadline,
      cancellationDate: cancellationZoned,
      checkinDate: checkinZoned,
      withinFreePeriod: true,
      calculationDetails: {
        baseAmount,
        feeType: "none",
        feeValue: null,
      },
    };
  }
  
  // Calcular multa após prazo gratuito
  if (policy.has_free_cancellation && policy.cancellation_fee_after_deadline_type) {
    if (policy.cancellation_fee_after_deadline_type === "first_night") {
      // Calcular valor da primeira diária
      const nights = differenceInDays(parseISO(reservation.checkout_date), checkinDate);
      const firstNightAmount = nights > 0 ? baseAmount / nights : baseAmount;
      penalty = firstNightAmount;
      reason = isSameDayAsCheckin 
        ? "Multa de cancelamento: primeira diária (cancelamento no dia do check-in, após prazo gratuito)"
        : "Multa de cancelamento: primeira diária (após prazo gratuito)";
    } else if (policy.cancellation_fee_after_deadline_type === "percentage" && policy.cancellation_fee_after_deadline_percentage) {
      penalty = (baseAmount * policy.cancellation_fee_after_deadline_percentage) / 100;
      reason = isSameDayAsCheckin
        ? `Multa de cancelamento: ${policy.cancellation_fee_after_deadline_percentage}% do total (cancelamento no dia do check-in, após prazo gratuito)`
        : `Multa de cancelamento: ${policy.cancellation_fee_after_deadline_percentage}% do total (após prazo gratuito)`;
    }
    
    return {
      penalty: Math.round(penalty * 100) / 100, // Arredondar para 2 casas decimais
      penaltyType: "cancellation",
      reason,
      policyApplied: policy.name,
      freeDeadline,
      cancellationDate: cancellationZoned,
      checkinDate: checkinZoned,
      withinFreePeriod: false,
      calculationDetails: {
        baseAmount,
        feeType: policy.cancellation_fee_after_deadline_type,
        feeValue: policy.cancellation_fee_after_deadline_percentage || null,
        appliedPercentage: policy.cancellation_fee_after_deadline_type === "percentage" ? policy.cancellation_fee_after_deadline_percentage : undefined,
        appliedFixedAmount: policy.cancellation_fee_after_deadline_type === "first_night" ? penalty : undefined,
      },
    };
  }
  
  // Sem cancelamento gratuito - aplicar multa direta
  if (!policy.has_free_cancellation) {
    // Verificar se a multa se aplica neste momento
    const feeWhen = policy.cancellation_fee_when;
    let shouldApplyFee = true;
    
    if (feeWhen && feeWhen !== "em qualquer momento") {
      const reservationCreatedAt = reservation.created_at ? parseISO(reservation.created_at) : undefined;
      const feeDeadline = parseDeadline(feeWhen, checkinZoned, timezone, reservationCreatedAt);
      shouldApplyFee = isAfter(cancellationZoned, feeDeadline) || cancellationZoned.getTime() === feeDeadline.getTime();
    }
    
    if (shouldApplyFee) {
      if (policy.cancellation_fee_type === "first_night") {
        const nights = differenceInDays(parseISO(reservation.checkout_date), checkinDate);
        const firstNightAmount = nights > 0 ? baseAmount / nights : baseAmount;
        penalty = firstNightAmount;
        reason = "Multa de cancelamento: primeira diária";
      } else if (policy.cancellation_fee_type === "percentage" && policy.cancellation_fee_percentage) {
        penalty = (baseAmount * policy.cancellation_fee_percentage) / 100;
        reason = `Multa de cancelamento: ${policy.cancellation_fee_percentage}% do total`;
      }
    }
    
    return {
      penalty: Math.round(penalty * 100) / 100,
      penaltyType: shouldApplyFee ? "cancellation" : "none",
      reason: shouldApplyFee ? reason : "Cancelamento antes do prazo de aplicação da multa",
      policyApplied: policy.name,
      freeDeadline: null,
      cancellationDate: cancellationZoned,
      checkinDate: checkinZoned,
      withinFreePeriod: false,
      calculationDetails: {
        baseAmount,
        feeType: policy.cancellation_fee_type,
        feeValue: policy.cancellation_fee_percentage || null,
        appliedPercentage: policy.cancellation_fee_type === "percentage" ? policy.cancellation_fee_percentage : undefined,
        appliedFixedAmount: policy.cancellation_fee_type === "first_night" ? penalty : undefined,
      },
    };
  }
  
  // Fallback: sem multa
  return {
    penalty: 0,
    penaltyType: "none",
    reason: "Nenhuma multa aplicável",
    policyApplied: policy.name,
    freeDeadline,
    cancellationDate: cancellationZoned,
    checkinDate: checkinZoned,
    withinFreePeriod: false,
    calculationDetails: {
      baseAmount,
      feeType: "none",
      feeValue: null,
    },
  };
}

/**
 * Calculate no-show penalty
 */
export function calculateNoShowPenalty(
  policy: CancellationPolicy,
  reservation: ReservationData,
  noShowDate: Date = new Date(),
  timezone: string = "America/Sao_Paulo"
): CancellationCalculationResult {
  const checkinDate = parseISO(reservation.checkin_date);
  const checkinZoned = new Date(checkinDate);
  const noShowZoned = new Date(noShowDate);
  
  const baseAmount = reservation.total_amount;
  let penalty = 0;
  
  if (policy.no_show_fee_type === "same_as_cancellation") {
    // Usar a mesma lógica de cancelamento
    const cancellationResult = calculateCancellationPenalty(policy, reservation, noShowDate, timezone);
    penalty = cancellationResult.penalty;
  } else if (policy.no_show_fee_type === "first_night") {
    const nights = differenceInDays(parseISO(reservation.checkout_date), checkinDate);
    const firstNightAmount = nights > 0 ? baseAmount / nights : baseAmount;
    penalty = firstNightAmount;
  } else if (policy.no_show_fee_type === "percentage" && policy.no_show_fee_percentage) {
    penalty = (baseAmount * policy.no_show_fee_percentage) / 100;
  }
  
  return {
    penalty: Math.round(penalty * 100) / 100,
    penaltyType: "no_show",
    reason: `Multa de não comparecimento: ${policy.no_show_fee_type === "same_as_cancellation" ? "mesma taxa de cancelamento" : policy.no_show_fee_type === "first_night" ? "primeira diária" : `${policy.no_show_fee_percentage}% do total`}`,
    policyApplied: policy.name,
    freeDeadline: null,
    cancellationDate: noShowZoned,
    checkinDate: checkinZoned,
    withinFreePeriod: false,
    calculationDetails: {
      baseAmount,
      feeType: policy.no_show_fee_type,
      feeValue: policy.no_show_fee_percentage || null,
      appliedPercentage: policy.no_show_fee_type === "percentage" ? policy.no_show_fee_percentage : undefined,
      appliedFixedAmount: policy.no_show_fee_type === "first_night" ? penalty : undefined,
    },
  };
}

/**
 * Check if reservation is no-show
 */
export function isNoShow(
  reservation: ReservationData,
  currentDate: Date = new Date(),
  timezone: string = "America/Sao_Paulo",
  checkinDeadlineHours: number = 18 // Default: 18:00
): boolean {
  const checkinDate = parseISO(reservation.checkin_date);
  const checkinZoned = new Date(checkinDate);
  const currentZoned = new Date(currentDate);
  
  // Criar deadline de check-in (ex: 18:00 do dia do check-in)
  const checkinDeadline = new Date(checkinZoned);
  checkinDeadline.setHours(checkinDeadlineHours, 0, 0, 0);
  
  // Verificar se passou do deadline e não está checked-in
  return (
    isAfter(currentZoned, checkinDeadline) &&
    reservation.status !== "checkedin" &&
    reservation.status !== "cancelled" &&
    reservation.status !== "noshow"
  );
}

/**
 * Format policy summary for display
 */
export function formatPolicySummary(policy: CancellationPolicy): string {
  if (policy.policy_summary) {
    return policy.policy_summary;
  }
  
  let summary = "";
  
  if (policy.has_free_cancellation && policy.free_cancellation_deadline) {
    summary += `Cancelamento grátis ${policy.free_cancellation_deadline}. `;
  }
  
  if (policy.cancellation_fee_type === "first_night") {
    summary += "Multa: primeira diária";
  } else if (policy.cancellation_fee_percentage) {
    summary += `Multa: ${policy.cancellation_fee_percentage}% do total`;
  }
  
  return summary || "Política de cancelamento configurada";
}

/**
 * Simulate cancellation penalty for a given scenario
 */
export function simulateCancellation(
  policy: CancellationPolicy,
  checkinDate: string,
  totalAmount: number,
  cancellationDate: Date = new Date(),
  reservationCreatedAt?: Date
): CancellationCalculationResult {
  // Se não fornecida, calcular data de criação como 30 dias antes do check-in
  const defaultCreatedAt = reservationCreatedAt || (() => {
    const checkin = parseISO(checkinDate);
    const created = new Date(checkin);
    created.setDate(created.getDate() - 30);
    return created;
  })();

  // Normalizar checkout_date (adicionar 1 dia ao check-in)
  const checkin = parseISO(checkinDate);
  const checkout = new Date(checkin);
  checkout.setDate(checkout.getDate() + 1);

  const reservation: ReservationData = {
    id: "simulation",
    checkin_date: checkinDate,
    checkout_date: checkout.toISOString(),
    total_amount: totalAmount,
    paid_amount: 0,
    pricing_plan_id: null,
    status: "confirmed",
    establishment_id: "",
    created_at: defaultCreatedAt.toISOString(),
  };
  
  return calculateCancellationPenalty(policy, reservation, cancellationDate);
}

