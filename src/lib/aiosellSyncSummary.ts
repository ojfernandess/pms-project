import type { AiosellSyncPayload } from "./aiosellSyncInvoke";

/**
 * Resumo dos pares (Room Code + Rate Plan Code) enviados no POST de tarifas à Aiosell
 * (update-rates), conforme payload final após merge — alinhado à API PMS→CM (rates[] por linha).
 */
export function formatAiosellSyncTariffSummary(payload: AiosellSyncPayload): string {
  const pairs = payload.syncedRatePairs ?? [];
  const n = payload.syncedRatePairsCount ?? pairs.length;
  if (n === 0 || pairs.length === 0) {
    return "Nenhum par room+rate plan no payload de tarifas (update-rates).";
  }
  const lines = pairs.map((p) => `${p.roomCode} → ${p.rateplanCode}`);
  return [`${n} par(es) único(s) (tarifas):`, ...lines].join("\n");
}

/** Objeto para consola / depuração após sincronizar. */
export function getAiosellSyncMappingDebug(payload: AiosellSyncPayload): Record<string, unknown> {
  return {
    syncedRatePairsCount: payload.syncedRatePairsCount ?? payload.syncedRatePairs?.length,
    syncedRatePairs: payload.syncedRatePairs,
    inventoryRoomCodesSent: payload.inventoryRoomCodesSent,
    roomCodesSent: payload.syncHints?.roomCodesSent,
    rateplanCodesSent: payload.syncHints?.rateplanCodesSent,
    mappingSemanticsWarning: payload.syncHints?.mappingSemanticsWarning ?? null,
    aiosellListRateOccupancy: payload.syncHints?.aiosellListRateOccupancy ?? null,
  };
}
