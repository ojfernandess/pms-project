import { supabase } from "@/integrations/supabase/client";
import { calculateNights, validateRoomAvailability } from "@/lib/reservationUtils";
import {
  PARKING_FEE_KIND,
  attachParkingFeeToReservation,
  computeParkingFeeTotal,
  findLinkedParkingReservation,
  type ParkingFeeConfig,
} from "@/lib/parkingFeeConfig";

export type LodgingReservationPick = {
  id: string;
  reservation_code?: string | null;
  guest_name?: string | null;
  client_id?: string | null;
  guest_id?: string | null;
  adults?: number | null;
  children?: number | null;
  checkin_date: string;
  checkout_date: string;
};

export async function lodgingReservationsForParkingLink(params: {
  establishmentId: string;
  checkinDate: string;
  checkoutDate: string;
  search?: string;
}): Promise<LodgingReservationPick[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, reservation_code, guest_name, client_id, guest_id, adults, children, checkin_date, checkout_date, category_id",
    )
    .eq("establishment_id", params.establishmentId)
    .is("lodging_reservation_id", null)
    .neq("status", "cancelled")
    .neq("status", "blocked")
    .order("checkin_date", { ascending: false })
    .limit(120);

  if (error) throw error;

  const rows = data ?? [];
  const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  let parkingCategoryIds = new Set<string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await supabase
      .from("room_categories")
      .select("id, category_kind")
      .in("id", categoryIds);
    parkingCategoryIds = new Set(
      (cats ?? []).filter((c) => c.category_kind === "parking").map((c) => c.id),
    );
  }

  const q = String(params.search ?? "")
    .trim()
    .toLowerCase();
  const cin = params.checkinDate;
  const cout = params.checkoutDate;

  return rows.filter((row) => {
    if (row.category_id && parkingCategoryIds.has(row.category_id)) return false;

    const rowCin = String(row.checkin_date).split("T")[0];
    const rowCout = String(row.checkout_date).split("T")[0];
    const overlaps = rowCin < cout && rowCout > cin;
    if (!overlaps) return false;

    if (!q) return true;
    const code = String(row.reservation_code ?? "").toLowerCase();
    const guest = String(row.guest_name ?? "").toLowerCase();
    return code.includes(q) || guest.includes(q);
  }) as LodgingReservationPick[];
}

export async function ensureParkingFeeOnLodging(
  lodgingReservationId: string,
  config: Pick<ParkingFeeConfig, "serviceFeeId" | "amount" | "billingMode">,
  nights: number,
): Promise<string | null> {
  if (!config.serviceFeeId) return null;

  const { data: rows } = await supabase
    .from("reservation_service_fees")
    .select("id, service_fees(service_kind)")
    .eq("reservation_id", lodgingReservationId);

  const existingParking = (rows ?? []).find(
    (r) => (r as { service_fees?: { service_kind?: string } }).service_fees?.service_kind === PARKING_FEE_KIND,
  );

  const { amount, quantity } = computeParkingFeeTotal(config, nights);
  const notes =
    config.billingMode === "daily"
      ? `Estacionamento (${quantity} diária(s) × ${amount})`
      : "Estacionamento (período)";

  if (existingParking?.id) {
    await supabase
      .from("reservation_service_fees")
      .update({ amount, quantity, notes })
      .eq("id", existingParking.id);
    return existingParking.id;
  }

  await attachParkingFeeToReservation({
    reservationId: lodgingReservationId,
    serviceFeeId: config.serviceFeeId,
    amount,
    quantity,
    billingMode: config.billingMode,
  });

  const { data: created } = await supabase
    .from("reservation_service_fees")
    .select("id")
    .eq("reservation_id", lodgingReservationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return created?.id ?? null;
}

function stayBounds(lodging: LodgingReservationPick) {
  return {
    checkinDate: String(lodging.checkin_date).split("T")[0],
    checkoutDate: String(lodging.checkout_date).split("T")[0],
  };
}

/** Vaga no mapa: total zero; cobrança só na reserva de hospedagem vinculada. */
export async function createParkingSpotReservationOnMap(params: {
  lodgingReservation: LodgingReservationPick;
  establishmentId: string;
  parkingCategoryId: string;
  parkingRoomId: string;
  checkinDate?: string;
  checkoutDate?: string;
}): Promise<{ parkingReservationId: string }> {
  const { checkinDate, checkoutDate } = stayBounds(params.lodgingReservation);

  const existing = await findLinkedParkingReservation(params.lodgingReservation.id);
  if (existing) {
    const { error } = await supabase
      .from("reservations")
      .update({
        room_id: params.parkingRoomId,
        category_id: params.parkingCategoryId,
        checkin_date: checkinDate,
        checkout_date: checkoutDate,
      })
      .eq("id", existing);
    if (error) throw error;
    return { parkingReservationId: existing };
  }

  const availability = await validateRoomAvailability(
    params.parkingRoomId,
    checkinDate,
    checkoutDate,
  );
  if (!availability.available) {
    throw new Error(availability.reason || "Vaga indisponível neste período");
  }

  const noteSuffix = params.lodgingReservation.reservation_code
    ? `Reserva hospedagem ${params.lodgingReservation.reservation_code}`
    : `Vinculada à reserva ${params.lodgingReservation.id}`;

  const row = {
    establishment_id: params.establishmentId,
    lodging_reservation_id: params.lodgingReservation.id,
    category_id: params.parkingCategoryId,
    room_id: params.parkingRoomId,
    client_id: params.lodgingReservation.client_id ?? null,
    guest_id: params.lodgingReservation.guest_id ?? null,
    guest_name: params.lodgingReservation.guest_name ?? null,
    adults: params.lodgingReservation.adults ?? 1,
    children: params.lodgingReservation.children ?? 0,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    total_amount: 0,
    paid_amount: 0,
    status: "confirmed" as const,
    payment_status: "pending" as const,
    channel: "parking",
    notes: `Estacionamento — ${noteSuffix}`,
  };

  const { createReservationWithLock } = await import("@/lib/pmsApi");
  const lockResult = await createReservationWithLock({
    p_reservation_data: { ...row, pricing_plan_id: null, created_by: null },
    p_checkin_date: checkinDate,
    p_checkout_date: checkoutDate,
    p_establishment_id: params.establishmentId,
    p_room_id: params.parkingRoomId,
    p_category_id: params.parkingCategoryId,
  });

  if (!lockResult?.success || !lockResult.reservation_id) {
    throw new Error(lockResult?.error || "Não foi possível reservar a vaga");
  }

  const { error: linkError } = await supabase
    .from("reservations")
    .update({ lodging_reservation_id: params.lodgingReservation.id })
    .eq("id", lockResult.reservation_id);
  if (linkError) throw linkError;

  return { parkingReservationId: lockResult.reservation_id };
}

export function lodgingNightsForParking(lodging: LodgingReservationPick): number {
  const { checkinDate, checkoutDate } = stayBounds(lodging);
  return calculateNights(checkinDate, checkoutDate);
}