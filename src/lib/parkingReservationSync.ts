import { supabase } from "@/integrations/supabase/client";
import {
  PARKING_FEE_KIND,
  fetchParkingFeeConfig,
  syncParkingSpotReservationForLodging,
} from "@/lib/parkingFeeConfig";

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
    checkinDate: String(reservation.checkin_date),
    checkoutDate: String(reservation.checkout_date),
    clientId: reservation.client_id,
    guestId: reservation.guest_id,
    guestName: reservation.guest_name,
    adults: reservation.adults ?? 1,
    children: reservation.children ?? 0,
    lodgingReservationCode: reservation.reservation_code,
  });
}