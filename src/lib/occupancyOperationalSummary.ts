import type { OccupancyOperationalSummary, RoomOccupancyData } from "@/hooks/useOccupancyMap";

export function emptyOccupancyOperationalSummary(): OccupancyOperationalSummary {
  return {
    total_rooms: 0,
    saídas_hoje: 0,
    entradas_hoje: 0,
    stayovers: 0,
    disponíveis: 0,
    sujo: 0,
    manutenção: 0,
    bloqueados: 0,
    taxa_ocupacao_real: 0,
  };
}

/** Resumo operacional do dia (taxa de ocupação e contadores). */
export function computeOccupancyOperationalSummary(
  processedRooms: RoomOccupancyData[],
): OccupancyOperationalSummary {
  const total = processedRooms.length;
  const occupiedForRate = processedRooms.filter(
    (r) => r.status === "occupied" || r.status === "last_day" || r.status === "reserved",
  ).length;

  return {
    total_rooms: total,
    saídas_hoje: processedRooms.filter(
      (r) => r.reservation_operational_type === "checkout_today" || r.status === "last_day",
    ).length,
    entradas_hoje: processedRooms.filter(
      (r) =>
        r.reservation_operational_type === "checkin_today" || r.reservation_operational_type === "day_use",
    ).length,
    stayovers: processedRooms.filter((r) => r.reservation_operational_type === "stayover").length,
    disponíveis: processedRooms.filter((r) => r.status === "available").length,
    sujo: processedRooms.filter((r) => r.status === "dirty" || r.status === "dirty_priority").length,
    manutenção: processedRooms.filter((r) => r.status === "maintenance").length,
    bloqueados: processedRooms.filter((r) => r.status === "blocked").length,
    taxa_ocupacao_real: total > 0 ? Math.round((occupiedForRate / total) * 100) : 0,
  };
}