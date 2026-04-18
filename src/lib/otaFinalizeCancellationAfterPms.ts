import { supabase } from "@/integrations/supabase/client";
import {
  invokeChannexFinalizeCancellationRevision,
  type ChannexReservationsSyncPayload,
} from "@/lib/channexReservationsSyncInvoke";
import { invokeAiosellFinalizeCancellationRevision } from "@/lib/aiosellRevisionApplyInvoke";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Só estes casos beneficiam de retry (corrida: finalize antes do UPDATE reservations ficar visível ao service role). */
function isTransientFinalizeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("pending_reservation_not_cancelled") ||
    msg.includes("ainda não está cancelada no PMS")
  );
}

async function invokeChannexFinalizeWithRetry(
  channelId: string,
  establishmentId: string,
  revisionId: string,
): Promise<void> {
  const maxAttempts = 6;
  await sleep(350);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(550);
    try {
      const r: ChannexReservationsSyncPayload = await invokeChannexFinalizeCancellationRevision(
        channelId,
        establishmentId,
        revisionId,
      );
      if (r.finalized || r.already_processed) return;
      if (r.skipped) return;
      if (r.retry) {
        if (attempt === maxAttempts - 1) {
          console.warn(
            "Finalize Channex: cancelamento ainda não visível ao servidor após várias tentativas. Use Pendências ou o próximo sync.",
          );
          return;
        }
        continue;
      }
      return;
    } catch (e) {
      if (!isTransientFinalizeError(e) || attempt === maxAttempts - 1) throw e;
    }
  }
}

async function invokeAiosellFinalizeWithRetry(establishmentId: string, revisionId: string): Promise<void> {
  const maxAttempts = 6;
  let lastErr: unknown;
  await sleep(350);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(550);
    try {
      await invokeAiosellFinalizeCancellationRevision(establishmentId, revisionId);
      return;
    } catch (e) {
      lastErr = e;
      if (!isTransientFinalizeError(e) || attempt === maxAttempts - 1) throw e;
    }
  }
  throw lastErr;
}

/**
 * Após cancelar no PMS (mapa, lista ou detalhes), espelha o fluxo de Pendências:
 * finaliza revisão Channex/Aiosell em `channex_booking_revisions` (OTA + ACK), quando existir.
 * Sem isto, o mapa pode parecer “preso” ou o canal pode reprocessar estado antigo.
 */
export async function maybeFinalizeOtaCancellationAfterPmsCancel(reservationId: string): Promise<void> {
  const rid = String(reservationId ?? "").trim();
  if (!rid) return;

  const { data: revs, error } = await supabase
    .from("channex_booking_revisions" as never)
    .select("revision_id, ota_channel_id, establishment_id")
    .eq("reservation_id", rid)
    .eq("status", "cancelled")
    .in("process_status", ["pending", "failed"])
    .order("updated_at", { ascending: false })
    .limit(3);

  if (error) {
    console.warn("maybeFinalizeOtaCancellationAfterPmsCancel: leitura revisões", error.message);
    return;
  }

  const seen = new Set<string>();
  for (const row of revs ?? []) {
    const revisionId = String((row as { revision_id?: string }).revision_id ?? "").trim();
    const otaChannelId = String((row as { ota_channel_id?: string }).ota_channel_id ?? "").trim();
    const establishmentId = String((row as { establishment_id?: string }).establishment_id ?? "").trim();
    if (!revisionId || !otaChannelId || !establishmentId) continue;
    if (seen.has(revisionId)) continue;
    seen.add(revisionId);

    const { data: ch, error: chErr } = await supabase
      .from("ota_channels" as never)
      .select("channel_manager_type")
      .eq("id", otaChannelId)
      .maybeSingle();

    if (chErr) {
      console.warn("maybeFinalizeOtaCancellationAfterPmsCancel: canal", chErr.message);
      continue;
    }

    const cm = String((ch as { channel_manager_type?: string } | null)?.channel_manager_type ?? "").toLowerCase();

    if (cm === "channex") {
      await invokeChannexFinalizeWithRetry(otaChannelId, establishmentId, revisionId);
    } else if (cm === "aiosell") {
      await invokeAiosellFinalizeWithRetry(establishmentId, revisionId);
    }
  }
}
