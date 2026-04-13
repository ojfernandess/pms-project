import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { postPmsApi } from "@/lib/pmsApi";

/**
 * Gera um link de pagamento para uma reserva
 */
export const generatePaymentLink = async (
  reservationId: string,
  amount: number,
  description?: string
): Promise<string> => {
  const establishmentId = getSelectedEstablishmentId();
  if (!establishmentId) {
    throw new Error("Establishment ID não encontrado");
  }

  // Buscar dados da reserva
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, guest_id, establishment_id")
    .eq("id", reservationId)
    .single();

  if (reservationError || !reservation) {
    throw new Error("Reserva não encontrada");
  }

  // Criar Payment Intent
  const data = await postPmsApi<{ payment_intent_id: string }>("/api/pagamentos/stripe/intent", {
    establishment_id: establishmentId,
    amount,
    currency: "BRL",
    payment_type: "reservation_payment",
    reservation_id: reservationId,
    guest_id: reservation.guest_id,
    description: description || `Pagamento da reserva #${reservationId}`,
  });

  // Retornar URL de pagamento
  // Você pode criar uma página de pagamento dedicada ou usar o Checkout do Stripe
  const siteUrl = window.location.origin;
  return `${siteUrl}/payment/${data.payment_intent_id}`;
};

/**
 * Gera link de pagamento para taxas adicionais
 */
export const generateAdditionalFeePaymentLink = async (
  reservationId: string,
  feeAmount: number,
  feeDescription: string
): Promise<string> => {
  return generatePaymentLink(
    reservationId,
    feeAmount,
    `Taxa adicional: ${feeDescription}`
  );
};

