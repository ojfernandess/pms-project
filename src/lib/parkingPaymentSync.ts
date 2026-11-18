import { supabase } from "@/integrations/supabase/client";
import { findLinkedParkingReservation, PARKING_FEE_KIND } from "@/lib/parkingFeeConfig";
import {
  allocateReservationPayments,
  inferPaymentAllocationParams,
  type ReservationPaymentRow,
  type ReservationServiceFeeRow,
} from "@/lib/reservationPaymentAllocation";

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

/** Quanto do estacionamento já foi pago na reserva de hospedagem (inclui [COMPONENT:all] e rateio legado). */
export async function getLodgingParkingFeeBalance(
  lodgingReservationId: string,
): Promise<LodgingParkingFeeBalance | null> {
  const fee = await getLodgingParkingFeeRow(lodgingReservationId);
  if (!fee?.id) return null;

  const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);

  const [
    { data: reservation, error: resErr },
    { data: payments, error: payErr },
    { data: feeRows, error: feesErr },
    { data: logs, error: logsErr },
  ] = await Promise.all([
    supabase.from("reservations").select("id, total_amount, paid_amount").eq("id", lodgingReservationId).single(),
    supabase.from("payments").select("id, amount, notes, payment_date, created_at").eq("reservation_id", lodgingReservationId),
    supabase
      .from("reservation_service_fees")
      .select("id, amount, quantity, created_at")
      .eq("reservation_id", lodgingReservationId),
    supabase
      .from("activity_logs")
      .select("action_type, new_values, old_values, created_at")
      .eq("entity_id", lodgingReservationId)
      .eq("entity_type", "reservation")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (resErr) throw resErr;
  if (payErr) throw payErr;
  if (feesErr) throw feesErr;
  if (logsErr) throw logsErr;

  const allocationParams = inferPaymentAllocationParams(reservation ?? {}, logs);
  const { feesPaid } = allocateReservationPayments({
    payments: (payments ?? []) as ReservationPaymentRow[],
    serviceFees: (feeRows ?? []) as ReservationServiceFeeRow[],
    originalBaseAmount: allocationParams.originalBaseAmount,
    extensionAmount: allocationParams.extensionAmount,
    wasCreatedWithoutPayment: allocationParams.wasCreatedWithoutPayment,
    extensionAddedAt: allocationParams.extensionAddedAt,
  });

  const paid = Math.round((feesPaid[fee.id] ?? 0) * 100) / 100;
  const pending = Math.max(0, Math.round((feeTotal - paid) * 100) / 100);
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

export type ParkingSpotPaymentSyncResult = {
  parkingReservationId: string | null;
  payment_status: "pending" | "partial" | "paid";
};

/** Atualiza payment_status da vaga no mapa conforme pagamento da taxa na hospedagem. */
export async function syncLinkedParkingSpotPaymentFromLodging(
  lodgingReservationId: string,
): Promise<ParkingSpotPaymentSyncResult> {
  const parkingId = await findLinkedParkingReservation(lodgingReservationId);
  if (!parkingId) {
    return { parkingReservationId: null, payment_status: "pending" };
  }

  const balance = await getLodgingParkingFeeBalance(lodgingReservationId);
  let payment_status: "pending" | "partial" | "paid" = "pending";
  if (balance?.isFullyPaid) payment_status = "paid";
  else if (balance?.isPartiallyPaid) payment_status = "partial";

  const updatePayload: { payment_status: typeof payment_status; status?: "confirmed" } = {
    payment_status,
  };
  if (payment_status === "paid") {
    updatePayload.status = "confirmed";
  }

  const { error } = await supabase.from("reservations").update(updatePayload).eq("id", parkingId);
  if (error) console.error("syncLinkedParkingSpotPaymentFromLodging:", error);

  return { parkingReservationId: parkingId, payment_status };
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

  const ps = String(reservation.payment_status ?? "pending").toLowerCase();
  if (ps === "paid" || ps === "pago") return 1;
  if (ps === "partial" || ps === "parcial") return 0.01;
  return 0;
}

/** Cor no mapa de vagas: deriva apenas do status sincronizado (evita `0 >= 0` como “pago”). */
/**
 * Status de pagamento para UI (quick view, detalhes) em vagas cobradas na hospedagem.
 * Retorna null se a reserva segue a regra financeira padrão.
 */
export function parkingSpotUiPaymentStatus(
  reservation: Parameters<typeof isParkingSpotMapReservation>[0],
): "unpaid" | "pending" | "confirmed" | null {
  if (!isParkingSpotMapReservation(reservation) || Number(reservation.total_amount || 0) > 0) {
    return null;
  }
  const tone = parkingSpotMapPaymentTone(reservation);
  if (tone === "paid") return "confirmed";
  if (tone === "partial") return "pending";
  return "unpaid";
}

export function parkingSpotMapPaymentTone(reservation: Parameters<typeof effectiveMapPaidAmount>[0]): "paid" | "partial" | "unpaid" {
  if (!isParkingSpotMapReservation(reservation) || Number(reservation.total_amount || 0) > 0) {
    return "unpaid";
  }
  const marker = effectiveMapPaidAmount(reservation);
  if (marker >= 1) return "paid";
  if (marker > 0) return "partial";
  return "unpaid";
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