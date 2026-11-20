/**
 * Serviço de Aplicação de Políticas de Cancelamento
 * 
 * Integra com:
 * - Banco de dados (Supabase)
 * - Sistema financeiro
 * - Logs de auditoria
 * - Motor de reservas
 */

import { supabase } from "@/integrations/supabase/client";
import { sumReservationServiceFees } from "@/lib/reservationServiceFeesTotal";
import {
  CancellationPolicy,
  ReservationData,
  CancellationCalculationResult,
  CancellationLog,
  calculateCancellationPenalty,
  calculateNoShowPenalty,
  isNoShow,
} from "./cancellationPolicyCalculator";

async function fetchReservationServiceFeesTotal(reservationId: string): Promise<number> {
  const { data, error } = await supabase
    .from("reservation_service_fees")
    .select("amount, quantity")
    .eq("reservation_id", reservationId);
  if (error) {
    console.warn("fetchReservationServiceFeesTotal:", error);
    return 0;
  }
  return sumReservationServiceFees(data);
}

/**
 * Buscar política de cancelamento de um orçamento (quote)
 */
export async function getQuoteCancellationPolicy(
  quoteId: string
): Promise<CancellationPolicy | null> {
  try {
    // Buscar quote com categoria e plano tarifário
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        *,
        category:room_categories(*)
      `)
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError) throw quoteError;
    if (!quote) return null;

    // Tentar buscar política do pricing_plan_id se existir
    const pricingPlanId = (quote as any).pricing_plan_id;
    if (pricingPlanId) {
      const { data: plan, error: planError } = await supabase
        .from("pricing_plans")
        .select("cancellation_policy_id")
        .eq("id", pricingPlanId)
        .maybeSingle();

      if (!planError && plan?.cancellation_policy_id) {
        const { data: policy, error: policyError } = await (supabase as any)
          .from("cancellation_policies")
          .select("*")
          .eq("id", plan.cancellation_policy_id)
          .eq("is_active", true)
          .maybeSingle();

        if (!policyError && policy) {
          return policy as unknown as CancellationPolicy;
        }
      }
    }

    // Tentar buscar política padrão da categoria
    const category = (quote as any).category;
    if (category?.id) {
      // Buscar planos tarifários da categoria que têm política
      const { data: plans, error: plansError } = await supabase
        .from("pricing_plans")
        .select(`
          cancellation_policy_id,
          pricing_plan_categories!inner(category_id)
        `)
        .eq("pricing_plan_categories.category_id", category.id)
        .eq("is_active", true)
        .not("cancellation_policy_id", "is", null)
        .limit(1);

      if (!plansError && plans && plans.length > 0) {
        const policyId = plans[0].cancellation_policy_id;
        const { data: policy, error: policyError } = await (supabase as any)
          .from("cancellation_policies")
          .select("*")
          .eq("id", policyId)
          .eq("is_active", true)
          .maybeSingle();

        if (!policyError && policy) {
          return policy as unknown as CancellationPolicy;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Erro ao buscar política de cancelamento do orçamento:", error);
    return null;
  }
}

/**
 * Buscar política de cancelamento de uma reserva
 */
export async function getReservationCancellationPolicy(
  reservationId: string
): Promise<CancellationPolicy | null> {
  try {
    // Buscar reserva com plano tarifário
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("*, pricing_plans(*)")
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) return null;

    // Buscar política do plano tarifário
    const pricingPlan = (reservation as any).pricing_plans;
    if (pricingPlan?.cancellation_policy_id) {
      const policyId = pricingPlan.cancellation_policy_id;
      const { data: policy, error: policyError } = await (supabase as any)
        .from("cancellation_policies")
        .select("*")
        .eq("id", policyId)
        .eq("is_active", true)
        .single();

      if (!policyError && policy) {
        return policy as unknown as CancellationPolicy;
      }
    }

    // Buscar política diretamente da reserva (se houver)
    const reservationPolicyId = (reservation as any).cancellation_policy_id;
    if (reservationPolicyId) {
      const { data: policy, error: policyError } = await (supabase as any)
        .from("cancellation_policies")
        .select("*")
        .eq("id", reservationPolicyId)
        .eq("is_active", true)
        .single();

      if (!policyError && policy) {
        return policy as unknown as CancellationPolicy;
      }
    }

    return null;
  } catch (error) {
    console.error("Erro ao buscar política de cancelamento:", error);
    return null;
  }
}

/**
 * Aplicar cancelamento com cálculo automático de multa
 */
export async function applyCancellation(
  reservationId: string,
  cancellationReason: string,
  cancellationDate: Date = new Date(),
  userId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  penalty: number;
  result: CancellationCalculationResult | null;
  error?: string;
}> {
  try {
    // Buscar reserva
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("*, pricing_plans(*)")
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    // Verificar se já está cancelada
    if (reservation.status === "cancelled") {
      return {
        success: false,
        penalty: 0,
        result: null,
        error: "Reserva já está cancelada",
      };
    }

    // Buscar política
    const policy = await getReservationCancellationPolicy(reservationId);
    if (!policy) {
      // Cancelar sem multa se não houver política
      await supabase
        .from("reservations")
        .update({
          status: "cancelled",
          cancellation_reason: cancellationReason,
          cancelled_at: cancellationDate.toISOString(),
        })
        .eq("id", reservationId);

      return {
        success: true,
        penalty: 0,
        result: null,
      };
    }

    const serviceFeesTotal = await fetchReservationServiceFeesTotal(reservationId);

    // Preparar dados da reserva (diárias + taxas inclusas na base da multa)
    const reservationData: ReservationData = {
      id: reservation.id,
      checkin_date: reservation.checkin_date,
      checkout_date: reservation.checkout_date,
      total_amount: reservation.total_amount || 0,
      service_fees_total: serviceFeesTotal,
      paid_amount: reservation.paid_amount || 0,
      pricing_plan_id: (reservation as any).pricing_plan_id || null,
      pricing_plan: (reservation as any).pricing_plans ? {
        cancellation_policy_id: (reservation as any).pricing_plans.cancellation_policy_id || null,
      } : undefined,
      status: reservation.status,
      establishment_id: reservation.establishment_id,
      created_at: reservation.created_at,
      channel: (reservation as any).channel || "direct",
    };

    // Calcular multa
    const calculationResult = calculateCancellationPenalty(
      policy,
      reservationData,
      cancellationDate
    );

    // Registrar log de auditoria
    await logCancellation({
      reservation_id: reservationId,
      policy_id: policy.id,
      cancellation_date: cancellationDate,
      checkin_date: new Date(reservation.checkin_date),
      penalty_amount: calculationResult.penalty,
      penalty_type: calculationResult.penaltyType,
      calculation_details: calculationResult.calculationDetails,
      reason: cancellationReason,
      user_id: userId,
      channel: reservation.channel || "direct",
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Atualizar reserva
    const updateData: any = {
      status: "cancelled",
      cancellation_reason: cancellationReason,
      cancelled_at: cancellationDate.toISOString(),
      cancellation_penalty: calculationResult.penalty,
      cancellation_policy_applied: policy.id,
      cancellation_calculation_details: calculationResult.calculationDetails,
    };

    await supabase
      .from("reservations")
      .update(updateData)
      .eq("id", reservationId);

    // Se houver multa, criar lançamento financeiro
    if (calculationResult.penalty > 0) {
      await createPenaltyInvoice(
        reservationId, 
        calculationResult.penalty, 
        policy.name,
        reservationData.establishment_id,
        (reservation as any).client_id,
        'cancellation'
      );
    }

    return {
      success: true,
      penalty: calculationResult.penalty,
      result: calculationResult,
    };
  } catch (error: any) {
    console.error("Erro ao aplicar cancelamento:", error);
    return {
      success: false,
      penalty: 0,
      result: null,
      error: error.message || "Erro ao cancelar reserva",
    };
  }
}

/** FK reservations → pricing_plans é `pricing_plan_id`. Aninhar política via coluna do plano (como em usePricingPlans). */
const RESERVATION_SELECT_WITH_PRICING = `
  *,
  pricing_plans(
    *,
    cancellation_policies:cancellation_policy_id(*)
  )
`;

async function applyNoShowCore(
  reservationId: string,
  reservation: Record<string, unknown>,
  userId: string | undefined,
  logReason: string
): Promise<{
  success: boolean;
  penalty: number;
  result: CancellationCalculationResult | null;
  error?: string;
}> {
  const policy = await getReservationCancellationPolicy(reservationId);
  if (!policy) {
    await supabase
      .from("reservations")
      .update({
        status: "noshow" as any,
        no_show_at: new Date().toISOString(),
      })
      .eq("id", reservationId);

    return {
      success: true,
      penalty: 0,
      result: null,
    };
  }

  const serviceFeesTotal = await fetchReservationServiceFeesTotal(reservationId);

  const reservationData: ReservationData = {
    id: reservation.id as string,
    checkin_date: reservation.checkin_date as string,
    checkout_date: reservation.checkout_date as string,
    total_amount: (reservation.total_amount as number) || 0,
    service_fees_total: serviceFeesTotal,
    paid_amount: (reservation.paid_amount as number) || 0,
    pricing_plan_id: (reservation as any).pricing_plan_id || null,
    pricing_plan: (reservation as any).pricing_plans
      ? {
          cancellation_policy_id:
            (reservation as any).pricing_plans.cancellation_policy_id || null,
        }
      : undefined,
    status: reservation.status as string,
    establishment_id: reservation.establishment_id as string,
    created_at: reservation.created_at as string,
    channel: (reservation as any).channel || "direct",
  };

  const calculationResult = calculateNoShowPenalty(policy, reservationData);

  await logCancellation({
    reservation_id: reservationId,
    policy_id: policy.id,
    cancellation_date: new Date(),
    checkin_date: new Date(reservation.checkin_date as string),
    penalty_amount: calculationResult.penalty,
    penalty_type: "no_show",
    calculation_details: calculationResult.calculationDetails,
    reason: logReason,
    user_id: userId || "system",
    channel: (reservation as any).channel || "direct",
  });

  await supabase
    .from("reservations")
    .update({
      status: "noshow" as any,
      no_show_at: new Date().toISOString(),
      cancellation_penalty: calculationResult.penalty,
      cancellation_policy_applied: policy.id,
      cancellation_calculation_details: calculationResult.calculationDetails,
    })
    .eq("id", reservationId);

  if (calculationResult.penalty > 0) {
    await createPenaltyInvoice(
      reservationId,
      calculationResult.penalty,
      policy.name,
      reservationData.establishment_id,
      (reservation as any).client_id,
      "cancellation"
    );
  }

  return {
    success: true,
    penalty: calculationResult.penalty,
    result: calculationResult,
  };
}

/**
 * Detectar e aplicar no-show automático
 */
export async function detectAndApplyNoShow(
  reservationId: string,
  userId?: string
): Promise<{
  success: boolean;
  penalty: number;
  result: CancellationCalculationResult | null;
  error?: string;
}> {
  try {
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select(RESERVATION_SELECT_WITH_PRICING)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    if (!isNoShow(reservation as ReservationData)) {
      return {
        success: false,
        penalty: 0,
        result: null,
        error: "Reserva não é no-show",
      };
    }

    return await applyNoShowCore(
      reservationId,
      reservation as Record<string, unknown>,
      userId,
      "No-show automático detectado"
    );
  } catch (error: any) {
    console.error("Erro ao aplicar no-show:", error);
    return {
      success: false,
      penalty: 0,
      result: null,
      error: error.message || "Erro ao processar no-show",
    };
  }
}

/** Status em que não faz sentido marcar no-show manualmente */
const STAFF_NOSHOW_BLOCKED = new Set([
  "checkedin",
  "checkedout",
  "cancelled",
  "noshow",
  "blocked",
]);

/**
 * No-show acionado pela equipe em Detalhes da Reserva (não exige prazo automático).
 * Aplica multa conforme política quando existir.
 */
export async function applyStaffNoShow(
  reservationId: string,
  userId?: string
): Promise<{
  success: boolean;
  penalty: number;
  result: CancellationCalculationResult | null;
  error?: string;
}> {
  try {
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select(RESERVATION_SELECT_WITH_PRICING)
      .eq("id", reservationId)
      .single();

    if (resError) throw resError;
    if (!reservation) throw new Error("Reserva não encontrada");

    const st = String((reservation as { status?: string }).status ?? "");
    if (STAFF_NOSHOW_BLOCKED.has(st)) {
      return {
        success: false,
        penalty: 0,
        result: null,
        error:
          "Esta reserva não pode ser marcada como no-show no status atual.",
      };
    }

    return await applyNoShowCore(
      reservationId,
      reservation as Record<string, unknown>,
      userId,
      "No-show registrado manualmente pelo usuário"
    );
  } catch (error: any) {
    console.error("Erro ao aplicar no-show manual:", error);
    return {
      success: false,
      penalty: 0,
      result: null,
      error: error.message || "Erro ao processar no-show",
    };
  }
}

/**
 * Criar fatura de multa
 * Agora integrado com sistema de Contas a Receber
 */
async function createPenaltyInvoice(
  reservationId: string,
  penaltyAmount: number,
  policyName: string,
  establishmentId?: string,
  clientId?: string,
  penaltyType: 'cancellation' | 'no_show' = 'cancellation'
): Promise<void> {
  try {
    // Importar serviço de contas a receber
    const {
      createReceivableFromCancellationPenalty,
      createReceivableFromNoShowPenalty,
    } = await import("@/services/financial/accountsReceivableService");

    // Se não tiver establishment_id ou client_id, buscar da reserva
    if (!establishmentId || !clientId) {
      const { data: reservation } = await supabase
        .from("reservations")
        .select("establishment_id, client_id")
        .eq("id", reservationId)
        .single();

      if (reservation) {
        establishmentId = establishmentId || (reservation as any).establishment_id;
        clientId = clientId || (reservation as any).client_id;
      }
    }

    if (!establishmentId) {
      console.warn("Não foi possível criar conta a receber de multa: establishment_id não encontrado");
      return;
    }

    // Criar conta a receber usando o novo sistema
    let result;
    if (penaltyType === 'no_show') {
      result = await createReceivableFromNoShowPenalty(
        reservationId,
        penaltyAmount,
        policyName
      );
    } else {
      result = await createReceivableFromCancellationPenalty(
        reservationId,
        penaltyAmount,
        policyName
      );
    }

    if (!result.success) {
      console.error("Erro ao criar conta a receber de multa:", result.error);
      // Fallback: criar lançamento na tabela payments antiga
      const paymentData: any = {
        reservation_id: reservationId,
        amount: penaltyAmount,
        payment_method: "penalty",
        payment_date: new Date().toISOString(),
        description: `Multa de ${penaltyType === 'no_show' ? 'no-show' : 'cancelamento'} - ${policyName}`,
      };

      // Adicionar campos se existirem na tabela
      // Nota: A tabela payments pode não ter esses campos, então comentado por segurança
      // if (establishmentId) {
      //   paymentData.establishment_id = establishmentId;
      // }
      // if (clientId) {
      //   paymentData.client_id = clientId;
      // }

      const { error } = await supabase
        .from("payments")
        .insert(paymentData);

      if (error) {
        console.error("Erro ao criar fatura de multa (fallback):", error);
        // Não falhar o cancelamento se houver erro na fatura
        // Log será registrado mesmo sem criar fatura
      }
    }
  } catch (error) {
    console.error("Erro ao criar fatura de multa:", error);
  }
}

/**
 * Registrar log de cancelamento
 */
async function logCancellation(log: CancellationLog): Promise<void> {
  try {
    // Criar tabela de logs se não existir (via migration)
    // Por enquanto, usar tabela genérica ou criar migration
    const logData: any = {
      reservation_id: log.reservation_id,
      cancellation_date: log.cancellation_date.toISOString(),
      checkin_date: log.checkin_date.toISOString(),
      penalty_amount: log.penalty_amount,
      penalty_type: log.penalty_type,
      calculation_details: log.calculation_details,
      reason: log.reason,
      channel: log.channel,
    };

    if (log.policy_id) {
      logData.policy_id = log.policy_id;
    }
    if (log.user_id) {
      logData.user_id = log.user_id;
    }
    if (log.ip_address) {
      logData.ip_address = log.ip_address;
    }
    if (log.user_agent) {
      logData.user_agent = log.user_agent;
    }

    const { error } = await (supabase as any)
      .from("cancellation_logs")
      .insert(logData);

    if (error) {
      // Se a tabela não existir, apenas logar no console
      console.warn("Tabela cancellation_logs não encontrada. Criar migration para habilitar logs.");
      console.log("Cancellation log:", log);
    }
  } catch (error) {
    console.error("Erro ao registrar log de cancelamento:", error);
  }
}

/**
 * Buscar logs de cancelamento de uma reserva
 */
export async function getCancellationLogs(reservationId: string): Promise<CancellationLog[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("cancellation_logs")
      .select("*")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false });

    if (error) {
      // Se a tabela não existir, retornar array vazio
      if (error.message?.includes("does not exist")) {
        return [];
      }
      throw error;
    }
    return (data || []) as unknown as CancellationLog[];
  } catch (error) {
    console.error("Erro ao buscar logs:", error);
    return [];
  }
}

/**
 * Verificar e processar no-shows automaticamente
 * Esta função deve ser chamada periodicamente (cron job)
 */
export async function processNoShows(establishmentId?: string): Promise<number> {
  try {
    let query = supabase
      .from("reservations")
      .select("*, pricing_plans(*)")
      .eq("status", "confirmed")
      .lte("checkin_date", new Date().toISOString());

    if (establishmentId) {
      query = query.eq("establishment_id", establishmentId);
    }

    const { data: reservations, error } = await query;

    if (error) throw error;
    if (!reservations || reservations.length === 0) return 0;

    let processedCount = 0;

    for (const reservation of reservations) {
      const reservationData: ReservationData = {
        id: reservation.id,
        checkin_date: reservation.checkin_date,
        checkout_date: reservation.checkout_date,
        total_amount: reservation.total_amount || 0,
        paid_amount: reservation.paid_amount || 0,
        pricing_plan_id: (reservation as any).pricing_plan_id || null,
        pricing_plan: (reservation as any).pricing_plans ? {
          cancellation_policy_id: (reservation as any).pricing_plans.cancellation_policy_id || null,
        } : undefined,
        status: reservation.status,
        establishment_id: (reservation as any).establishment_id,
        created_at: reservation.created_at,
        channel: (reservation as any).channel || "direct",
      };

      if (isNoShow(reservationData)) {
        const result = await detectAndApplyNoShow(reservation.id);
        if (result.success) {
          processedCount++;
        }
      }
    }

    return processedCount;
  } catch (error) {
    console.error("Erro ao processar no-shows:", error);
    return 0;
  }
}

