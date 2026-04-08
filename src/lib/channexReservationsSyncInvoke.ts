import { supabase } from "@/integrations/supabase/client";

export type ChannexReservationsSyncPayload = {
  success?: boolean;
  error?: string;
  hint?: string;
  processed?: number;
  created?: number;
  modified?: number;
  cancelled?: number;
  failed?: number;
  finalized?: boolean;
};

export function validateChannexChannelForReservationsPull(channel: {
  channel_manager_type?: string | null;
  channex_api_key?: string | null;
  channex_property_id?: string | null;
} | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!channel || channel.channel_manager_type !== "channex") {
    return { ok: false, message: "Canal Channex não encontrado." };
  }
  const missing: string[] = [];
  if (!String(channel.channex_api_key ?? "").trim()) missing.push("API key");
  if (!String(channel.channex_property_id ?? "").trim()) missing.push("Property ID");
  if (missing.length) {
    return { ok: false, message: `Preencha no canal: ${missing.join(", ")}.` };
  }
  return { ok: true };
}

export async function invokeChannexReservationsSync(
  channelId: string,
  establishmentId: string,
  opts?: {
    revisionId?: string;
    bookingId?: string;
    bookingUniqueId?: string;
    forceReprocess?: boolean;
    autoApplyLifecycle?: boolean;
    /** Alinha filtros ao lifecycle (ex.: aceitar cancelamento na UI). */
    sourceEvent?: "booking_modification" | "booking_cancellation" | "booking" | "booking_new";
  }
): Promise<ChannexReservationsSyncPayload> {
  const { data, error, response } = await supabase.functions.invoke("channex-reservations-sync", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
      revision_id: opts?.revisionId,
      booking_id: opts?.bookingId,
      booking_unique_id: opts?.bookingUniqueId,
      force_reprocess: opts?.forceReprocess === true,
      auto_apply_lifecycle: opts?.autoApplyLifecycle === true,
      source_event: opts?.sourceEvent,
    },
  });

  let payload = data as ChannexReservationsSyncPayload | null;
  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") payload = parsed as ChannexReservationsSyncPayload;
    } catch {
      // ignore
    }
  }

  const errMsg = payload?.error || (error as { message?: string } | null)?.message || null;
  const hint = payload?.hint;
  const combined = [errMsg, hint].filter(Boolean).join(" — ");
  if (payload?.success === false) throw new Error(combined || "Falha no pull de reservas Channex");
  if (error) throw new Error(combined || "Erro ao sincronizar reservas Channex");
  if (!payload) throw new Error("Resposta inválida do sync de reservas Channex");
  return payload;
}

/** Depois de cancelar a reserva no PMS (fluxo do mapa), marca revisão Channex, OTA e fila de ACK. */
export async function invokeChannexFinalizeCancellationRevision(
  channelId: string,
  establishmentId: string,
  revisionId: string,
): Promise<ChannexReservationsSyncPayload> {
  const { data, error, response } = await supabase.functions.invoke("channex-reservations-sync", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
      revision_id: revisionId,
      finalize_channex_cancellation_revision: true,
    },
  });

  let payload = data as ChannexReservationsSyncPayload | null;
  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") payload = parsed as ChannexReservationsSyncPayload;
    } catch {
      // ignore
    }
  }

  const errMsg = payload?.error || (error as { message?: string } | null)?.message || null;
  const hint = payload?.hint;
  const combined = [errMsg, hint].filter(Boolean).join(" — ");
  if (payload?.success === false) throw new Error(combined || "Não foi possível finalizar a revisão Channex");
  if (error) throw new Error(combined || "Erro ao finalizar revisão Channex");
  if (!payload) throw new Error("Resposta inválida ao finalizar revisão Channex");
  return payload;
}
