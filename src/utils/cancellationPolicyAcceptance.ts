/**
 * Utilitário para registrar aceite de políticas de cancelamento
 */

import { supabase } from "@/integrations/supabase/client";

export interface PolicyAcceptanceData {
  reservation_id?: string;
  policy_id: string;
  ip_address?: string;
  user_agent?: string;
  channel?: string;
  accepted_by?: string;
}

/**
 * Registrar aceite de política de cancelamento
 */
export async function recordPolicyAcceptance(
  data: PolicyAcceptanceData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const acceptanceData: any = {
      policy_id: data.policy_id,
      accepted_at: new Date().toISOString(),
      channel: data.channel || "booking_engine",
    };

    if (data.reservation_id) {
      acceptanceData.reservation_id = data.reservation_id;
    }
    if (data.ip_address) {
      acceptanceData.ip_address = data.ip_address;
    }
    if (data.user_agent) {
      acceptanceData.user_agent = data.user_agent;
    }
    if (data.accepted_by) {
      acceptanceData.accepted_by = data.accepted_by;
    }

    const { data: result, error } = await (supabase as any)
      .from("cancellation_policy_acceptances")
      .insert(acceptanceData)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      id: result.id,
    };
  } catch (error: any) {
    console.error("Erro ao registrar aceite de política:", error);
    return {
      success: false,
      error: error.message || "Erro ao registrar aceite",
    };
  }
}

/**
 * Verificar se política foi aceita para uma reserva
 */
export async function checkPolicyAcceptance(
  reservationId: string,
  policyId: string
): Promise<boolean> {
  try {
    const { data, error } = await (supabase as any)
      .from("cancellation_policy_acceptances")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("policy_id", policyId)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = nenhum resultado encontrado
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error("Erro ao verificar aceite:", error);
    return false;
  }
}

/**
 * Obter IP do cliente (para uso no navegador)
 */
export function getClientIP(): string | undefined {
  // No navegador, não temos acesso direto ao IP
  // Pode ser obtido via API externa ou salvo no servidor
  return undefined;
}

/**
 * Obter User Agent do navegador
 */
export function getClientUserAgent(): string {
  return navigator.userAgent || "unknown";
}

