import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { checkPeriodAvailabilityForSale, parseLocalDate } from "@/lib/ariAvailabilityUtils";

const ACTIVE_RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checkedin",
  "blocked",
  "preregistration",
] as const;

/**
 * Quartos públicos livres no período (quarto atribuído + overlap de datas).
 * Não considera reservas sem room_id — isso entra no mínimo ARI.
 */
export async function countPublicPhysicalRoomsAvailableForPeriod(
  establishmentId: string,
  categoryId: string,
  checkinDate: string,
  checkoutDate: string,
): Promise<number> {
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id")
    .eq("category_id", categoryId)
    .eq("establishment_id", establishmentId)
    .eq("show_in_public", true)
    .in("status", ["available", "cleaning"])
    .eq("is_blocked", false);

  if (roomsError || !rooms?.length) return 0;

  const { data: conflictingReservations, error: reservationsError } = await supabase
    .from("reservations")
    .select("room_id")
    .eq("category_id", categoryId)
    .eq("establishment_id", establishmentId)
    .in("status", [...ACTIVE_RESERVATION_STATUSES])
    .or(`and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`);

  if (reservationsError) return 0;

  const occupiedRoomIds = new Set(
    conflictingReservations?.map((r) => r.room_id).filter(Boolean) || [],
  );

  return rooms.filter((room) => !occupiedRoomIds.has(room.id)).length;
}

async function minAriAvailableRoomsForPeriod(
  establishmentId: string,
  categoryId: string,
  checkin: Date,
  checkout: Date,
): Promise<number> {
  let minAvailable = Infinity;
  const current = new Date(checkin);
  while (current < checkout) {
    const dateStr = format(current, "yyyy-MM-dd");
    const { data: calculated, error } = await supabase.rpc("calculate_category_availability", {
      p_establishment_id: establishmentId,
      p_category_id: categoryId,
      p_date: dateStr,
    });

    let availableRooms = 0;
    if (!error && calculated) {
      const payload = calculated as { available_rooms?: number };
      availableRooms = Number(payload.available_rooms ?? 0);
    }
    minAvailable = Math.min(minAvailable, availableRooms);
    current.setDate(current.getDate() + 1);
  }
  return minAvailable === Infinity ? 0 : minAvailable;
}

/**
 * Disponibilidade para o motor público: mesmo cálculo do ARI/mapa (mínimo por noite),
 * limitado aos quartos exibidos na página pública.
 */
export async function getPublicCategoryAvailabilityForPeriod(
  establishmentId: string,
  categoryId: string,
  checkinDate: string,
  checkoutDate: string,
  requiredRooms: number = 1,
): Promise<{ available: boolean; availableRooms: number; reason?: string }> {
  const checkinLocal = parseLocalDate(checkinDate);
  const checkoutLocal = parseLocalDate(checkoutDate);

  const periodCheck = await checkPeriodAvailabilityForSale(
    establishmentId,
    categoryId,
    checkinLocal,
    checkoutLocal,
    "booking_engine",
  );
  if (!periodCheck.available) {
    return { available: false, availableRooms: 0, reason: periodCheck.reason ?? "Período fechado para venda" };
  }

  const [ariMin, physicalPublic] = await Promise.all([
    minAriAvailableRoomsForPeriod(establishmentId, categoryId, checkinLocal, checkoutLocal),
    countPublicPhysicalRoomsAvailableForPeriod(establishmentId, categoryId, checkinDate, checkoutDate),
  ]);

  const availableRooms = Math.min(ariMin, physicalPublic);

  return {
    available: availableRooms >= requiredRooms,
    availableRooms,
    reason:
      availableRooms < requiredRooms
        ? `Apenas ${availableRooms} ${availableRooms === 1 ? "quarto disponível" : "quartos disponíveis"} de ${requiredRooms} necessário(s)`
        : undefined,
  };
}