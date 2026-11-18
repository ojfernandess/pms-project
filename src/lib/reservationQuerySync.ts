import type { QueryClient } from "@tanstack/react-query";

export type ReservationPatch = {
  id: string;
  patch: Record<string, unknown>;
};

function applyPatchesToList<T extends { id: string }>(
  list: T[],
  patchById: Map<string, Record<string, unknown>>,
): T[] {
  let changed = false;
  const next = list.map((row) => {
    const patch = patchById.get(row.id);
    if (!patch) return row;
    changed = true;
    return { ...row, ...patch } as T;
  });
  return changed ? next : list;
}

/** Atualiza reservas já em cache (mapa/lista) antes do refetch — UI reage na hora. */
export function patchReservationsInQueryCache(queryClient: QueryClient, patches: ReservationPatch[]): void {
  if (patches.length === 0) return;
  const patchById = new Map(patches.map((p) => [p.id, p.patch]));

  queryClient.setQueriesData({ queryKey: ["reservations"] }, (old: unknown) => {
    if (!old) return old;
    if (Array.isArray(old)) {
      return applyPatchesToList(old as { id: string }[], patchById);
    }
    return old;
  });
}

export async function refreshReservationQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["reservations"], refetchType: "active" });
  await queryClient.refetchQueries({ queryKey: ["reservations"], type: "active" });
  queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
  queryClient.invalidateQueries({ queryKey: ["payments"] });
  queryClient.invalidateQueries({ queryKey: ["reservation_payments"] });
}