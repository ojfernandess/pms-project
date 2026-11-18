import { supabase } from "@/integrations/supabase/client";
import { calculateNights } from "@/lib/reservationUtils";
import { ensureParkingFeeOnLodging } from "@/lib/parkingMapReservation";
import {
  PARKING_FEE_KIND,
  fetchParkingFeeConfig,
  isParkingFeeConfigured,
  syncParkingSpotReservationForLodging,
} from "@/lib/parkingFeeConfig";
import { syncLinkedParkingSpotPaymentFromLodging } from "@/lib/parkingPaymentSync";

function dateOnly(value: string): string {
  return String(value).split("T")[0];
}

/**
 * Inclui/atualiza taxa de estacionamento na hospedagem e reserva vaga no mapa (sem exigir pagamento).
 */
export async function provisionParkingForLodgingReservation(params: {
  lodgingReservationId: string;
  establishmentId: string;
  buildingId?: string | null;
  checkinDate: string;
  checkoutDate: string;
  clientId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  adults?: number;
  children?: number;
  lodgingReservationCode?: string | null;
}): Promise<{ warning?: string; parkingReservationId?: string | null }> {
  const config = await fetchParkingFeeConfig({
    establishmentId: params.establishmentId,
    buildingId: params.buildingId ?? null,
  });

  if (!isParkingFeeConfigured(config) || !config?.serviceFeeId) {
    return { warning: "Estacionamento não está configurado ou sem valor em Serviços." };
  }

  const cin = dateOnly(params.checkinDate);
  const cout = dateOnly(params.checkoutDate);
  const nights = calculateNights(cin, cout);

  await ensureParkingFeeOnLodging(params.lodgingReservationId, config, nights);

  if (!config.parkingCategoryId) {
    return {
      warning:
        "Taxa de estacionamento incluída, mas não há vagas no mapa. Configure a quantidade em Serviços do estabelecimento.",
      parkingReservationId: null,
    };
  }

  const sync = await syncParkingSpotReservationForLodging({
    lodgingReservationId: params.lodgingReservationId,
    establishmentId: params.establishmentId,
    parkingCategoryId: config.parkingCategoryId,
    checkinDate: cin,
    checkoutDate: cout,
    clientId: params.clientId,
    guestId: params.guestId,
    guestName: params.guestName,
    adults: params.adults,
    children: params.children,
    lodgingReservationCode: params.lodgingReservationCode,
  });

  if (sync.warning) {
    return { warning: sync.warning, parkingReservationId: sync.parkingReservationId };
  }

  try {
    await syncLinkedParkingSpotPaymentFromLodging(params.lodgingReservationId);
  } catch {
    /* ignore */
  }

  return { parkingReservationId: sync.parkingReservationId };
}

/** Garante vaga no mapa se a hospedagem já tem taxa de estacionamento (ex.: após pagamento). */
export async function ensureParkingSpotIfLodgingHasFee(lodgingReservationId: string): Promise<void> {
  const { data: feeRows } = await supabase
    .from("reservation_service_fees")
    .select("id, service_fees(service_kind)")
    .eq("reservation_id", lodgingReservationId);

  const hasParking = (feeRows ?? []).some(
    (r) => (r as { service_fees?: { service_kind?: string } }).service_fees?.service_kind === PARKING_FEE_KIND,
  );
  if (!hasParking) return;

  const result = await maybeSyncParkingSpotAfterFeeAdded(lodgingReservationId, PARKING_FEE_KIND);
  if (result.warning) {
    console.warn("ensureParkingSpotIfLodgingHasFee:", result.warning);
  }
}

/** Após vincular taxa de estacionamento à reserva, ocupa vaga no mapa. */
export async function maybeSyncParkingSpotAfterFeeAdded(
  reservationId: string,
  serviceKind?: string | null,
): Promise<{ warning?: string }> {
  if (serviceKind !== PARKING_FEE_KIND) return {};

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select(
      `
      id,
      establishment_id,
      checkin_date,
      checkout_date,
      client_id,
      guest_id,
      guest_name,
      adults,
      children,
      reservation_code,
      room_categories ( building_id )
    `,
    )
    .eq("id", reservationId)
    .single();

  if (error || !reservation?.establishment_id) {
    console.error("maybeSyncParkingSpotAfterFeeAdded: reserva não encontrada", error);
    return {};
  }

  const buildingId =
    (Array.isArray(reservation.room_categories)
      ? reservation.room_categories[0]?.building_id
      : (reservation.room_categories as { building_id?: string | null })?.building_id) ?? null;

  const parkingConfig = await fetchParkingFeeConfig({
    establishmentId: reservation.establishment_id,
    buildingId,
  });

  if (!parkingConfig?.parkingCategoryId) {
    return { warning: "Estacionamento ativo, mas vagas não configuradas. Defina a quantidade de vagas em Serviços." };
  }

  return syncParkingSpotReservationForLodging({
    lodgingReservationId: reservationId,
    establishmentId: reservation.establishment_id,
    parkingCategoryId: parkingConfig.parkingCategoryId,
    checkinDate: dateOnly(String(reservation.checkin_date)),
    checkoutDate: dateOnly(String(reservation.checkout_date)),
    clientId: reservation.client_id,
    guestId: reservation.guest_id,
    guestName: reservation.guest_name,
    adults: reservation.adults ?? 1,
    children: reservation.children ?? 0,
    lodgingReservationCode: reservation.reservation_code,
  });
}