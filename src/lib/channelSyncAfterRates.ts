import { supabase } from "@/integrations/supabase/client";
import { invokeAiosellSync } from "@/lib/aiosellSyncInvoke";
import { invokeBuklySync } from "@/lib/buklySyncInvoke";
import { dispatchInvalidateChannelQueries } from "@/lib/channelQueriesInvalidation";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000;

/**
 * Agenda sincronização com Channel Managers (Aiosell/Bukly) após alteração ao tarifário ou ARI.
 * Inclui: `rate_calendar`, status de venda (`rate_sales_status`), inventário ARI manual, etc.
 * Agrupa várias edições seguidas num único envio após {DEBOUNCE_MS} ms.
 * Só corre se o canal tiver `sync_enabled` e for channel manager ativo.
 */
export function scheduleChannelSyncAfterRateEdit(establishmentId: string | null | undefined): void {
  if (!establishmentId) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoChannelSync(establishmentId);
  }, DEBOUNCE_MS);
}

async function runAutoChannelSync(establishmentId: string): Promise<void> {
  const { data: channels, error } = await supabase
    .from("ota_channels")
    .select("id, channel_type, channel_manager_type, sync_enabled, is_active")
    .eq("establishment_id", establishmentId);

  if (error || !channels?.length) return;

  const list = channels.filter(
    (c) =>
      c.is_active !== false &&
      c.sync_enabled === true &&
      c.channel_type === "channel_manager" &&
      (c.channel_manager_type === "bukly" || c.channel_manager_type === "aiosell")
  );

  if (list.length === 0) return;

  for (const ch of list) {
    try {
      if (ch.channel_manager_type === "aiosell") {
        await invokeAiosellSync(ch.id, establishmentId);
      } else if (ch.channel_manager_type === "bukly") {
        await invokeBuklySync(ch.id, establishmentId, { silent: true });
      }
    } catch (e) {
      console.warn("[channelSyncAfterRates] Sincronização automática falhou:", ch.id, e);
    }
  }

  dispatchInvalidateChannelQueries();
}
