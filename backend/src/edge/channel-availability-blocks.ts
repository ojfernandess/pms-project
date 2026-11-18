/**
 * Ocupação por quarto/categoria/data para envio de availability a OTAs (Channex, Bukly, Aiosell, ARI).
 * Inclui reservas (incl. bloqueios normais) e manutenção por período; interdição via is_blocked no inventário base.
 */

export type ChannelRoomRow = {
  id: string;
  category_id: string | null;
  is_blocked?: boolean | null;
};

export type ChannelReservationRow = {
  id?: string;
  category_id: string | null;
  room_id: string | null;
  checkin_date: Date | string;
  checkout_date: Date | string;
  status: string | null;
};

export type ChannelMaintenanceTicketRow = {
  room_id: string;
  maintenance_start_date?: Date | string | null;
  maintenance_end_date?: Date | string | null;
  opened_at?: Date | string | null;
  status?: string | null;
};

const INACTIVE_RESERVATION = new Set(["cancelled", "canceled", "checkedout", "checked_out"]);
const ACTIVE_MAINTENANCE = new Set(["open", "in_progress"]);

function ymdDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function addDaysYmd(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resolveMaintenancePeriodForChannel(
  ticket: ChannelMaintenanceTicketRow,
  capEndInclusive: string,
): { start: string; endInclusive: string } | null {
  const status = String(ticket.status ?? "").toLowerCase();
  if (!ACTIVE_MAINTENANCE.has(status)) return null;
  const start = ymdDateOnly(ticket.maintenance_start_date) || ymdDateOnly(ticket.opened_at);
  if (!start) return null;
  let endInclusive = ymdDateOnly(ticket.maintenance_end_date);
  if (!endInclusive) endInclusive = capEndInclusive;
  if (endInclusive < start) return null;
  if (endInclusive > capEndInclusive) endInclusive = capEndInclusive;
  return { start, endInclusive };
}

export function categoryDateKey(categoryId: string, date: string, separator: string): string {
  return `${categoryId}${separator}${date}`;
}

/** Quartos vendáveis por categoria (exclui apenas interdição permanente is_blocked). */
export function baseSellableRoomsByCategory(rooms: ChannelRoomRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const room of rooms) {
    if (room.is_blocked === true) continue;
    const categoryId = String(room.category_id ?? "").trim();
    if (!categoryId) continue;
    map.set(categoryId, (map.get(categoryId) ?? 0) + 1);
  }
  return map;
}

/**
 * Conjunto de chaves de quarto ocupadas por categoria e data (noites vendáveis).
 * Reservas ativas (incl. `blocked`) e chamados de manutenção no período.
 * Quartos com `is_blocked` ficam fora do inventário vendável (baseSellableRoomsByCategory).
 */
export function buildOccupiedRoomsByCategoryDate(params: {
  rooms: ChannelRoomRow[];
  reservations: ChannelReservationRow[];
  maintenanceTickets: ChannelMaintenanceTicketRow[];
  windowStart: string;
  windowEndInclusive: string;
  keySeparator?: string;
}): Map<string, Set<string>> {
  const {
    rooms,
    reservations,
    maintenanceTickets,
    windowStart,
    windowEndInclusive,
    keySeparator = "::",
  } = params;

  const roomCategory = new Map<string, string>();
  for (const room of rooms) {
    const id = String(room.id).trim();
    const cat = String(room.category_id ?? "").trim();
    if (id && cat) roomCategory.set(id, cat);
  }

  const map = new Map<string, Set<string>>();

  const touch = (categoryId: string, date: string, roomKey: string) => {
    const key = categoryDateKey(categoryId, date, keySeparator);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(roomKey);
  };

  for (const reservation of reservations) {
    const status = String(reservation.status ?? "").toLowerCase();
    if (INACTIVE_RESERVATION.has(status)) continue;

    const roomId = String(reservation.room_id ?? "").trim();
    const fallbackCategory = String(reservation.category_id ?? "").trim();
    const categoryId = roomId ? (roomCategory.get(roomId) ?? fallbackCategory) : fallbackCategory;
    if (!categoryId) continue;

    const checkin = ymdDateOnly(reservation.checkin_date);
    const checkout = ymdDateOnly(reservation.checkout_date);
    if (!checkin || !checkout || checkout <= checkin) continue;

    const lastNight = addDaysYmd(checkout, -1);
    let day = checkin < windowStart ? windowStart : checkin;
    const endNight = lastNight > windowEndInclusive ? windowEndInclusive : lastNight;

    const roomKey = roomId || `res:${reservation.id ?? `${categoryId}:${checkin}:${checkout}`}`;

    while (day <= endNight) {
      touch(categoryId, day, roomKey);
      day = addDaysYmd(day, 1);
    }
  }

  for (const ticket of maintenanceTickets) {
    const period = resolveMaintenancePeriodForChannel(ticket, windowEndInclusive);
    if (!period) continue;
    const roomId = String(ticket.room_id).trim();
    const categoryId = roomCategory.get(roomId);
    if (!categoryId || !roomId) continue;

    let day = period.start < windowStart ? windowStart : period.start;
    while (day <= period.endInclusive && day <= windowEndInclusive) {
      touch(categoryId, day, roomId);
      day = addDaysYmd(day, 1);
    }
  }

  return map;
}

export function bookedCountFromOccupiedMap(
  occupied: Map<string, Set<string>>,
  categoryId: string,
  date: string,
  keySeparator = "::",
): number {
  return occupied.get(categoryDateKey(categoryId, date, keySeparator))?.size ?? 0;
}