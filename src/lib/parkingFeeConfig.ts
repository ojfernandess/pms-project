import { supabase } from "@/integrations/supabase/client";
import { validateRoomAvailability } from "@/lib/reservationUtils";

export const PARKING_FEE_KIND = "parking_fee";
export const PARKING_FEE_NAME = "Estacionamento";
export const PARKING_CATEGORY_KIND = "parking";

export type ParkingBillingMode = "daily" | "period";

export type ParkingFeeConfig = {
  id: string;
  establishmentId: string | null;
  buildingId: string | null;
  amount: number;
  isActive: boolean;
  serviceFeeId: string | null;
  billingMode: ParkingBillingMode;
  spotCount: number;
  parkingCategoryId: string | null;
};

export function isParkingFeeConfigured(config: ParkingFeeConfig | null | undefined): boolean {
  return Boolean(config?.isActive && Number(config?.amount) > 0);
}

export function computeParkingFeeTotal(
  config: Pick<ParkingFeeConfig, "amount" | "billingMode">,
  nights: number,
): { amount: number; quantity: number } {
  const unit = Number(config.amount || 0);
  const n = Math.max(0, nights);
  if (config.billingMode === "daily") {
    return { amount: unit, quantity: Math.max(1, n) };
  }
  return { amount: unit, quantity: 1 };
}

function mapRow(
  row: {
    id: string;
    establishment_id: string | null;
    building_id: string | null;
    default_amount: number | null;
    is_active: boolean;
    parking_billing_mode?: string | null;
    parking_spot_count?: number | null;
    parking_category_id?: string | null;
  },
  serviceFeeId: string | null,
): ParkingFeeConfig {
  const mode = row.parking_billing_mode === "period" ? "period" : "daily";
  return {
    id: row.id,
    establishmentId: row.establishment_id,
    buildingId: row.building_id,
    amount: Number(row.default_amount || 0),
    isActive: Boolean(row.is_active),
    serviceFeeId,
    billingMode: mode,
    spotCount: Math.max(0, Number(row.parking_spot_count || 0)),
    parkingCategoryId: row.parking_category_id ?? null,
  };
}

async function findLinkedServiceFeeId(establishmentId: string, sourceServiceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("service_fees")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("source_service_id", sourceServiceId)
    .maybeSingle();
  return data?.id ?? null;
}

const ESTABLISHMENT_SERVICE_SELECT =
  "id, establishment_id, building_id, default_amount, is_active, parking_billing_mode, parking_spot_count, parking_category_id";

/** Resolve estacionamento: prédio da categoria tem prioridade; senão usa o do hotel/estabelecimento. */
export async function fetchParkingFeeConfig(params: {
  establishmentId: string;
  buildingId?: string | null;
}): Promise<ParkingFeeConfig | null> {
  const { establishmentId, buildingId } = params;

  if (buildingId) {
    const { data: buildingRow } = await supabase
      .from("establishment_services")
      .select(ESTABLISHMENT_SERVICE_SELECT)
      .eq("building_id", buildingId)
      .eq("service_kind", PARKING_FEE_KIND)
      .maybeSingle();

    if (
      buildingRow &&
      Boolean(buildingRow.is_active) &&
      Number(buildingRow.default_amount || 0) > 0
    ) {
      const serviceFeeId = await findLinkedServiceFeeId(establishmentId, buildingRow.id);
      return mapRow(buildingRow, serviceFeeId);
    }
  }

  const { data: estRow } = await supabase
    .from("establishment_services")
    .select(ESTABLISHMENT_SERVICE_SELECT)
    .eq("establishment_id", establishmentId)
    .is("building_id", null)
    .eq("service_kind", PARKING_FEE_KIND)
    .maybeSingle();

  if (!estRow) return null;
  const serviceFeeId = await findLinkedServiceFeeId(establishmentId, estRow.id);
  return mapRow(estRow, serviceFeeId);
}

