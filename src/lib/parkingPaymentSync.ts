import { supabase } from "@/integrations/supabase/client";
import { findLinkedParkingReservation, PARKING_FEE_KIND } from "@/lib/parkingFeeConfig";
import { isPaymentRefundRecord } from "@/lib/reservationUtils";

export type LodgingParkingFeeBalance = {
  feeRowId: string;
  feeTotal: number;
  paid: number;
  pending: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  feeAmount: number;
  feeQuantity: number;
};

export async function getLodgingParkingFeeRow(lodgingReservationId: string) {
  const { data: rows, error } = await supabase
    .from("reservation_service_fees")
    .select("id, amount, quantity, created_at, notes, service_fees(service_kind, name)")
    .eq("reservation_id", lodgingReservationId);
  if (error) throw error;
  return (rows ?? []).find(
    (r) => (r as { service_fees?: { service_kind?: string } }).service_fees?.service_kind === PARKING_FEE_KIND,
  ) as
    | {
        id: string;
        amount: number;
        quantity: number;
        created_at?: string;
        notes?: string | null;
        service_fees?: { name?: string };
      }
    | undefined;
}

/** Quanto do estacionamento já foi pago na reserva de hospedagem (pagamentos com componente fee-*). */
export async function getLodgingParkingFeeBalance(
  lodgingReservationId: string,
): Promise<LodgingParkingFeeBalance | null> {
  const fee = await getLodgingParkingFeeRow(lodgingReservationId);
  if (!fee?.id) return null;

  const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
  const { data: payments, error } = await supabase
    .from("payments")
    .select("id, amount, notes, payment_date, created_at")
    .eq("reservation_id", lodgingReservationId);
  if (error) throw error;

  const feePrefix = `[COMPONENT:fee-${fee.id}]`;
  let paid = 0;
  for (const payment of payments ?? []) {
    if (isPaymentRefundRecord(payment)) continue;
    const notes = String(payment.notes ?? "");
    if (!notes.includes(feePrefix)) continue;
    paid += Number(payment.amount || 0);
  }

  const pending = Math.max(0, feeTotal - paid);
  const isFullyPaid = feeTotal > 0 && pending < 0.02;
  const isPartiallyPaid = paid > 0.01 && !isFullyPaid;

  return {
    feeRowId: fee.id,
    feeTotal,
    paid,
    pending,
    isFullyPaid,
    isPartiallyPaid,
    feeAmount: Number(fee.amount || 0),
    feeQuantity: Number(fee.quantity || 1),
  };
}

/** Atualiza payment_status da vaga no mapa conforme pagamento da taxa na hospedagem. */
export async function syncLinkedParkingSpotPaymentFromLodging(lodgingReservationId: string): Promise<void> {
  const parkingId = await findLinkedParkingReservation(lodgingReservationId);
  if (!parkingId) return;

  const balance = await getLodgingParkingFeeBalance(lodgingReservationId);
  let payment_status: "pending" | "partial" | "paid" = "pending";
  if (balance?.isFullyPaid) payment_status = "paid";
  else if (balance?.isPartiallyPaid) payment_status = "partial";

  const { error } = await supabase.from("reservations").update({ payment_status }).eq("id", parkingId);
  if (error) console.error("syncLinkedParkingSpotPaymentFromLodging:", error);
}

export function isParkingSpotMapReservation(reservation: {
  total_amount?: number | null;
  channel?: string | null;
  lodging_reservation_id?: string | null;
  room_categories?: { category_kind?: string } | { category_kind?: string }[] | null;
}): boolean {
  const kind = Array.isArray(reservation.room_categories)
    ? reservation.room_categories[0]?.category_kind
    : reservation.room_categories?.category_kind;
  return (
    kind === "parking" ||
  !!(reservation.lodging_reservation_id && Number(reservation.total_amount || 0) === 0 && reservation.channel === "parking"));
}

/** Para cor no mapa: vaga cobrada na hospedagem usa payment_status da vaga (sincronizado). */
export function effectiveMapPaidAmount(reservation: {
  paid_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  channel?: string | null;
  lodging_reservation_id?: string | null;
  room_categories?: { category_kind?: string } | { category_kind?: string }[] | null;
}): number {
  const basePaid = Number(reservation.paid_amount || 0);
  if (!isParkingSpotMapReservation(reservation)) return basePaid;

  const total = Number(reservation.total_amount || 0);
  if (total > 0) return basePaid;

  const ps = String(reservation.payment_status ?? "pending");
  if (ps === "paid") return 1;
  if (ps === "partial") return 0.01;
  return 0;
}

export function parkingFeeDefaultsFromStay(
  config: { amount: number; billingMode: "daily" | "period" },
  nights: number,
): { amount: number; quantity: number } {
  const unit = Number(config.amount || 0);
  const n = Math.max(0, nights);
  if (config.billingMode === "daily") {
    return { amount: unit, quantity: Math.max(1, n) };
  }
  return { amount: unit, quantity: 1 };
}