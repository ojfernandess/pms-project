import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AnyObj = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEvent(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function asObject(value: unknown): AnyObj | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyObj;
  return null;
}

function firstObjectFromArray(value: unknown): AnyObj | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const obj = asObject(item);
    if (obj) return obj;
  }
  return null;
}

function parseIfJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) return value;
  if (!(raw.startsWith("{") || raw.startsWith("["))) return value;
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function deepFindStringByKeys(input: unknown, possibleKeys: string[], maxDepth = 3): string | null {
  const targets = new Set(possibleKeys.map((k) => normalizeKey(k)));
  const queue: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > maxDepth) continue;
    if (current.value == null) continue;
    if (visited.has(current.value)) continue;
    if (typeof current.value === "object") visited.add(current.value);

    if (typeof current.value === "string") {
      const maybeObj = parseIfJsonString(current.value);
      if (maybeObj !== current.value) {
        queue.push({ value: maybeObj, depth: current.depth + 1 });
      }
      continue;
    }

    if (Array.isArray(current.value)) {
      for (const item of current.value) queue.push({ value: item, depth: current.depth + 1 });
      continue;
    }

    if (typeof current.value === "object") {
      const obj = current.value as AnyObj;
      for (const [key, value] of Object.entries(obj)) {
        if (targets.has(normalizeKey(key))) {
          const v = String(value ?? "").trim();
          if (v) return v;
        }
        queue.push({ value, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let d = 0;
  for (let i = 0; i < ba.length; i++) d |= ba[i] ^ bb[i];
  return d === 0;
}

function incomingUserApiKey(req: Request): string {
  const raw =
    req.headers.get("user-api-key") ??
    req.headers.get("User-Api-Key") ??
    req.headers.get("x-user-api-key") ??
    req.headers.get("X-User-Api-Key");
  return String(raw ?? "").trim();
}

function nestedPickString(root: AnyObj | null | undefined, path: string): string | null {
  if (!root) return null;
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as AnyObj)[p];
  }
  const v = String(cur ?? "").trim();
  return v || null;
}

/** UUID Channex/property em forma canónica (minúsculas + hífens) para bater com coluna UUID na BD. */
function toCanonicalUuidLoose(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^urn:uuid:/i, "");
  if (!s) return null;
  const hex = s.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function channexPropertyIdForQuery(raw: string): string[] {
  const canon = toCanonicalUuidLoose(raw);
  if (canon) return [canon];
  const t = raw.trim();
  return t ? [t] : [];
}

function parseIsoMsWebhook(value: unknown): number | null {
  if (value == null) return null;
  const t = Date.parse(String(value).trim());
  return Number.isFinite(t) ? t : null;
}

function normalizeRevisionStatusForCancel(raw: unknown): boolean {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "cancelled" || s === "canceled" || s === "cancel";
}

/** IDs extraídos da mesma entrada JSON:API usada para resolver o cancelamento (para o sync não falhar em booking_id/unique_id). */
function extractRevisionEntryIds(entry: AnyObj): {
  revisionId: string;
  bookingId: string | null;
  uniqueId: string | null;
} {
  const attrs = (entry.attributes ?? {}) as AnyObj;
  const revisionId = String(attrs.id ?? attrs.revision_id ?? entry.id ?? "").trim();
  const bookingId = pickString(
    attrs.booking_id,
    attrs.bookingId,
    nestedPickString(entry as AnyObj, "relationships.booking.data.id"),
  );
  const uniqueId = pickString(attrs.unique_id, attrs.ota_reservation_code, attrs.booking_unique_id);
  return { revisionId, bookingId, uniqueId };
}

/**
 * Com `send_data=false`, o Channex só envia event/property_id/timestamp (docs Channex).
 * Sem booking_revision_id o sync dependia do feed e ficava com processed:0.
 * Obtemos a revisão cancelada mais recente (ou a mais próxima do timestamp do webhook) via API,
 * incluindo booking_id / unique_id do payload para o channex-reservations-sync.
 */
async function resolveCancelledRevisionFromChannexApi(
  baseUrl: string,
  apiKey: string,
  propertyId: string,
  webhookTimestampMs: number | null,
): Promise<{ revisionId: string; bookingId: string | null; uniqueId: string | null } | null> {
  const root = baseUrl.replace(/\/$/, "");
  const paths = [
    `/api/v1/booking_revisions?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=desc&pagination[limit]=50&include=booking`,
    `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=desc&include=booking`,
  ];
  for (const path of paths) {
    const res = await fetch(`${root}${path}`, {
      headers: { Accept: "application/json", "user-api-key": apiKey },
    });
    if (!res.ok) continue;
    const data = (await res.json().catch(() => ({}))) as AnyObj;
    const arr = Array.isArray(data.data) ? (data.data as AnyObj[]) : [];
    const candidates: { entry: AnyObj; insertedMs: number }[] = [];
    for (const entry of arr) {
      const attrs = (entry.attributes ?? {}) as AnyObj;
      const st = attrs.status ?? attrs.revision_status;
      if (!normalizeRevisionStatusForCancel(st)) continue;
      const rid = String(attrs.id ?? attrs.revision_id ?? entry.id ?? "").trim();
      if (!rid) continue;
      const insertedMs =
        parseIsoMsWebhook(attrs.inserted_at) ??
        parseIsoMsWebhook((entry as AnyObj).inserted_at) ??
        parseIsoMsWebhook(attrs.created_at) ??
        0;
      candidates.push({ entry, insertedMs });
    }
    if (candidates.length === 0) continue;
    let winner: AnyObj;
    if (webhookTimestampMs != null) {
      const windowMs = 12 * 60 * 1000;
      const near = candidates.filter(
        (c) => c.insertedMs > 0 && Math.abs(c.insertedMs - webhookTimestampMs) <= windowMs,
      );
      if (near.length > 0) {
        near.sort(
          (a, b) =>
            Math.abs(a.insertedMs - webhookTimestampMs) - Math.abs(b.insertedMs - webhookTimestampMs),
        );
        winner = near[0]!.entry;
      } else {
        candidates.sort((a, b) => b.insertedMs - a.insertedMs);
        winner = candidates[0]!.entry;
      }
    } else {
      candidates.sort((a, b) => b.insertedMs - a.insertedMs);
      winner = candidates[0]!.entry;
    }
    const ids = extractRevisionEntryIds(winner);
    if (!ids.revisionId) continue;
    return ids;
  }
  return null;
}

async function findChannexOtaChannelByPropertyId(
  supabase: ReturnType<typeof createClient>,
  propertyRaw: string,
): Promise<{ row: AnyObj | null; matchValues: string[] }> {
  const matchValues = channexPropertyIdForQuery(propertyRaw);
  if (matchValues.length === 0) return { row: null, matchValues: [] };

  // select("*") evita erro 42703 se migrações opcionais (ex. channex_webhook_verify_user_api_key) ainda não existirem.
  const { data, error } = await supabase
    .from("ota_channels")
    .select("*")
    .eq("channel_manager_type", "channex")
    .in("channex_property_id", matchValues)
    .limit(2);

  if (error) {
    console.warn("channex-reservation-webhook find channel by property_id", error.message, matchValues);
  }

  const first = Array.isArray(data) && data[0] ? (data[0] as AnyObj) : null;
  if (first?.id) return { row: first, matchValues };

  // Fallback: eq individual (alguns proxies/PostgREST com .in em UUID)
  for (const v of matchValues) {
    const { data: one, error: e2 } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("channel_manager_type", "channex")
      .eq("channex_property_id", v)
      .limit(1);
    if (e2) console.warn("channex-reservation-webhook find channel eq fallback", e2.message, v);
    if (one?.[0]) return { row: one[0] as AnyObj, matchValues };
  }

  return { row: null, matchValues };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const rawPayload = parseIfJsonString(await req.json());
    const payload =
      asObject(rawPayload) ??
      firstObjectFromArray(rawPayload) ??
      ({ raw_payload: rawPayload } as AnyObj);
    // Channex pode enviar `data` como objeto JSON:API ou string JSON; sem parse, asObject falha e perdemos booking_revision_id.
    const dataParsed = parseIfJsonString((payload as AnyObj).data);
    const payloadData =
      asObject(dataParsed) ??
      asObject((payload as AnyObj).data) ??
      asObject((payload as AnyObj).payload) ??
      asObject((payload as AnyObj).object) ??
      firstObjectFromArray((payload as AnyObj).data) ??
      null;
    const attrsNested =
      payloadData && typeof (payloadData as AnyObj).attributes === "object"
        ? ((payloadData as AnyObj).attributes as AnyObj)
        : null;
    const eventName = normalizeEvent(
      payload.event ??
      payload.event_name ??
      payload.type ??
      payloadData?.event ??
      payloadData?.event_name ??
      payloadData?.type
    ) || normalizeEvent(deepFindStringByKeys(payload, ["event", "event_name", "type"]));
    const revisionId = pickString(
      payload.revision_id,
      payload.booking_revision_id,
      payload.revisionId,
      payload.bookingRevisionId,
      payloadData?.revision_id,
      payloadData?.booking_revision_id,
      payloadData?.revisionId,
      payloadData?.bookingRevisionId,
      (payloadData?.revision as AnyObj | undefined)?.id,
      // JSON:API: recurso `type` contém "revision" → `id` é o booking_revision_id
      (() => {
        const pdt = String((payloadData as AnyObj)?.type ?? "").toLowerCase();
        return typeof (payloadData as AnyObj)?.id === "string" && pdt.includes("revision")
          ? String((payloadData as AnyObj).id).trim()
          : null;
      })(),
      attrsNested?.revision_id as string | undefined
    ) ?? deepFindStringByKeys(payload, [
      "revision_id",
      "booking_revision_id",
      "revisionId",
      "bookingRevisionId",
      "revision.id",
    ]);
    const bookingId = pickString(
      payload.booking_id,
      payload.bookingId,
      payloadData?.booking_id,
      payloadData?.bookingId,
      (payloadData?.booking as AnyObj | undefined)?.id,
      attrsNested?.booking_id as string | undefined,
      attrsNested?.bookingId as string | undefined
    ) ?? deepFindStringByKeys(payload, ["booking_id", "bookingId", "booking.id"]);
    const bookingUniqueId = pickString(
      payload.booking_unique_id,
      payload.unique_id,
      payload.bookingUniqueId,
      payloadData?.booking_unique_id,
      payloadData?.unique_id,
      payloadData?.bookingUniqueId,
      attrsNested?.unique_id as string | undefined,
      attrsNested?.ota_reservation_code as string | undefined,
      attrsNested?.booking_unique_id as string | undefined
    ) ?? deepFindStringByKeys(payload, ["booking_unique_id", "bookingUniqueId", "unique_id", "uniqueId"]);
    const customerNameWs =
      pickString(payload.customer_name, payloadData?.customer_name) ??
      deepFindStringByKeys(payload, ["customer_name", "customerName"]);
    const arrivalDateWs =
      pickString(payload.arrival_date, payloadData?.arrival_date) ??
      deepFindStringByKeys(payload, ["arrival_date", "arrivalDate"]);
    const webhookSummary: AnyObj = {};
    if (customerNameWs) webhookSummary.customer_name = customerNameWs;
    if (arrivalDateWs) webhookSummary.arrival_date = arrivalDateWs;
    const amountRaw = (payload as AnyObj).amount ?? payloadData?.amount;
    if (amountRaw != null && String(amountRaw).trim() !== "") webhookSummary.amount = amountRaw;
    const curWs = pickString((payload as AnyObj).currency, payloadData?.currency as string | undefined);
    if (curWs) webhookSummary.currency = curWs;
    if (bookingId) webhookSummary.booking_id = bookingId;
    if (bookingUniqueId) webhookSummary.booking_unique_id = bookingUniqueId;
    if (revisionId) webhookSummary.booking_revision_id = revisionId;
    const webhookSummaryPayload = Object.keys(webhookSummary).length > 0 ? { webhook_summary: webhookSummary } : {};
    const propertyId =
      pickString(
        payload.property_id,
        payload.propertyId,
        payloadData?.property_id,
        payloadData?.propertyId,
        nestedPickString(payload as AnyObj, "relationships.property.data.id"),
        nestedPickString(payloadData, "relationships.property.data.id"),
        nestedPickString(payloadData, "property.data.id"),
        (payloadData?.property as AnyObj | undefined)?.id as string | undefined,
      ) ?? deepFindStringByKeys(payload, ["property_id", "propertyId"]) ??
      "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Doc: https://docs.channex.io/api-v.1-documentation/webhook-collection — evento `ari` (alterações de tarifário/disponibilidade no Channex).
    // Não disparamos push automático do PMS aqui para evitar loop quando o próprio PMS acabou de enviar ARI.
    if (eventName === "ari") {
      if (!propertyId) {
        return json({ success: true, ignored: true, reason: "ari_sem_property_id" });
      }
      const { row: ariChannel } = await findChannexOtaChannelByPropertyId(supabase, propertyId);
      if (ariChannel?.id) {
        await supabase.from("channex_sync_logs").insert({
          ota_channel_id: ariChannel.id,
          establishment_id: ariChannel.establishment_id,
          direction: "webhook",
          status: "info",
          endpoint: "channex-reservation-webhook",
          request_payload: { event: eventName, property_id: propertyId, note: "Somente auditoria; re-sincronize ARI manualmente no PMS se necessário." },
          message: `Webhook ARI recebido (${eventName})`,
        });
      }
      return json({ success: true, logged: "ari", property_id: propertyId });
    }

    const isBookingTrigger =
      eventName === "booking" ||
      eventName === "booking_new" ||
      eventName === "booking_modification" ||
      eventName === "booking_cancellation" ||
      eventName === "non_acked_booking" ||
      eventName === "booking_unmapped_room" ||
      eventName === "booking_unmapped_rate";

    if (!isBookingTrigger) {
      return json({ success: true, ignored: true, reason: "Evento sem ação de reserva" });
    }

    const { row: channel, matchValues } = await findChannexOtaChannelByPropertyId(supabase, propertyId);
    if (!channel?.id) {
      return json({
        success: true,
        ignored: true,
        reason: "Canal Channex não mapeado para property_id",
        hint:
          "Confirme no PMS (Canal Channex) que Property ID é o UUID da propriedade no Channex, igual ao property_id deste webhook.",
        debug: {
          property_id_raw: propertyId,
          property_id_canonical: toCanonicalUuidLoose(propertyId),
          query_values_tried: matchValues,
        },
      });
    }

    const channelRow = channel as AnyObj;
    if (channelRow.channex_webhook_verify_user_api_key === true) {
      const expected = String(channelRow.channex_api_key ?? "").trim();
      const got = incomingUserApiKey(req);
      if (!expected || !timingSafeEqualString(expected, got)) {
        return json({ success: false, error: "Webhook não autorizado (user-api-key)" }, 401);
      }
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channel.id,
      establishment_id: channel.establishment_id,
      direction: "webhook",
      status: "info",
      endpoint: "channex-reservation-webhook",
      request_payload: payload,
      message: `Webhook recebido (${eventName})`,
    });

    if (channel.channex_use_webhook === false) {
      return json({ success: true, ignored: true, reason: "Webhook trigger desativado no canal" });
    }

    /** Com send_data=false o body não traz IDs; resolvemos revision_id (+ booking/unique quando possível) via API Channex. */
    let revisionIdEffective = revisionId;
    let bookingIdEffective = bookingId;
    let bookingUniqueIdEffective = bookingUniqueId;
    let cancellationRevisionResolvedViaApi = false;

    if (
      eventName === "booking_cancellation" &&
      !revisionIdEffective &&
      !bookingIdEffective &&
      !bookingUniqueIdEffective
    ) {
      const apiKey = String(channelRow.channex_api_key ?? "").trim();
      const baseUrl = String(channelRow.channex_base_url ?? "https://staging.channex.io").trim();
      const chProp = String(channelRow.channex_property_id ?? propertyId).trim();
      if (apiKey && chProp) {
        const webhookTs = parseIsoMsWebhook((payload as AnyObj).timestamp);
        const resolved = await resolveCancelledRevisionFromChannexApi(baseUrl, apiKey, chProp, webhookTs);
        if (resolved) {
          revisionIdEffective = resolved.revisionId;
          if (resolved.bookingId) bookingIdEffective = resolved.bookingId;
          if (resolved.uniqueId) bookingUniqueIdEffective = resolved.uniqueId;
          cancellationRevisionResolvedViaApi = true;
        }
      }
    }

    // non_acked_booking: revisão pode ser antiga (>3 min); não limitar pela janela curta do feed.
    const initialWindowSeconds =
      eventName === "non_acked_booking"
        ? 0
        : !revisionIdEffective && !bookingIdEffective && !bookingUniqueIdEffective
          ? 180
          : 0;
    const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/channex-reservations-sync`;
    const syncAuth = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const invokeResp = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${syncAuth}`,
      },
      body: JSON.stringify({
        channel_id: channel.id,
        establishment_id: channel.establishment_id,
        revision_id: revisionIdEffective,
        booking_id: bookingIdEffective,
        booking_unique_id: bookingUniqueIdEffective,
        source_event: eventName,
        // Fallback para webhooks resumidos sem IDs:
        // limita o pull às revisões mais recentes para acelerar entrada em pendências.
        recent_window_seconds: initialWindowSeconds,
        ...webhookSummaryPayload,
      }),
    });
    let invokePayload = await invokeResp.json().catch(() => ({}));
    let fallbackWindowSeconds = 0;

    // Webhook "resumido": tenta novamente com janela maior para pegar nova revisão
    // quando o feed do Channex demora a refletir o evento imediatamente.
    const shouldRetryWithLargerWindow =
      !revisionIdEffective &&
      !bookingIdEffective &&
      !bookingUniqueIdEffective &&
      invokeResp.ok &&
      Number((invokePayload as AnyObj)?.processed ?? 0) === 0;
    if (shouldRetryWithLargerWindow) {
      fallbackWindowSeconds = 7200;
      const retryResp = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncAuth}`,
        },
        body: JSON.stringify({
          channel_id: channel.id,
          establishment_id: channel.establishment_id,
          source_event: eventName,
          recent_window_seconds: fallbackWindowSeconds,
          ...webhookSummaryPayload,
        }),
      });
      const retryPayload = await retryResp.json().catch(() => ({}));
      if (retryResp.ok) invokePayload = retryPayload;
    }

    // Cancelamento: revisão/booking podem aparecer no 2º tick na API; ou o 1º sync falhou sem booking/unique no payload.
    if (
      eventName === "booking_cancellation" &&
      invokeResp.ok &&
      Number((invokePayload as AnyObj)?.processed ?? 0) === 0
    ) {
      const apiKey = String(channelRow.channex_api_key ?? "").trim();
      const baseUrl = String(channelRow.channex_base_url ?? "https://staging.channex.io").trim();
      const chProp = String(channelRow.channex_property_id ?? propertyId).trim();
      if (apiKey && chProp) {
        await new Promise((r) => setTimeout(r, 2500));
        const webhookTs = parseIsoMsWebhook((payload as AnyObj).timestamp);
        const resolved = await resolveCancelledRevisionFromChannexApi(baseUrl, apiKey, chProp, webhookTs);
        if (resolved) {
          revisionIdEffective = resolved.revisionId;
          if (resolved.bookingId) bookingIdEffective = resolved.bookingId;
          if (resolved.uniqueId) bookingUniqueIdEffective = resolved.uniqueId;
          cancellationRevisionResolvedViaApi = true;
          const lateResp = await fetch(syncUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${syncAuth}`,
            },
            body: JSON.stringify({
              channel_id: channel.id,
              establishment_id: channel.establishment_id,
              revision_id: revisionIdEffective,
              booking_id: bookingIdEffective,
              booking_unique_id: bookingUniqueIdEffective,
              source_event: eventName,
              recent_window_seconds: 0,
              ...webhookSummaryPayload,
            }),
          });
          const latePayload = await lateResp.json().catch(() => ({}));
          if (lateResp.ok) invokePayload = latePayload;
        }
      }
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channel.id,
      establishment_id: channel.establishment_id,
      direction: "webhook",
      status: invokeResp.ok ? "success" : "warning",
      endpoint: "channex-reservation-webhook -> channex-reservations-sync",
      request_payload: {
        extracted: {
          event: eventName,
          revision_id: revisionIdEffective,
          booking_id: bookingIdEffective,
          booking_unique_id: bookingUniqueIdEffective,
          property_id: propertyId,
          cancellation_revision_resolved_via_api: cancellationRevisionResolvedViaApi,
        },
        windows: {
          initial_window_seconds: initialWindowSeconds,
          fallback_window_seconds: fallbackWindowSeconds,
        },
        debug: {
          payload_type: Array.isArray(rawPayload) ? "array" : typeof rawPayload,
          payload_root_keys: typeof payload === "object" && payload ? Object.keys(payload) : [],
          payload_data_type: payloadData === null ? "null" : typeof payloadData,
          parsed_data_keys: payloadData ? Object.keys(payloadData) : [],
        },
      },
      response_payload: invokePayload,
      message: `Webhook processado (${eventName})`,
    });

    return json({
      success: invokeResp.ok,
      event: eventName,
      revision_id: revisionIdEffective,
      booking_id: bookingIdEffective,
      booking_unique_id: bookingUniqueIdEffective,
      hint:
        !revisionId && !bookingId && !bookingUniqueId
          ? cancellationRevisionResolvedViaApi
            ? "Webhook sem IDs no corpo (send_data=false). booking_revision_id obtido via API Channex antes do sync."
            : "Webhook resumido detectado (provavelmente send_data=false). PMS usou pull do feed com retry/fallback; se processed=0, ative send_data=true no webhook Channex."
          : null,
      debug: {
        payload_type: Array.isArray(rawPayload) ? "array" : typeof rawPayload,
        payload_root_keys: typeof payload === "object" && payload ? Object.keys(payload) : [],
        payload_data_type: payloadData === null ? "null" : typeof payloadData,
        parsed_data_keys: payloadData ? Object.keys(payloadData) : [],
        initial_window_seconds: initialWindowSeconds,
        fallback_window_seconds: fallbackWindowSeconds,
      },
      sync: invokePayload,
    });
  } catch (error) {
    console.error("channex-reservation-webhook error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