export async function syncParkingSpots(params: {
  establishmentId: string;
  buildingId?: string | null;
  spotCount: number;
  existingCategoryId?: string | null;
}): Promise<string | null> {
  const { establishmentId, buildingId, spotCount } = params;
  const count = Math.max(0, Math.min(500, Math.floor(spotCount)));
  if (count <= 0) return params.existingCategoryId ?? null;

  let categoryId = params.existingCategoryId ?? null;
  const categoryName = buildingId ? "Estacionamento (prédio)" : "Estacionamento";

  if (categoryId) {
    const { error } = await supabase
      .from("room_categories")
      .update({
        name: categoryName,
        category_kind: PARKING_CATEGORY_KIND,
        show_in_public: false,
        establishment_id: establishmentId,
        building_id: buildingId ?? null,
      })
      .eq("id", categoryId);
    if (error) throw error;
  } else {
    const { data: cat, error } = await supabase
      .from("room_categories")
      .insert({
        name: categoryName,
        category_kind: PARKING_CATEGORY_KIND,
        establishment_id: establishmentId,
        building_id: buildingId ?? null,
        capacity_adults: 1,
        capacity_children: 0,
        base_price: 0,
        show_in_public: false,
        type: "Parking",
        color: "#64748b",
      })
      .select("id")
      .single();
    if (error) throw error;
    categoryId = cat.id;
  }

  const { data: existingRooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, room_number")
    .eq("category_id", categoryId)
    .order("room_number");
  if (roomsError) throw roomsError;

  const existing = existingRooms ?? [];
  const pad = (n: number) => String(n).padStart(2, "0");

  for (let i = 1; i <= count; i++) {
    const num = `V-${pad(i)}`;
    const found = existing.find((r) => r.room_number === num);
    if (!found) {
      const { error } = await supabase.from("rooms").insert({
        room_number: num,
        name: `Vaga ${num}`,
        category_id: categoryId,
        establishment_id: establishmentId,
        status: "available",
        show_in_public: false,
        hide_from_map: false,
      });
      if (error) throw error;
    }
  }

  const extras = existing.filter((r) => {
    const match = /^V-(\d+)$/.exec(r.room_number);
    if (!match) return false;
    return Number(match[1]) > count;
  });

  for (const room of extras) {
    const { data: conflicts } = await supabase
      .from("reservations")
      .select("id")
      .eq("room_id", room.id)
      .neq("status", "cancelled")
      .limit(1);
    if (conflicts && conflicts.length > 0) continue;
    await supabase.from("rooms").delete().eq("id", room.id);
  }

  return categoryId;
}

export async function upsertParkingFeeConfig(params: {
  establishmentId: string;
  buildingId?: string | null;
  amount: number;
  isActive: boolean;
  billingMode: ParkingBillingMode;
  spotCount: number;
  existingServiceRowId?: string | null;
}): Promise<ParkingFeeConfig> {
  const { establishmentId, buildingId, amount, isActive, billingMode, spotCount, existingServiceRowId } = params;
  const billingDesc =
    billingMode === "daily"
      ? "Cobrança por diária da reserva"
      : "Valor único para todo o período da reserva";

  let parkingCategoryId: string | null = null;
  if (isActive && amount > 0 && spotCount > 0) {
    const existing =
      existingServiceRowId != null
        ? (
            await supabase
              .from("establishment_services")
              .select("parking_category_id")
              .eq("id", existingServiceRowId)
              .maybeSingle()
          ).data?.parking_category_id
        : null;
    parkingCategoryId = await syncParkingSpots({
      establishmentId,
      buildingId: buildingId ?? null,
      spotCount,
      existingCategoryId: existing,
    });
  }

  const payload = {
    name: PARKING_FEE_NAME,
    description: `Estacionamento (${billingDesc})`,
    service_kind: PARKING_FEE_KIND,
    default_amount: amount,
    is_active: isActive,
    establishment_id: buildingId ? null : establishmentId,
    building_id: buildingId ?? null,
    parking_billing_mode: billingMode,
    parking_spot_count: spotCount,
    parking_category_id: parkingCategoryId,
  };

  let serviceRowId = existingServiceRowId;

  if (serviceRowId) {
    const { error } = await supabase.from("establishment_services").update(payload).eq("id", serviceRowId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("establishment_services").insert(payload).select("id").single();
    if (error) throw error;
    serviceRowId = data.id;
  }

  let feeQuery = supabase
    .from("service_fees")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("service_kind", PARKING_FEE_KIND);
  feeQuery = buildingId ? feeQuery.eq("building_id", buildingId) : feeQuery.is("building_id", null);
  const { data: existingFee } = await feeQuery.maybeSingle();

  const feeName = buildingId ? `${PARKING_FEE_NAME} (prédio)` : PARKING_FEE_NAME;

  const feePayload = {
    establishment_id: establishmentId,
    name: feeName,
    description: billingDesc,
    service_kind: PARKING_FEE_KIND,
    default_amount: amount,
    is_active: isActive && amount > 0,
    source_service_id: serviceRowId,
    building_id: buildingId ?? null,
  };

  let serviceFeeId: string;
  if (existingFee?.id) {
    const { error } = await supabase.from("service_fees").update(feePayload).eq("id", existingFee.id);
    if (error) throw error;
    serviceFeeId = existingFee.id;
  } else {
    const { data, error } = await supabase.from("service_fees").insert(feePayload).select("id").single();
    if (error) throw error;
    serviceFeeId = data.id;
  }

  return {
    id: serviceRowId!,
    establishmentId: buildingId ? null : establishmentId,
    buildingId: buildingId ?? null,
    amount,
    isActive: isActive && amount > 0,
    serviceFeeId,
    billingMode,
    spotCount,
    parkingCategoryId,
  };
}

export async function attachParkingFeeToReservation(params: {
  reservationId: string;
  serviceFeeId: string;
  amount: number;
  quantity: number;
  billingMode: ParkingBillingMode;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const notes =
    params.billingMode === "daily"
      ? `Estacionamento (${params.quantity} diária(s) × ${params.amount})`
      : "Estacionamento (período)";
  const { error } = await supabase.from("reservation_service_fees").insert({
    reservation_id: params.reservationId,
    service_fee_id: params.serviceFeeId,
    amount: params.amount,
    quantity: params.quantity,
    notes,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function findLinkedParkingReservation(lodgingReservationId: string): Promise<string | null> {
  const { data } = await supabase
    .from("reservations")
    .select("id")
    .eq("lodging_reservation_id", lodgingReservationId)
    .neq("status", "cancelled")
    .maybeSingle();
  return data?.id ?? null;
}

async function pickAvailableParkingRoom(
  categoryId: string,
  checkin: string,
  checkout: string,
  excludeReservationId?: string | null,
): Promise<string | null> {
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, room_number, is_blocked")
    .eq("category_id", categoryId)
    .order("room_number");
  if (error) throw error;

  for (const room of rooms ?? []) {
    if (room.is_blocked) continue;
    const availability = await validateRoomAvailability(room.id, checkin, checkout, excludeReservationId ?? undefined);
    if (availability.available) return room.id;
  }
  return null;
}

/** Cria ou atualiza a reserva da vaga no mapa com dados do hóspede principal. */
export async function syncParkingSpotReservationForLodging(params: {
  lodgingReservationId: string;
  establishmentId: string;
  parkingCategoryId: string;
  checkinDate: string;
  checkoutDate: string;
  clientId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  adults?: number;
  children?: number;
  lodgingReservationCode?: string | null;
}): Promise<{ parkingReservationId: string | null; warning?: string }> {
  const roomId = await pickAvailableParkingRoom(
    params.parkingCategoryId,
    params.checkinDate,
    params.checkoutDate,
    await findLinkedParkingReservation(params.lodgingReservationId),
  );

  if (!roomId) {
    return {
      parkingReservationId: null,
      warning: "Não há vaga de estacionamento livre neste período. A taxa foi incluída; atribua uma vaga manualmente no mapa.",
    };
  }

  const existingId = await findLinkedParkingReservation(params.lodgingReservationId);
  const noteSuffix = params.lodgingReservationCode
    ? `Reserva hospedagem ${params.lodgingReservationCode}`
    : `Vinculada à reserva ${params.lodgingReservationId}`;

  const row = {
    establishment_id: params.establishmentId,
    lodging_reservation_id: params.lodgingReservationId,
    category_id: params.parkingCategoryId,
    room_id: roomId,
    client_id: params.clientId ?? null,
    guest_id: params.guestId ?? null,
    guest_name: params.guestName ?? null,
    checkin_date: params.checkinDate,
    checkout_date: params.checkoutDate,
    adults: params.adults ?? 1,
    children: params.children ?? 0,
    total_amount: 0,
    paid_amount: 0,
    status: "confirmed" as const,
    payment_status: "pending" as const,
    channel: "parking",
    notes: `Estacionamento — ${noteSuffix}`,
  };

  if (existingId) {
    const { error } = await supabase.from("reservations").update(row).eq("id", existingId);
    if (error) throw error;
    return { parkingReservationId: existingId };
  }

  const { createReservationWithLock } = await import("@/lib/pmsApi");
  const lockResult = await createReservationWithLock({
    p_reservation_data: {
      ...row,
      pricing_plan_id: null,
      created_by: null,
    },
    p_checkin_date: params.checkinDate,
    p_checkout_date: params.checkoutDate,
    p_establishment_id: params.establishmentId,
    p_room_id: roomId,
    p_category_id: params.parkingCategoryId,
  });

  if (!lockResult?.success || !lockResult.reservation_id) {
    throw new Error(lockResult?.error || "Não foi possível reservar a vaga de estacionamento");
  }

  const { error: linkError } = await supabase
    .from("reservations")
    .update({ lodging_reservation_id: params.lodgingReservationId })
    .eq("id", lockResult.reservation_id);
  if (linkError) throw linkError;

  return { parkingReservationId: lockResult.reservation_id };
}

export async function cancelParkingSpotForLodging(lodgingReservationId: string): Promise<void> {
  const parkingId = await findLinkedParkingReservation(lodgingReservationId);
  if (!parkingId) return;
  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: "Estacionamento removido da reserva principal" })
    .eq("id", parkingId);
  if (error) throw error;
}