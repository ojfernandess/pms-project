import { supabase } from "@/integrations/supabase/client";

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
  syncHints?: {
    hotelCode?: string;
    establishmentId?: string;
    rateCalendarRows?: number;
    roomCodesSent?: string[];
    rateplanCodesSent?: string[];
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
