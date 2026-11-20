import { format } from "date-fns";

export type AriReservationLite = {
  id: string;
  room_id: string | null;
  category_id: string | null;
  checkin_date: string;
  checkout_date: string;
  status: string;
};

export type AriLiveInventory = {
  total_rooms: number;
  available_rooms: number;
  confirmed_reservations: number;
  blocked_rooms: number;
  occupancy_percentage: number;
  source: "live" | "stored";
};

const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "checkedin",
  "blocked",
  "preregistration",
]);

function dateOnly(value: string | Date): string {
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  return String(value).slice(0, 10);
}

function coversDate(checkin: string, checkout: string, day: string): boolean {
  return dateOnly(checkin) <= day && dateOnly(checkout) > day;
}

/**
 * Calcula inventário ARI a partir dos quartos da categoria + reservas do período.
 * Usado quando rate_inventory está zerado/stale (não depende só do RPC/sync).
 */
export function computeCategoryDayInventory(params: {
  rooms: Array<{ id: string; is_blocked?: boolean | null; is_active?: boolean | null }>;
  reservations: AriReservationLite[];
  categoryId: string;
  date: string | Date;
}): AriLiveInventory {
  const day = dateOnly(params.date);
  const roomIds = new Set(
    (params.rooms || [])
      .filter((r) => r.is_active !== false && r.is_blocked !== true)
      .map((r) => r.id),
  );
  const totalRooms = roomIds.size;

  const dayReservations = (params.reservations || []).filter(
    (res) =>
      ACTIVE_STATUSES.has(String(res.status || "")) &&
      coversDate(res.checkin_date, res.checkout_date, day),
  );

  const occupiedRoomIds = new Set<string>();
  let unassigned = 0;

  for (const res of dayReservations) {
    if (res.room_id && roomIds.has(res.room_id)) {
      occupiedRoomIds.add(res.room_id);
      continue;
    }
    // Sem quarto: só conta se a reserva aponta para esta categoria
    if (!res.room_id && res.category_id && String(res.category_id) === String(params.categoryId)) {
      unassigned += 1;
    }
  }

  const unavailable = occupiedRoomIds.size;
  const available = Math.max(0, totalRooms - unavailable - unassigned);
  const confirmed = unavailable + unassigned;
  const occupancy =
    totalRooms > 0 ? Math.round(((unavailable + unassigned) / totalRooms) * 100) : 0;

  return {
    total_rooms: totalRooms,
    available_rooms: available,
    confirmed_reservations: confirmed,
    blocked_rooms: 0,
    occupancy_percentage: occupancy,
    source: "live",
  };
}

/** Preferir inventário live quando o stored parece inválido (tudo zero com quartos físicos). */
export function mergeInventoryPreferLive(
  stored: {
    total_rooms?: number;
    available_rooms?: number;
    confirmed_reservations?: number;
    blocked_rooms?: number;
    occupancy_percentage?: number;
  } | null | undefined,
  live: AriLiveInventory,
  physicalRoomCount: number,
): AriLiveInventory {
  const storedTotal = Number(stored?.total_rooms || 0);
  const storedAvailable = Number(stored?.available_rooms || 0);
  const storedConfirmed = Number(stored?.confirmed_reservations || 0);
  const looksEmpty =
    storedTotal === 0 &&
    storedAvailable === 0 &&
    storedConfirmed === 0 &&
    physicalRoomCount > 0;

  if (!stored || looksEmpty) {
    return live;
  }

  // Stored com total, mas ocupação zerada enquanto live mostra reservas → preferir live
  if (storedTotal > 0 && storedConfirmed === 0 && live.confirmed_reservations > 0) {
    return live;
  }

  return {
    total_rooms: storedTotal,
    available_rooms: storedAvailable,
    confirmed_reservations: storedConfirmed,
    blocked_rooms: Number(stored?.blocked_rooms || 0),
    occupancy_percentage: Number(stored?.occupancy_percentage || 0),
    source: "stored",
  };
}
