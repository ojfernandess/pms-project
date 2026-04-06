import { supabase } from "@/integrations/supabase/client";

export type AiosellSyncedRatePair = { roomCode: string; rateplanCode: string };

export type AiosellSyncPayload = {
  success?: boolean;
  error?: string;
  details?: string[];
  /** Blocos de inventário (disponibilidade + restrições no mesmo POST). */
  inventoryCombinedBlocks?: number;
  /** @deprecated resposta antiga — mantido para compat. */
  inventoryAvailBlocks?: number;
  inventoryRestrictionBlocks?: number;
  rateRows?: number;
  rateUpdateBlocks?: number;
  rateRestrictionBlocks?: number;
  ratesIncludeRestrictionsPerLine?: boolean;
  aiosellApiMessages?: string[];
  /** Pares únicos no JSON de tarifas enviado à Aiosell (update-rates). */
  syncedRatePairs?: AiosellSyncedRatePair[];
  syncedRatePairsCount?: number;
  /** roomCode únicos no POST de inventário. */
  inventoryRoomCodesSent?: string[];
  syncHints?: {
    hotelCode?: string;
    establishmentId?: string;
    rateCalendarRows?: number;
    rateCalendarRowsAll?: number;
    skippedUnmappedPairCount?: number;
    skippedUnmappedPairDetails?: string[];
    roomCodesSent?: string[];
    rateplanCodesSent?: string[];
    /** Heurística: possível troca roomCode/rateplanCode (ver doc Aiosell). */
    mappingSemanticsWarning?: string | null;
    /** Coluna x1–x4 do ARI usada no preço enviado (1–4). */
    aiosellListRateOccupancy?: number;
    /** `list_column_only` (predefinido) ou `infer_from_rateplan_code` (secret `AIOSELL_RATE_OCCUPANCY_MODE=infer`). */
    aiosellRateOccupancyMode?: "list_column_only" | "infer_from_rateplan_code";
    /** Linhas do POST com `fixed_price` em Tarifas por canal (substituem o tarifário). */
    channelPricingFixedPriceLineCount?: number;
    /** Linhas de calendário com `price_multiplier` ≠ 1 (≠ tarifário direto). */
    channelPricingMultiplierLineCount?: number;
    /** Path de tarifas com «sample-pms» (doc/sandbox) — o painel de produção pode não atualizar. */
    aiosellSamplePmsPathRates?: boolean;
    aiosellSamplePmsPathInventory?: boolean;
    aiosellRatePostMessage?: string | null;
    /** API só confirmou receção — o painel CM pode atualizar mais tarde. */
    aiosellRatePostAckOnly?: boolean;
    /** Quantidade de pedidos HTTP de tarifas (lotes). */
    aiosellRatesPostRequests?: number;
    /** Tamanho do lote em blocos `updates` (env AIOSELL_RATES_UPDATE_CHUNK_SIZE). */
    aiosellRatesUpdateChunkSizeUsed?: number;
  };
  ratePriceDiagnostics?: {
    derivedPricesRecomputed?: number;
    /** Planos base+flutuação em que se usou o `base_price` persistido (alinhado à grelha ARI). */
    derivedTrustCalendarRows?: number;
    linesWithSentRateZeroOrOne?: number;
    samples?: unknown[];
    channelPricingFixedPriceLineCount?: number;
    channelPricingMultiplierLineCount?: number;
    logsHint?: string;
  };
  channel?: unknown;
};

/**
 * Chama a Edge Function `aiosell-sync` (mesma lógica do botão «Sincronizar» no Channel Manager).
 * Lança Error se a sincronização falhar.
 */
export async function invokeAiosellSync(
  channelId: string,
  establishmentId: string
): Promise<AiosellSyncPayload> {
  const { data, error, response } = await supabase.functions.invoke("aiosell-sync", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
    },
  });

  let payload = data as AiosellSyncPayload | null;

  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") {
        payload = parsed as AiosellSyncPayload;
      }
    } catch {
      /* ignore */
    }
  }

  const errMsg =
    payload?.error || (error as { message?: string } | null)?.message || null;

  const detailsBlock =
    payload?.details?.length && payload.details.length > 0
      ? "\n\n" + payload.details.slice(0, 12).join("\n")
      : "";

  const fail = (base: string) => {
    throw new Error((errMsg || base) + detailsBlock);
  };

  if (payload?.success === false) {
    fail("Falha na sincronização Aiosell");
  }
  if (error) {
    fail("Erro ao chamar sincronização Aiosell");
  }
  if (!payload?.success) {
    fail("Resposta inválida do servidor ao sincronizar Aiosell");
  }

  return payload;
}
