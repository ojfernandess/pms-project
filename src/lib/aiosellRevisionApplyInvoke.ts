import { supabase } from "@/integrations/supabase/client";

export type AiosellApplyRevisionPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  already_processed?: boolean;
};

/**
 * Aplica no PMS uma revisão Aiosell enfileirada em `channex_booking_revisions` (Tratativas).
 */
export async function invokeAiosellApplyBookingRevision(
  establishmentId: string,
  revisionId: string,
): Promise<AiosellApplyRevisionPayload> {
  const { data, error, response } = await supabase.functions.invoke("aiosell-reservation-webhook", {
    body: {
      apply_revision_id: revisionId,
      establishment_id: establishmentId,
    },
  });

  let payload = (data ?? null) as AiosellApplyRevisionPayload | null;
  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") payload = parsed as AiosellApplyRevisionPayload;
    } catch {
      // ignore
    }
  }

  const errMsg =
    (payload?.error != null ? String(payload.error) : null) ||
    (error as { message?: string } | null)?.message ||
    null;

  if (payload?.success === false) {
    throw new Error(errMsg || "Falha ao aplicar revisão Aiosell");
  }
  if (error) {
    throw new Error(errMsg || "Erro ao invocar aplicação da revisão Aiosell");
  }
  if (!payload || payload.success !== true) {
    throw new Error(errMsg || "Resposta inválida do webhook Aiosell");
  }
  return payload;
}

/**
 * Após cancelar no PMS (mapa + política + estorno), marca revisão Aiosell e OTA como concluídas.
 */
export async function invokeAiosellFinalizeCancellationRevision(
  establishmentId: string,
  revisionId: string,
): Promise<{ success?: boolean; finalized?: boolean; error?: string }> {
  const { data, error, response } = await supabase.functions.invoke("aiosell-reservation-webhook", {
    body: {
      finalize_cancellation_revision_id: revisionId,
      establishment_id: establishmentId,
    },
  });

  let payload = (data ?? null) as Record<string, unknown> | null;
  if (error && response) {
    try {
      const parsed = await response.clone().json();
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  const errMsg =
    (payload?.error != null ? String(payload.error) : null) ||
    (error as { message?: string } | null)?.message ||
    null;

  if (payload?.success === false) {
    throw new Error(errMsg || "Falha ao finalizar pendência Aiosell");
  }
  if (error) {
    throw new Error(errMsg || "Erro ao finalizar pendência Aiosell");
  }
  if (!payload || payload.success !== true) {
    throw new Error(errMsg || "Resposta inválida ao finalizar Aiosell");
  }
  return payload as { success?: boolean; finalized?: boolean; error?: string };
}
