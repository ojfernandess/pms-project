import type { RoomOccupancyData, RoomOccupancyStatus } from "@/hooks/useOccupancyMap";

const OCCUPIED_STATUSES: RoomOccupancyStatus[] = ["occupied", "last_day", "reserved"];

export interface OccupancyDashboardStats {
  total: number;
  occupied: number;
  available: number;
  maintenance: number;
  blocked: number;
  dirty: number;
  other: number;
  occupiedPct: number;
  availablePct: number;
  maintenancePct: number;
  blockedPct: number;
  occupancyRatePct: number;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

/** Estatísticas para o dashboard de ocupação (mesma base da taxa_operacional do mapa). */
export function computeOccupancyDashboardStats(rooms: RoomOccupancyData[]): OccupancyDashboardStats {
  const total = rooms.length;
  const occupied = rooms.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length;
  const available = rooms.filter((r) => r.status === "available").length;
  const maintenance = rooms.filter((r) => r.status === "maintenance").length;
  const blocked = rooms.filter((r) => r.status === "blocked").length;
  const dirty = rooms.filter((r) => r.status === "dirty" || r.status === "dirty_priority").length;
  const accounted = occupied + available + maintenance + blocked + dirty;
  const other = Math.max(0, total - accounted);

  return {
    total,
    occupied,
    available,
    maintenance,
    blocked,
    dirty,
    other,
    occupiedPct: pct(occupied, total),
    availablePct: pct(available, total),
    maintenancePct: pct(maintenance, total),
    blockedPct: pct(blocked, total),
    occupancyRatePct: pct(occupied, total),
  };
}