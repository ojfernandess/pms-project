import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

export type ActionType =
  | "created"
  | "updated"
  | "deleted"
  | "moved"
  | "swapped"
  | "blocked"
  | "unblocked"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "payment_added"
  | "payment_updated"
  | "payment_refunded"
  | "payment_notes_updated"
  | "service_fee_added"
  | "service_fee_updated"
  | "service_fee_removed"
  | "split"
  | "merged"
  | "status_changed"
  | "room_assigned"
  | "room_changed"
  | "dates_changed"
  | "amount_changed"
  | "guest_changed"
  | "resolved"
  | "price_applied"
  | "bulk_updated"
  | "rule_applied";

export type EntityType =
  | "reservation"
  | "room"
  | "client"
  | "room_category"
  | "payment"
  | "block"
  | "pending"
  | "service_fee"
  | "rate_calendar"
  | "pricing_plan"
  | "dynamic_pricing_rule"
  | "rate_restriction";

export interface ActivityLogParams {
  actionType: ActionType;
  entityType: EntityType;
  entityId?: string;
  entityCode?: string;
  description: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Registra uma atividade no sistema de logs
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const establishmentId = getSelectedEstablishmentId();

    if (!establishmentId) {
      console.warn("⚠️ Não foi possível registrar log: establishment_id não encontrado");
      return;
    }

    // Chamar a função do banco de dados
    // Ordem dos parâmetros: obrigatórios primeiro, depois opcionais
    const { error } = await supabase.rpc("log_activity", {
      p_establishment_id: establishmentId,
      p_user_id: user?.id || null,
      p_action_type: params.actionType,
      p_entity_type: params.entityType,
      p_description: params.description,
      p_entity_id: params.entityId || null,
      p_entity_code: params.entityCode || null,
      p_old_values: params.oldValues || null,
      p_new_values: params.newValues || null,
      p_metadata: params.metadata || null,
    });

    if (error) {
      console.error("❌ Erro ao registrar log de atividade:", error);
      // Não lançar erro para não interromper o fluxo principal
    }
  } catch (error) {
    console.error("❌ Erro ao registrar log de atividade:", error);
    // Não lançar erro para não interromper o fluxo principal
  }
}

/**
 * Helper para criar descrição de movimentação de reserva
 */
export function createMoveDescription(
  reservationCode: string,
  oldRoom: string,
  newRoom: string,
  oldCheckin: string,
  newCheckin: string,
  oldCheckout: string,
  newCheckout: string
): string {
  const parts: string[] = [];
  
  if (oldRoom !== newRoom) {
    parts.push(`Quarto: ${oldRoom} → ${newRoom}`);
  }
  
  if (oldCheckin !== newCheckin) {
    parts.push(`Check-in: ${oldCheckin} → ${newCheckin}`);
  }
  
  if (oldCheckout !== newCheckout) {
    parts.push(`Check-out: ${oldCheckout} → ${newCheckout}`);
  }
  
  return `Reserva ${reservationCode} movida: ${parts.join(", ")}`;
}

/**
 * Helper para criar descrição de troca de reservas
 */
export function createSwapDescription(
  reservation1Code: string,
  reservation2Code: string
): string {
  return `Reservas ${reservation1Code} e ${reservation2Code} trocadas de posição`;
}

/**
 * Helper para criar descrição de bloqueio
 */
export function createBlockDescription(
  roomName: string,
  checkin: string,
  checkout: string,
  reason?: string
): string {
  return `Quarto ${roomName} bloqueado de ${checkin} a ${checkout}${reason ? ` (${reason})` : ""}`;
}

/**
 * Helper para criar descrição de alteração de reserva
 */
export function createReservationUpdateDescription(
  reservationCode: string,
  changes: Record<string, { old: any; new: any }>
): string {
  const changeDescriptions = Object.entries(changes).map(([key, { old, new: newVal }]) => {
    const keyLabel: Record<string, string> = {
      status: "Status",
      payment_status: "Status de pagamento",
      total_amount: "Valor total",
      paid_amount: "Valor pago",
      checkin_date: "Data de check-in",
      checkout_date: "Data de check-out",
      room_id: "Quarto",
      adults: "Adultos",
      children: "Crianças",
    };
    
    return `${keyLabel[key] || key}: ${old} → ${newVal}`;
  });
  
  return `Reserva ${reservationCode} alterada: ${changeDescriptions.join(", ")}`;
}

