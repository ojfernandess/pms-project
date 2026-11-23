import type { RoomOccupancyData } from "@/hooks/useOccupancyMap";
import { PARKING_CATEGORY_KIND } from "@/lib/parkingFeeConfig";

export function isParkingOccupancyUnit(
  room: Pick<RoomOccupancyData, "category_kind" | "category_name">,
): boolean {
  if (room.category_kind === PARKING_CATEGORY_KIND) return true;
  const name = String(room.category_name || "").toLowerCase();
  if (name.includes("estacionamento") || name.includes("vaga") || name.includes("garagem")) {
    return true;
  }
  return false;
}

export function filterRoomsForOccupancyMetrics(
  rooms: RoomOccupancyData[],
  includeParking: boolean,
): RoomOccupancyData[] {
  if (includeParking) return rooms;
  return rooms.filter((r) => !isParkingOccupancyUnit(r));
}

const STORAGE_PREFIX = "occupancy_map_include_parking_";

export function readIncludeParkingInOccupancyMetrics(establishmentId: string | null | undefined): boolean {
  if (!establishmentId) return false;
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${establishmentId}`) === "1";
  } catch {
    return false;
  }
}

export function writeIncludeParkingInOccupancyMetrics(
  establishmentId: string | null | undefined,
  include: boolean,
): void {
  if (!establishmentId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${establishmentId}`, include ? "1" : "0");
  } catch {
    /* ignore */
  }
}