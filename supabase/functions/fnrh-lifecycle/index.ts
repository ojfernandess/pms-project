/**
 * FNRH — check-out, cancelamento de reserva e no-show na API v2 (credenciais só server-side).
 *
 * POST body: { reservation_id, action: "checkout" | "cancel" | "noshow", web_checkin_token? }
 * - noshow: PATCH /hospedes/{hospede_id}/noshow para cada hóspede com fnrh_hospede_id; se nenhum,
 *   PATCH /reservas/{reserva_id}/noshow (reserva federal).
 *
 * Autorização: JWT com SELECT em `reservations` **ou** `web_checkin_token` válido para o par token+reserva (web check-in).
 *
 * Requer envio prévio bem-sucedido de hospedagem/registrar (fnrh_reserva_id no log).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FNRH_BASE_PROD = "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2";
const FNRH_BASE_HOMOLOG = "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2";

type Body = {
  reservation_id?: string;
  action?: "checkout" | "cancel" | "noshow";
  /** Web check-in: quando o JWT do hóspede não passa no RLS de `reservations`, valida o acesso pelo token secreto do fluxo. */
  web_checkin_token?: string;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidCpfDigits(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

function onlyDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

function ensureFnrhApiV2BaseUrl(raw: string): string {
  const u = raw.replace(/\/$/, "");
  if (/\/rest\/v1\b/i.test(u)) {
    return u.replace(/\/rest\/v1\b/i, "/rest/v2");
  }
  return u;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, {
      success: false,
      error: "Server misconfiguration",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse(400, { success: false, error: "Invalid JSON" });
  }

  const reservationId = body.reservation_id?.trim();
  const action = body.action;
  if (
    !reservationId ||
    (action !== "checkout" && action !== "cancel" && action !== "noshow")
  ) {
    return jsonResponse(400, {
      success: false,
      error: "Informe reservation_id e action: checkout | cancel | noshow",
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const webCheckinToken =
    typeof body.web_checkin_token === "string"
      ? body.web_checkin_token.trim()
      : "";

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    let establishmentId: string | null = null;

    if (jwt && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: res, error: resErr } = await userClient
        .from("reservations")
        .select("id, establishment_id")
        .eq("id", reservationId)
        .maybeSingle();
      if (!resErr && res?.establishment_id) {
        establishmentId = res.establishment_id as string;
      }
    }

    if (!establishmentId && webCheckinToken) {
      const { data: wc, error: wcErr } = await admin
        .from("web_checkin")
        .select("id, reservation_id")
        .eq("token", webCheckinToken)
        .eq("reservation_id", reservationId)
        .maybeSingle();
      if (!wcErr && wc) {
        const { data: res2 } = await admin
          .from("reservations")
          .select("establishment_id")
          .eq("id", reservationId)
          .maybeSingle();
        if (res2?.establishment_id) {
          establishmentId = res2.establishment_id as string;
        }
      }
    }

    if (!establishmentId) {
      return jsonResponse(403, {
        success: false,
        error:
          "Sem acesso a esta reserva. Use sessão do hóspede ou envie web_checkin_token do fluxo.",
      });
    }

    const { data: settings } = await admin
      .from("establishment_fnrh_settings")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!settings?.enabled) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "fnrh_disabled",
      });
    }

    const { data: secretRow } = await admin
      .from("establishment_fnrh_secrets")
      .select("api_password")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const apiUser = (settings.api_username as string | null)?.trim();
    const apiPass = secretRow?.api_password as string | undefined;
    if (!apiUser || !apiPass) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "credentials_incomplete",
      });
    }

    const cpfSol = onlyDigits(settings.cpf_solicitante as string);
    if (!cpfSol.length || !isValidCpfDigits(cpfSol)) {
      return jsonResponse(400, {
        success: false,
        error:
          "CPF do solicitante (FNRH) inválido nas configurações do estabelecimento.",
      });
    }

    const env = settings.environment as string;
    let baseUrl = (settings.base_url_override as string | null)?.trim();
    if (!baseUrl) {
      baseUrl = env === "homologation" ? FNRH_BASE_HOMOLOG : FNRH_BASE_PROD;
    }
    baseUrl = ensureFnrhApiV2BaseUrl(baseUrl.replace(/\/$/, ""));

    const { data: regLog } = await admin
      .from("fnrh_submission_log")
      .select("fnrh_reserva_id, id")
      .eq("reservation_id", reservationId)
      .eq("operation", "hospedagem_registrar")
      .eq("status", "success")
      .not("fnrh_reserva_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fnrhReservaId = String(regLog?.fnrh_reserva_id || "").trim();
    if (!fnrhReservaId) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "no_fnrh_reserva",
        message:
          "Reserva ainda não consta na FNRH (sem envio hospedagem/registrar bem-sucedido).",
      });
    }

    if (action === "noshow") {
      const wcList = await admin
        .from("web_checkin")
        .select("id")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(8);
      const wcIds = (wcList.data ?? []).map((r: { id: string }) => r.id);
      const hospedeIds: string[] = [];
      const seen = new Set<string>();
      if (wcIds.length > 0) {
        const gRes = await admin
          .from("web_checkin_guests")
          .select("fnrh_hospede_id")
          .in("web_checkin_id", wcIds)
          .not("fnrh_hospede_id", "is", null);
        for (const g of gRes.data ?? []) {
          const hid = String(
            (g as { fnrh_hospede_id?: string }).fnrh_hospede_id ?? "",
          ).trim();
          if (hid && !seen.has(hid)) {
            seen.add(hid);
            hospedeIds.push(hid);
          }
        }
      }

      const webCheckinRowsNs = await admin
        .from("web_checkin")
        .select("id")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1);
      const webCheckinIdNs = webCheckinRowsNs.data?.[0]?.id ?? null;

      const basicNs = btoa(`${apiUser}:${apiPass}`);
      const baseHeaders: Record<string, string> = {
        Authorization: `Basic ${basicNs}`,
        cpf_solicitante: cpfSol,
        "Content-Type": "application/json",
      };

      const patchNoshowOnce = async (
        relPath: string,
        opName: string,
        idempotencyExtra: string,
      ): Promise<{ ok: boolean; error?: string; http?: number }> => {
        const idKey = await sha256Hex(
          `${establishmentId}:${reservationId}:${opName}:${idempotencyExtra}`,
        );
        const { data: prevOk } = await admin
          .from("fnrh_submission_log")
          .select("id")
          .eq("idempotency_key", idKey)
          .eq("status", "success")
          .maybeSingle();
        if (prevOk) return { ok: true };

        await admin.from("fnrh_submission_log").delete().eq(
          "idempotency_key",
          idKey,
        );
        await admin.from("fnrh_submission_log").insert({
          establishment_id: establishmentId,
          reservation_id: reservationId,
          web_checkin_id: webCheckinIdNs,
          operation: opName,
          idempotency_key: idKey,
          status: "pending",
        });
        const url = `${baseUrl}${relPath}`;
        const fr = await fetch(url, {
          method: "PATCH",
          headers: baseHeaders,
          body: "{}",
        });
        const text = await fr.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = { raw: text.slice(0, 500) };
        }
        if (!fr.ok) {
          const errMsg =
            (parsed?.mensagem as string) ||
            (parsed?.erro as string) ||
            text.slice(0, 400);
          await admin
            .from("fnrh_submission_log")
            .update({
              status: "failed",
              http_status: fr.status,
              error_message: errMsg,
              response_summary: { status: fr.status },
            })
            .eq("idempotency_key", idKey);
          return { ok: false, error: errMsg, http: fr.status };
        }
        await admin
          .from("fnrh_submission_log")
          .update({
            status: "success",
            http_status: fr.status,
            fnrh_reserva_id: fnrhReservaId,
            response_summary: { action: "noshow", op: opName },
            error_message: null,
          })
          .eq("idempotency_key", idKey);
        return { ok: true };
      };

      if (hospedeIds.length > 0) {
        for (const hid of hospedeIds) {
          const r = await patchNoshowOnce(
            `/hospedes/${encodeURIComponent(hid)}/noshow`,
            "hospede_noshow",
            hid,
          );
          if (!r.ok) {
            return jsonResponse(200, {
              success: false,
              error: r.error ?? "Falha ao informar no-show na FNRH (hóspede)",
              http_status: r.http,
            });
          }
        }
        return jsonResponse(200, {
          success: true,
          action: "noshow",
          mode: "hospedes",
          count: hospedeIds.length,
        });
      }

      const rRes = await patchNoshowOnce(
        `/reservas/${encodeURIComponent(fnrhReservaId)}/noshow`,
        "reserva_noshow",
        fnrhReservaId,
      );
      if (!rRes.ok) {
        return jsonResponse(200, {
          success: false,
          error: rRes.error ?? "Falha ao informar no-show na FNRH (reserva)",
          http_status: rRes.http,
        });
      }
      return jsonResponse(200, {
        success: true,
        action: "noshow",
        mode: "reserva",
      });
    }

    const op = action === "checkout" ? "reserva_checkout" : "reserva_cancelar";
    const idempotencyKey = await sha256Hex(
      `${establishmentId}:${reservationId}:${op}`,
    );

    const { data: prevOk } = await admin
      .from("fnrh_submission_log")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "success")
      .maybeSingle();

    if (prevOk) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "already_synced",
        idempotency_key: idempotencyKey,
      });
    }

    await admin.from("fnrh_submission_log").delete().eq(
      "idempotency_key",
      idempotencyKey,
    );

    const webCheckinRows = await admin
      .from("web_checkin")
      .select("id")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false })
      .limit(1);
    const webCheckinId = webCheckinRows.data?.[0]?.id ?? null;

    await admin.from("fnrh_submission_log").insert({
      establishment_id: establishmentId,
      reservation_id: reservationId,
      web_checkin_id: webCheckinId,
      operation: op,
      idempotency_key: idempotencyKey,
      status: "pending",
    });

    const basic = btoa(`${apiUser}:${apiPass}`);
    const path =
      action === "checkout"
        ? `/reservas/${encodeURIComponent(fnrhReservaId)}/checkout`
        : `/reservas/${encodeURIComponent(fnrhReservaId)}/cancelar`;

    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${basic}`,
      cpf_solicitante: cpfSol,
    };

    const fr = action === "checkout"
      ? await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "text/plain",
        },
        body: new Date().toISOString(),
      })
      : await fetch(url, {
        method: "POST",
        headers,
      });

    const text = await fr.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    if (!fr.ok) {
      const errMsg =
        (parsed?.mensagem as string) ||
        (parsed?.erro as string) ||
        text.slice(0, 400);
      await admin
        .from("fnrh_submission_log")
        .update({
          status: "failed",
          http_status: fr.status,
          error_message: errMsg,
          response_summary: { status: fr.status },
        })
        .eq("idempotency_key", idempotencyKey);

      return jsonResponse(200, {
        success: false,
        error: errMsg,
        http_status: fr.status,
        idempotency_key: idempotencyKey,
      });
    }

    await admin
      .from("fnrh_submission_log")
      .update({
        status: "success",
        http_status: fr.status,
        fnrh_reserva_id: fnrhReservaId,
        response_summary: { action },
        error_message: null,
      })
      .eq("idempotency_key", idempotencyKey);

    return jsonResponse(200, {
      success: true,
      action,
      idempotency_key: idempotencyKey,
    });
  } catch (e) {
    console.error("fnrh-lifecycle", e);
    return jsonResponse(500, {
      success: false,
      error: e instanceof Error ? e.message : "Erro interno",
    });
  }
});
