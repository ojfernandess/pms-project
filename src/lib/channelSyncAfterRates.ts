import { supabase } from "@/integrations/supabase/client";
import { invokeAiosellSync } from "@/lib/aiosellSyncInvoke";
import { invokeBuklySync } from "@/lib/buklySyncInvoke";
import { invokeChannexSync } from "@/lib/channexSyncInvoke";
import { dispatchInvalidateChannelQueries } from "@/lib/channelQueriesInvalidation";
import { toast } from "sonner";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Edições em lote: agrupa várias alterações num único envio. */
const DEBOUNCE_MS = 1200;
/** Após upsert de muitas linhas do `rate_calendar` — um pouco mais curto para o CM seguir logo o lote gravado. */
const BULK_CALENDAR_DEBOUNCE_MS = 650;

/**
 * Agenda sincronização com Channel Managers (Aiosell/Bukly/Channex) após alteração ao tarifário ou ARI.
 * Inclui: `rate_calendar`, planos, regras dinâmicas, restrições, ARI (`rate_sales_status` / inventário),
 * definições do sistema tarifário, preço base de categorias, etc.
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

/**
 * Envia já para o CM (sem esperar o debounce). Use após gravar **uma** linha do `rate_calendar`
 * (ex.: uma célula no calendário/ARI). Várias linhas de uma vez: `flushChannelSyncAfterBulkCalendarSave`.
 */
export function flushChannelSyncNow(establishmentId: string | null | undefined): void {
  if (!establishmentId) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void runAutoChannelSync(establishmentId);
}

/**
 * Após gravar várias linhas do `rate_calendar` de uma vez (edição em massa / colar / ajuste em lote).
 * Debounce mais curto que `scheduleChannelSyncAfterRateEdit` para um único envio ao CM logo após o commit.
 */
export function flushChannelSyncAfterBulkCalendarSave(
  establishmentId: string | null | undefined
): void {
  if (!establishmentId) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoChannelSync(establishmentId);
  }, BULK_CALENDAR_DEBOUNCE_MS);
}

/** Reservas (criar, alterar datas/quarto, cancelar, in/out) — mesmo debounce e envio ao CM. */
export function scheduleChannelSyncAfterInventoryChange(
  establishmentId: string | null | undefined
): void {
  scheduleChannelSyncAfterRateEdit(establishmentId);
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
      (c.channel_manager_type === "bukly" ||
        c.channel_manager_type === "aiosell" ||
        c.channel_manager_type === "channex")
  );

  if (list.length === 0) return;

  for (const ch of list) {
    try {
      if (ch.channel_manager_type === "aiosell") {
        const payload = await invokeAiosellSync(ch.id, establishmentId);
        const n = payload.syncHints?.skippedUnmappedPairCount ?? 0;
        if (n > 0) {
          const samples = payload.syncHints?.skippedUnmappedPairDetails?.slice(0, 3) ?? [];
          const extra =
            n > samples.length ? ` (+${n - samples.length} combinações)` : "";
          const line =
            samples.length > 0
              ? samples.join("\n")
              : "Sem Room/Rate Plan em Tarifas por canal.";
          toast.warning("Canal: parte do tarifário não foi enviada (sem mapeamento Aiosell).", {
            description: line + extra,
            duration: 14_000,
          });
        }
        const fixedN = payload.syncHints?.channelPricingFixedPriceLineCount ?? 0;
        const multN = payload.syncHints?.channelPricingMultiplierLineCount ?? 0;
        if (fixedN > 0) {
          toast.warning(
            "Canal Aiosell: preço fixo em «Tarifas por canal» substitui o tarifário.",
            {
              description: `${fixedN} linha(s) enviadas com fixed_price — o painel CM não mostra só as alterações do calendário. Remova ou atualize o preço fixo em Tarifas por canal ou ajuste o multiplicador.`,
              duration: 16_000,
            }
          );
        } else if (multN > 0) {
          toast.info("Canal Aiosell: multiplicador em Tarifas por canal", {
            description: `${multN} linha(s): o valor enviado é tarifário × price_multiplier (não só a célula editada).`,
            duration: 12_000,
          });
        }
        if (payload.syncHints?.aiosellSamplePmsPathRates === true) {
          toast.warning("Canal Aiosell: path de tarifas em modo «sample-pms»", {
            description:
              "O endpoint configurado é o da documentação (sandbox). A API pode aceitar o envio mas o painel do hotel em produção pode não mudar. No canal Aiosell, substitua o «Path de tarifas» pelo endpoint de produção que a Aiosell indicar (não use …/sample-pms em produção).",
            duration: 20_000,
          });
        }
        if (payload.syncHints?.aiosellRatePostAckOnly === true) {
          toast.warning("Aiosell: tarifário enviado — o CM pode ainda mostrar valores antigos", {
            description:
              "A resposta da API só confirma receção do pedido, não que o painel do Channel Manager já reflete as alterações. Se continuar desatualizado, confirme com o suporte Aiosell.",
            duration: 12_000,
          });
        }
      } else if (ch.channel_manager_type === "bukly") {
        await invokeBuklySync(ch.id, establishmentId, { silent: true });
      } else if (ch.channel_manager_type === "channex") {
        await invokeChannexSync(ch.id, establishmentId);
      }
    } catch (e) {
      console.warn("[channelSyncAfterRates] Sincronização automática falhou:", ch.id, e);
    }
  }

  dispatchInvalidateChannelQueries();
}
