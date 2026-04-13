import { supabase } from "@/integrations/supabase/client";
import { postPmsApiAuth } from "@/lib/pmsApi";

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
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) throw new Error("Sessão inválida");
  let error: { message?: string } | null = null;
  let data: unknown = null;
  try {
    data = await postPmsApiAuth(
      "/api/integrations/aiosell-reservation-webhook",
      {
        apply_revision_id: revisionId,
        establishment_id: establishmentId,
      },
      jwt,
    );
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  let payload = (data ?? null) as AiosellApplyRevisionPayload | null;
  const errMsg =
    (payload?.error != null ? String(payload.error) : null) ||
    error?.message ||
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
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) throw new Error("Sessão inválida");
  let error: { message?: string } | null = null;
  let data: unknown = null;
  try {
    data = await postPmsApiAuth(
      "/api/integrations/aiosell-reservation-webhook",
      {
        finalize_cancellation_revision_id: revisionId,
        establishment_id: establishmentId,
      },
      jwt,
    );
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  let payload = (data ?? null) as Record<string, unknown> | null;
  const errMsg =
    (payload?.error != null ? String(payload.error) : null) ||
    error?.message ||
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
