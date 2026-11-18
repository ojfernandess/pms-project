import { addDays, format, isWithinInterval, parseISO, startOfDay } from "date-fns";

export const ACTIVE_MAINTENANCE_STATUSES = new Set(["open", "in_progress"]);

export type MaintenanceTicketPeriodFields = {
  id?: string;
  room_id?: string;
  reservation_id?: string | null;
  status?: string | null;
  blocks_entire_room?: boolean | null;
  maintenance_start_date?: string | null;
  maintenance_end_date?: string | null;
  opened_at?: string | null;
  reported_at?: string | null;
  completed_at?: string | null;
  resolved_at?: string | null;
  guest_account_id?: string | null;
  title?: string | null;
  description?: string | null;
};

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Intervalo inclusivo no calendário (check-out exclusivo no dia após `end`). */
export function resolveMaintenancePeriod(
  ticket: MaintenanceTicketPeriodFields,
): { start: string; endInclusive: string; checkoutExclusive: string } | null {
  const status = String(ticket.status || "").toLowerCase();
  if (status === "cancelled") return null;

  const start =
    toDateOnly(ticket.maintenance_start_date) ||
    toDateOnly(ticket.opened_at) ||
    toDateOnly(ticket.reported_at);
  if (!start) return null;

  let endInclusive: string | null = toDateOnly(ticket.maintenance_end_date);
  if (!endInclusive) {
    if (status === "completed") {
      endInclusive = toDateOnly(ticket.completed_at) || toDateOnly(ticket.resolved_at);
    } else if (ACTIVE_MAINTENANCE_STATUSES.has(status)) {
      endInclusive = format(addDays(new Date(), 90), "yyyy-MM-dd");
    }
  }
  if (!endInclusive || endInclusive < start) return null;

  const checkoutExclusive = format(addDays(parseISO(endInclusive), 1), "yyyy-MM-dd");
  return { start, endInclusive, checkoutExclusive };
}

export function isMaintenanceTicketActive(ticket: MaintenanceTicketPeriodFields): boolean {
  return ACTIVE_MAINTENANCE_STATUSES.has(String(ticket.status || "").toLowerCase());
}

/** Noite/dia ocupa período de manutenção (meia-noite a meia-noite, checkout exclusivo). */
export function isDateInMaintenancePeriod(date: Date, ticket: MaintenanceTicketPeriodFields): boolean {
  const period = resolveMaintenancePeriod(ticket);
  if (!period) return false;
  const day = startOfDay(date);
  const rangeStart = startOfDay(parseISO(period.start));
  const rangeEnd = startOfDay(parseISO(period.checkoutExclusive));
  if (rangeEnd <= rangeStart) return false;
  return isWithinInterval(day, { start: rangeStart, end: addDays(rangeEnd, -1) });
}

export function roomHasWholeRoomMaintenance(
  room: { status?: string | null; is_blocked?: boolean | null },
  tickets: MaintenanceTicketPeriodFields[],
  roomId: string,
): boolean {
  if (room.is_blocked) return true;
  const active = tickets.filter((t) => t.room_id === roomId && isMaintenanceTicketActive(t));
  if (active.some((t) => t.blocks_entire_room)) return true;
  if (active.length > 0) return false;
  return room.status === "maintenance";
}

export function reservationHasActiveMaintenance(
  reservationId: string,
  tickets: MaintenanceTicketPeriodFields[],
): boolean {
  return tickets.some(
    (t) =>
      t.reservation_id === reservationId &&
      isMaintenanceTicketActive(t) &&
      !t.blocks_entire_room,
  );
}

export function isRoomDateBlockedByMaintenancePeriod(
  date: Date,
  roomId: string,
  tickets: MaintenanceTicketPeriodFields[],
): boolean {
  return tickets.some((t) => {
    if (t.room_id !== roomId || !isMaintenanceTicketActive(t) || t.blocks_entire_room) return false;
    return isDateInMaintenancePeriod(date, t);
  });
}