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

/** Insere ou mescla reserva no topo das listas em cache (criação / efetivação). */
export function upsertReservationInQueryCache<T extends { id: string }>(
  queryClient: QueryClient,
  reservation: T,
): void {
  queryClient.setQueriesData({ queryKey: ["reservations"] }, (old: unknown) => {
    if (!Array.isArray(old)) return old;
    const list = old as T[];
    const idx = list.findIndex((r) => r.id === reservation.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = { ...next[idx], ...reservation };
      return next;
    }
    return [reservation, ...list];
  });
}

/** Patch + invalidação leve (mapa atualiza sem refetch forçado). */
export function applyReservationMapDelta(
  queryClient: QueryClient,
  patch: ReservationPatch,
  extraInvalidations?: string[][],
): void {
  patchReservationsInQueryCache(queryClient, [patch]);
  invalidateReservationViews(queryClient, extraInvalidations);
}

/** Invalida caches do mapa/lista — refetch só em queries ativas (evita duplo round-trip). */
export function invalidateReservationViews(queryClient: QueryClient, extraKeys?: string[][]): void {
  queryClient.invalidateQueries({ queryKey: ["reservations"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["rooms"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"], refetchType: "active" });
  for (const key of extraKeys ?? []) {
    queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
  }
}

export async function refreshReservationQueries(queryClient: QueryClient): Promise<void> {
  invalidateReservationViews(queryClient, [["payments"], ["reservation_payments"]]);
}