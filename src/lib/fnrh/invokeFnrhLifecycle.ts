import { supabase } from "@/integrations/supabase/client";

/**
 * Notifica a API FNRH (check-out, cancelamento de reserva ou no-show) após a ação no PMS.
 * No-show: PATCH /hospedes/{id}/noshow ou /reservas/{id}/noshow (Edge `fnrh-lifecycle`, action `noshow`).
 * Silencia falhas (não bloqueia fluxo); requer envio prévio bem-sucedido de hospedagem/registrar.
 *
 * `webCheckinToken`: no web check-in o JWT do hóspede pode não passar no RLS de `reservations`;
 * a Edge Function valida o token do fluxo (par `token` + `reservation_id`).
 */
export async function invokeFnrhLifecycle(
  reservationId: string,
  action: "checkout" | "cancel" | "noshow",
  opts?: { webCheckinToken?: string | null },
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      reservation_id: reservationId,
      action,
    };
    const tok = opts?.webCheckinToken?.trim();
    if (tok) body.web_checkin_token = tok;

    const { data: sess } = await supabase.auth.getSession();
    const access = sess?.session?.access_token;

    const invokeOpts: {
      body: Record<string, unknown>;
      headers?: Record<string, string>;
    } = { body };
    if (access) {
      invokeOpts.headers = { Authorization: `Bearer ${access}` };
    }

    const { data, error } = await supabase.functions.invoke(
      "fnrh-lifecycle",
      invokeOpts,
    );

    if (error) {
      console.warn("[FNRH lifecycle]", action, reservationId, error);
      return;
    }

    const payload = data as {
      success?: boolean;
      skipped?: boolean;
      error?: string;
      reason?: string;
    };
    if (payload?.success === false && payload?.error) {
      console.warn("[FNRH lifecycle]", action, reservationId, payload.error);
    }
  } catch (e) {
    console.warn("[FNRH lifecycle]", action, reservationId, e);
  }
}
