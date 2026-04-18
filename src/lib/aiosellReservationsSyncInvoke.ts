import { supabase } from "@/integrations/supabase/client";

/** Campos obrigatórios no `ota_channels` para pull HTTP (botão «Reservas» no Channel Manager). */
export function validateAiosellChannelForReservationsPull(channel: {
  channel_manager_type?: string | null;
  aiosell_bookings_list_path?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  aiosell_hotel_code?: string | null;
} | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!channel || channel.channel_manager_type !== "aiosell") {
    return { ok: false, message: "Canal Aiosell não encontrado." };
  }
  const missing: string[] = [];
  if (!String(channel.aiosell_bookings_list_path ?? "").trim()) {
    missing.push("path GET de listagem de reservas");
  }
  if (!String(channel.api_key ?? "").trim()) missing.push("usuário API (Basic Auth)");
  if (!String(channel.api_secret ?? "").trim()) missing.push("senha API (Basic Auth)");
  if (!String(channel.aiosell_hotel_code ?? "").trim()) missing.push("Hotel Code");
  if (missing.length) {
    return {
      ok: false,
      message: `Preencha no canal: ${missing.join(", ")}. Use «Editar canal» no separador Canais.`,
    };
  }
  return { ok: true };
}

export type AiosellReservationsSyncPayload = {
  success?: boolean;
  error?: string;
  hint?: string;
  processed?: number;
  created?: number;
  skipped?: number;
  failed?: number;
  results?: Array<Record<string, unknown>>;
  message?: string;
};

/**
 * Sincroniza reservas do canal Aiosell: aplica payloads no formato webhook (book/modify/cancel).
 * - Envie `pull: true` se o canal tiver `aiosell_bookings_list_path` (GET com Basic Auth).
 * - Ou use `bookings: [...]` com objetos exportados / replicados do CM.
 */
export async function invokeAiosellReservationsSync(
  channelId: string,
  establishmentId: string,
  opts?: { pull?: boolean; bookings?: unknown[]; days?: number }
): Promise<AiosellReservationsSyncPayload> {
  const { data, error, response } = await supabase.functions.invoke("aiosell-reservations-sync", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
      pull: opts?.pull === true,
      bookings: opts?.bookings,
      days: opts?.days,
    },
  });

  let payload = data as AiosellReservationsSyncPayload | null;

  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") {
        payload = parsed as AiosellReservationsSyncPayload;
      }
    } catch {
      /* ignore */
    }
  }

  const errMsg =
    payload?.error || (error as { message?: string } | null)?.message || null;
  const hint = payload?.hint;
  const combinedMsg = [errMsg, hint].filter(Boolean).join(" — ") || null;

  const fail = (base: string) => {
    throw new Error(combinedMsg || errMsg || base);
  };

  if (payload?.success === false) {
    fail("Falha na sincronização de reservas Aiosell");
  }
  if (error) {
    fail(combinedMsg || "Erro ao chamar sincronização de reservas Aiosell");
  }
  if (payload == null) {
    fail("Resposta inválida do servidor");
  }

  return payload;
}
