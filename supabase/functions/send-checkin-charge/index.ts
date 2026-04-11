import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function replaceTemplateVariables(
  body: string,
  vars: Record<string, string>
): string {
  let out = body;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), value ?? "");
  }
  return out;
}

function generateSecureToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normaliza número de telefone para o formato esperado pelo WhatsApp (E.164, apenas dígitos).
 * - Remove caracteres não numéricos
 * - Remove zero à esquerda (ex: 011 -> 11)
 * - Adiciona código do país (55 Brasil) se o número parecer local (10 ou 11 dígitos)
 * @param phone Número como está cadastrado (ex: (11) 99999-9999, 11999999999, +55 11 99999-9999)
 * @param defaultCountryCode Código do país quando não informado (padrão 55 Brasil)
 */
function normalizePhoneForWhatsApp(phone: string, defaultCountryCode = "55"): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // Remove zero(s) à esquerda (formato local brasileiro 011 99999-9999)
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";
  const len = digits.length;
  // Já tem código do país (ex: 55 + 11 dígitos = 13 para Brasil)
  if (len >= 12 && (digits.startsWith(defaultCountryCode) || digits.startsWith("55"))) return digits;
  // Número local Brasil: 10 dígitos (2 DDD + 8) ou 11 dígitos (2 DDD + 9 celular)
  if (len === 10 || len === 11) return `${defaultCountryCode}${digits}`;
  // Outros países: se começa com código conhecido, mantém; senão adiciona default
  if (len >= 12) return digits;
  return `${defaultCountryCode}${digits}`;
}

/** Envia mensagem usando template oficial da Meta (WhatsApp Cloud API). */
async function sendViaChannelMetaTemplate(
  channelConfig: Record<string, unknown>,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[]
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const phone = (channelConfig.phone_id as string) || "";
  const token = (channelConfig.access_token as string) || "";
  if (!token || !to) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
  try {
    const cleanPhone = to.replace(/\D/g, "");
    const bodyParams = bodyParameters.map((text) => ({ type: "text" as const, text }));
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phone}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: bodyParams.length ? [{ type: "body", parameters: bodyParams }] : [],
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || res.statusText };
    return { ok: true, externalId: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function parseCsvVariables(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return fallback;
  const arr = value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : fallback;
}

function resolveMetaTemplateForIntent(
  config: Record<string, unknown>,
  intent: string | undefined,
  channelConfig: Record<string, unknown>
): { name: string | null; language: string; variables: string[] } {
  const defaultVars = ["guest_name", "reservation_code", "checkin_date", "amount", "payment_link", "web_checkin_link", "establishment_name", "establishment_address"];
  const byIntent = (channelConfig.meta_templates_by_intent as Record<string, { name?: string; language?: string; variables?: string | string[] }> | undefined) ?? {};
  const intentKey =
    intent === "checkin_reminder" ||
    intent === "payment_pending" ||
    intent === "checkout_reminder" ||
    intent === "reservation_modified" ||
    intent === "reservation_cancelled" ||
    intent === "reservation_overbooking"
      ? intent
      : "fallback";
  const selected = byIntent[intentKey] ?? byIntent.fallback;
  const name = (selected?.name || (config.meta_template_name as string) || "").trim() || null;
  const language = (selected?.language || (config.meta_template_language as string) || "pt_BR").trim() || "pt_BR";
  const variables = parseCsvVariables(selected?.variables ?? config.meta_template_body_variables, defaultVars);
  return { name, language, variables };
}

async function sendViaChatwootMetaTemplate(
  channelConfig: Record<string, unknown>,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[]
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const baseUrl = (channelConfig.base_url as string) || "";
  const accountId = (channelConfig.account_id as number) || 0;
  const inboxId = (channelConfig.inbox_id as number) || 0;
  const apiKey = (channelConfig.api_key as string) || "";
  if (!baseUrl || !apiKey || !to) return { ok: false, error: "Chatwoot: config ou destinatário ausente" };
  const headers = { "api_access_token": apiKey, "Content-Type": "application/json" };
  const apiBase = baseUrl.replace(/\/$/, "");
  const phoneDigits = to.replace(/\D/g, "") || to;
  const phoneE164 = to.startsWith("+") ? to : `+${phoneDigits}`;
  try {
    let sourceId: string | null = null;
    let contactId: number | null = null;
    const createContactRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inbox_id: inboxId,
        phone_number: phoneE164,
        identifier: phoneDigits,
      }),
    });
    const contactData = await createContactRes.json().catch(() => ({}));
    const contactPayload = contactData?.payload ?? contactData;
    const payloadContact = contactPayload?.contact ?? contactPayload;
    contactId = payloadContact?.id ?? contactPayload?.id ?? null;
    const contactInboxes = contactPayload?.contact_inboxes ?? payloadContact?.contact_inboxes ?? contactData?.contact_inboxes ?? [];
    if (createContactRes.ok && contactInboxes.length > 0) {
      const inboxMatch = contactInboxes.find((ci: { inbox?: { id: number } }) => ci.inbox?.id === inboxId);
      sourceId = (inboxMatch?.source_id ?? contactInboxes[0]?.source_id) ?? null;
    }
    if (createContactRes.ok && !sourceId && contactId) {
      const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contactId}/contact_inboxes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
      });
      const cibData = await createCibRes.json().catch(() => ({}));
      const cibPayload = cibData?.payload ?? cibData;
      sourceId = cibPayload?.source_id ?? phoneDigits;
    }
    if (!sourceId && (createContactRes.status === 422 || createContactRes.status === 404)) {
      const searchRes = await fetch(
        `${apiBase}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneDigits)}`,
        { headers }
      );
      const searchData = await searchRes.json().catch(() => ({}));
      const list = searchData?.payload ?? searchData?.data ?? searchData;
      const contacts = Array.isArray(list) ? list : list?.contacts ?? [];
      const contact = contacts.find((c: { contact_inboxes?: Array<{ source_id: string; inbox?: { id: number } }> }) =>
        (c.contact_inboxes ?? []).some((ci: { inbox?: { id: number } }) => ci.inbox?.id === inboxId)
      ) ?? contacts[0];
      const ci = contact?.contact_inboxes ?? [];
      if (ci.length > 0) {
        const inboxMatch = ci.find((cib: { inbox?: { id: number } }) => cib.inbox?.id === inboxId);
        sourceId = inboxMatch?.source_id ?? ci[0]?.source_id ?? null;
      }
      if (!sourceId && contact?.id) {
        const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contact.id}/contact_inboxes`, {
          method: "POST",
          headers,
          body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
        });
        const cibData = await createCibRes.json().catch(() => ({}));
        const cibPayload = cibData?.payload ?? cibData;
        sourceId = cibPayload?.source_id ?? phoneDigits;
      }
    }
    if (!sourceId) sourceId = phoneDigits;

    const convRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/conversations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source_id: sourceId,
        inbox_id: inboxId,
        message: { content: " " },
      }),
    });
    const convData = await convRes.json().catch(() => ({}));
    if (!convRes.ok) {
      return { ok: false, error: convData?.message || convData?.errors?.[0]?.message || String(convRes.status) };
    }
    const conversationId = convData?.id ?? convData?.payload?.id;
    if (!conversationId) return { ok: false, error: "Chatwoot: conversa não encontrada" };

    const bodyMap = bodyParameters.reduce((acc, val, idx) => {
      acc[String(idx + 1)] = val ?? "";
      return acc;
    }, {} as Record<string, string>);
    const msgRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: "Template WhatsApp",
        message_type: "outgoing",
        private: false,
        content_type: "text",
        template_params: {
          name: templateName,
          category: "UTILITY",
          language: languageCode,
          processed_params: {
            body: bodyMap,
          },
        },
      }),
    });
    const msgData = await msgRes.json().catch(() => ({}));
    if (!msgRes.ok) return { ok: false, error: msgData?.message || msgData?.errors?.[0]?.message || String(msgRes.status) };
    return { ok: true, externalId: String(msgData?.id ?? conversationId) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendViaChannel(
  channel: string,
  channelConfig: Record<string, unknown>,
  to: string,
  message: string,
  _reservationId: string
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  switch (channel) {
    case "whatsapp_cloud": {
      const phone = (channelConfig.phone_id as string) || "";
      const token = (channelConfig.access_token as string) || "";
      if (!token || !to) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
      try {
        const cleanPhone = to.replace(/\D/g, "");
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${phone}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: cleanPhone,
              type: "text",
              text: { body: message },
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data?.error?.message || res.statusText };
        return { ok: true, externalId: data?.messages?.[0]?.id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    case "chatwoot": {
      const baseUrl = (channelConfig.base_url as string) || "";
      const accountId = (channelConfig.account_id as number) || 0;
      const inboxId = (channelConfig.inbox_id as number) || 0;
      const apiKey = (channelConfig.api_key as string) || "";
      if (!baseUrl || !apiKey || !to) return { ok: false, error: "Chatwoot: config ou destinatário ausente" };
      const headers = {
        "api_access_token": apiKey,
        "Content-Type": "application/json",
      };
      const apiBase = baseUrl.replace(/\/$/, "");
      const phoneDigits = to.replace(/\D/g, "") || to;
      const phoneE164 = to.startsWith("+") ? to : `+${phoneDigits}`;
      try {
        let sourceId: string | null = null;
        let contactId: number | null = null;
        const createContactRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            inbox_id: inboxId,
            phone_number: phoneE164,
            identifier: phoneDigits,
          }),
        });
        const contactData = await createContactRes.json().catch(() => ({}));
        const contactPayload = contactData?.payload ?? contactData;
        const payloadContact = contactPayload?.contact ?? contactPayload;
        contactId = payloadContact?.id ?? contactPayload?.id ?? null;
        const contactInboxes = contactPayload?.contact_inboxes ?? payloadContact?.contact_inboxes ?? contactData?.contact_inboxes ?? [];
        if (createContactRes.ok && contactInboxes.length > 0) {
          const inboxMatch = contactInboxes.find((ci: { inbox?: { id: number } }) => ci.inbox?.id === inboxId);
          sourceId = (inboxMatch?.source_id ?? contactInboxes[0]?.source_id) ?? null;
        }
        if (createContactRes.ok && !sourceId && contactId) {
          const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contactId}/contact_inboxes`, {
            method: "POST",
            headers,
            body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
          });
          const cibData = await createCibRes.json().catch(() => ({}));
          const cibPayload = cibData?.payload ?? cibData;
          sourceId = cibPayload?.source_id ?? phoneDigits;
        }
        if (!sourceId && (createContactRes.status === 422 || createContactRes.status === 404)) {
          const searchRes = await fetch(
            `${apiBase}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneDigits)}`,
            { headers }
          );
          const searchData = await searchRes.json().catch(() => ({}));
          const list = searchData?.payload ?? searchData?.data ?? searchData;
          const contacts = Array.isArray(list) ? list : list?.contacts ?? [];
          const contact = contacts.find((c: { contact_inboxes?: Array<{ source_id: string; inbox?: { id: number } }> }) =>
            (c.contact_inboxes ?? []).some((ci: { inbox?: { id: number } }) => ci.inbox?.id === inboxId)
          ) ?? contacts[0];
          const ci = contact?.contact_inboxes ?? [];
          if (ci.length > 0) {
            const inboxMatch = ci.find((cib: { inbox?: { id: number } }) => cib.inbox?.id === inboxId);
            sourceId = inboxMatch?.source_id ?? ci[0]?.source_id ?? null;
          }
          if (!sourceId && contact?.id) {
            const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contact.id}/contact_inboxes`, {
              method: "POST",
              headers,
              body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
            });
            const cibData = await createCibRes.json().catch(() => ({}));
            const cibPayload = cibData?.payload ?? cibData;
            sourceId = cibPayload?.source_id ?? phoneDigits;
          }
        }
        if (!sourceId) {
          sourceId = phoneDigits;
        }
        const convRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/conversations`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            source_id: sourceId,
            inbox_id: inboxId,
            message: { content: message },
          }),
        });
        const convData = await convRes.json().catch(() => ({}));
        if (!convRes.ok) {
          return { ok: false, error: convData?.message || convData?.errors?.[0]?.message || String(convRes.status) };
        }
        const conversationId = convData?.id ?? convData?.payload?.id;
        return { ok: true, externalId: conversationId != null ? String(conversationId) : undefined };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    case "evolution_api": {
      const baseUrl = (channelConfig.base_url as string) || "";
      const instance = (channelConfig.instance as string) || "";
      if (!baseUrl || !instance || !to) return { ok: false, error: "Evolution API: config ou destinatário ausente" };
      try {
        const cleanPhone = to.replace(/\D/g, "");
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              number: cleanPhone,
              text: message,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data?.error || res.statusText };
        return { ok: true, externalId: data?.key?.id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    case "webhook": {
      const url = (channelConfig.url as string) || "";
      if (!url) return { ok: false, error: "Webhook: URL ausente" };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, message, reservation_id: _reservationId }),
        });
        if (!res.ok) return { ok: false, error: await res.text() };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    default:
      return { ok: false, error: `Canal não suportado: ${channel}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let reservationIds: string[] = [];
    let intent:
      | "checkin_reminder"
      | "payment_pending"
      | "checkout_reminder"
      | "reservation_modified"
      | "reservation_cancelled"
      | "reservation_overbooking"
      | undefined;
    let phoneOverrides: Record<string, string> | undefined;
    let templateIdOverride: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        if (body.reservation_id) reservationIds = [body.reservation_id];
        else if (Array.isArray(body.reservation_ids)) reservationIds = body.reservation_ids;
        if (
          body.intent &&
          [
            "checkin_reminder",
            "payment_pending",
            "checkout_reminder",
            "reservation_modified",
            "reservation_cancelled",
            "reservation_overbooking",
          ].includes(body.intent)
        ) {
          intent = body.intent;
        }
        if (body.phone_overrides && typeof body.phone_overrides === "object" && !Array.isArray(body.phone_overrides)) {
          phoneOverrides = body.phone_overrides as Record<string, string>;
        }
        if (body.template_id_override && typeof body.template_id_override === "string") {
          templateIdOverride = body.template_id_override;
        }
      } catch {
        // empty body
      }
    }

    if (reservationIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Informe reservation_id ou reservation_ids[]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("features_enabled")
      .eq("id", SITE_SETTINGS_ID)
      .single();

    const pmsBaseUrl =
      (await supabase.from("site_settings").select("pms_base_url").eq("id", SITE_SETTINGS_ID).single()).data?.pms_base_url as string | null ||
      req.headers.get("origin") ||
      req.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
      "https://localhost";

    const baseUrl = pmsBaseUrl.replace(/\/$/, "");
    const results: Array<{ reservation_id: string; success: boolean; checkin_charge_id?: string; error?: string }> = [];

    for (const reservationId of reservationIds) {
      try {
        const { data: reservation, error: resErr } = await supabase
          .from("reservations")
          .select(`
            id, establishment_id, reservation_code, checkin_date, checkout_date,
            total_amount, paid_amount, status, guest_id, client_id, guest_name,
            ota_reservations ( ota_guest_name, ota_guest_phone )
          `)
          .eq("id", reservationId)
          .single();

        if (resErr || !reservation) {
          results.push({ reservation_id: reservationId, success: false, error: "Reserva não encontrada" });
          continue;
        }

        const allowedStatuses = ["pending", "unpaid", "confirmed", "checkedin"];
        const statusOk =
          allowedStatuses.includes(reservation.status) ||
          (intent === "reservation_cancelled" && reservation.status === "cancelled");
        if (!statusOk) {
          results.push({ reservation_id: reservationId, success: false, error: "Reserva não está em status permitido para envio (pendente, não paga, confirmada ou com check-in)" });
          continue;
        }

        const establishmentId = reservation.establishment_id;
        const { data: establishment } = await supabase
          .from("establishments")
          .select("company_id, name")
          .eq("id", establishmentId)
          .single();

        const companyId = establishment?.company_id;
        const establishmentName = (establishment?.name as string) || "Estabelecimento";

        let establishmentAddress = "";
        const { data: hotelSettings } = await supabase
          .from("hotel_settings")
          .select("street, number, neighborhood, city, state, zip_code")
          .eq("establishment_id", establishmentId)
          .maybeSingle();
        if (hotelSettings) {
          const parts = [
            hotelSettings.street,
            hotelSettings.number,
            hotelSettings.neighborhood,
            hotelSettings.city,
            hotelSettings.state,
            hotelSettings.zip_code,
          ].filter(Boolean);
          establishmentAddress = parts.join(", ").trim();
        }
        if (!companyId) {
          results.push({ reservation_id: reservationId, success: false, error: "Estabelecimento sem empresa" });
          continue;
        }

        const fe = (siteSettings?.features_enabled as Record<string, unknown>)?.checkin_charge_enabled as { enabled?: boolean; company_ids?: string[] } | undefined;
        const featureEnabled = fe?.enabled === true && (!fe?.company_ids?.length || fe.company_ids.includes(companyId));
        if (!featureEnabled) {
          results.push({ reservation_id: reservationId, success: false, error: "Cobrança de check-in não habilitada para esta empresa" });
          continue;
        }

        const { data: config, error: configErr } = await supabase
          .from("checkin_charge_config")
          .select("*")
          .eq("establishment_id", establishmentId)
          .single();

        if (configErr || !config || !config.enabled) {
          results.push({ reservation_id: reservationId, success: false, error: "Configuração de cobrança de check-in não ativa" });
          continue;
        }

        let amount = 0;
        const total = Number(reservation.total_amount) || 0;
        if (config.amount_type === "total") amount = total;
        else if (config.amount_type === "percent" && config.amount_value != null) amount = (total * Number(config.amount_value)) / 100;
        else if (config.amount_type === "fixed" && config.amount_value != null) amount = Number(config.amount_value);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (config.due_date_days ?? 3));
        const dueDateStr = dueDate.toISOString().split("T")[0];

        let paymentLink: string;
        let paymentToken: string;
        let paymentExpiresAt: Date;
        const expiresDays = config.payment_link_expires_days ?? 7;

        const stripeRes = await fetch(
          `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/stripe-payment`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              establishment_id: establishmentId,
              amount: amount,
              payment_type: "reservation",
              reservation_id: reservationId,
              guest_id: reservation.guest_id || reservation.client_id || undefined,
              description: `Cobrança de check-in - Reserva ${reservation.reservation_code || reservationId.slice(0, 8)}`,
            }),
          }
        );
        const stripeData = await stripeRes.json().catch(() => ({}));
        const paymentIntentId = stripeData?.payment_intent_id as string | undefined;

        if (paymentIntentId) {
          paymentLink = `${baseUrl}/payment/${paymentIntentId}`;
          paymentToken = paymentIntentId;
          paymentExpiresAt = new Date();
          paymentExpiresAt.setHours(paymentExpiresAt.getHours() + 24);
        } else {
          paymentToken = generateSecureToken();
          paymentExpiresAt = new Date();
          paymentExpiresAt.setDate(paymentExpiresAt.getDate() + expiresDays);
          paymentLink = `${baseUrl}/payment/checkin/${paymentToken}`;
        }

        let webCheckinLocator: string | null = null;
        const { data: webCheckin } = await supabase
          .from("web_checkin")
          .select("locator")
          .eq("reservation_id", reservationId)
          .maybeSingle();
        if (webCheckin?.locator) {
          webCheckinLocator = webCheckin.locator;
        } else {
          // Criar web_checkin para que o link esteja disponível no envio do lembrete (variável {{web_checkin_link}})
          const reservationCode = (reservation.reservation_code as string) || reservationId.slice(0, 8);
          const locatorToUse = reservationCode.trim() || `WC-${reservationId.slice(0, 8)}`;
          const webCheckinToken = generateSecureToken();
          const checkoutDate = reservation.checkout_date ? new Date(reservation.checkout_date) : null;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          if (checkoutDate && checkoutDate > expiresAt) expiresAt.setTime(checkoutDate.getTime());
          const { data: created } = await supabase
            .from("web_checkin")
            .insert({
              reservation_id: reservationId,
              establishment_id: reservation.establishment_id,
              token: webCheckinToken,
              locator: locatorToUse,
              status: "pending",
              expires_at: expiresAt.toISOString(),
            })
            .select("locator")
            .maybeSingle();
          if (created?.locator) webCheckinLocator = created.locator;
        }
        const webCheckinLink = webCheckinLocator ? `${baseUrl}/web-checkin/${webCheckinLocator}` : "";

        const otaList = reservation.ota_reservations as
          | { ota_guest_name?: string | null; ota_guest_phone?: string | null }[]
          | null
          | undefined;
        const ota = Array.isArray(otaList) && otaList.length > 0 ? otaList[0] : null;

        const idSet = [...new Set([reservation.guest_id, reservation.client_id].filter(Boolean))] as string[];
        let guestRow: { full_name: string | null; phone: string | null } | null = null;
        let finRow: { full_name: string | null; phone: string | null } | null = null;
        if (idSet.length > 0) {
          const { data: clientRows } = await supabase
            .from("clients")
            .select("id, full_name, phone")
            .in("id", idSet);
          const byId = new Map<string, { id: string; full_name: string | null; phone: string | null }>(
            (clientRows ?? []).map((c: { id: string; full_name: string | null; phone: string | null }) => [c.id, c])
          );
          if (reservation.guest_id) guestRow = byId.get(reservation.guest_id as string) ?? null;
          if (reservation.client_id) finRow = byId.get(reservation.client_id as string) ?? null;
        }

        const guestName =
          (guestRow?.full_name && String(guestRow.full_name).trim()) ||
          (finRow?.full_name && String(finRow.full_name).trim()) ||
          (ota?.ota_guest_name && String(ota.ota_guest_name).trim()) ||
          (reservation.guest_name && String(reservation.guest_name).trim()) ||
          "Hóspede";

        const guestPhoneFromDb =
          (guestRow?.phone && String(guestRow.phone).trim()) ||
          (finRow?.phone && String(finRow.phone).trim()) ||
          (ota?.ota_guest_phone && String(ota.ota_guest_phone).trim()) ||
          "";
        const checkinDateStr = reservation.checkin_date
          ? new Date(reservation.checkin_date).toISOString().split("T")[0]
          : "";
        const checkinDateFormatted = reservation.checkin_date
          ? new Date(reservation.checkin_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        const checkoutDateFormatted = reservation.checkout_date
          ? new Date(reservation.checkout_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";

        const reservationCode = reservation.reservation_code || reservationId.slice(0, 8);
        const vars: Record<string, string> = {
          guest_name: guestName,
          reservation_code: reservationCode,
          localizador: reservationCode,
          checkin_date: checkinDateFormatted || checkinDateStr,
          checkout_date: checkoutDateFormatted,
          amount: amount.toFixed(2),
          payment_link: paymentLink,
          web_checkin_link: webCheckinLink || "(link será enviado após pagamento)",
          establishment_name: establishmentName,
          establishment_address: establishmentAddress,
        };

        const templateSource = (config.template_source as string) || "internal";
        let templateId = config.template_id;
        if (templateSource === "internal" && !templateIdOverride && intent) {
          const intentId =
            intent === "checkin_reminder" ? config.template_id_reminder
            : intent === "payment_pending" ? config.template_id_payment
            : intent === "checkout_reminder" ? config.template_id_checkout
            : intent === "reservation_modified" ? config.template_id_modified
            : intent === "reservation_cancelled" ? config.template_id_cancelled
            : config.template_id_overbooking;
          if (intentId) templateId = intentId;
        }
        if (templateSource === "internal" && templateIdOverride) {
          templateId = templateIdOverride;
        }
        let bodyText = `Olá {{guest_name}} 👋

Sua reserva está confirmada!

📌 Localizador: {{reservation_code}}
Check-in: {{checkin_date}}
Check-out: {{checkout_date}}

Para garantir sua entrada, realize o pagamento e check-in online no link abaixo:

🔗 {{payment_link}}

Qualquer dúvida, responda esta mensagem.`;
        if (templateSource === "internal" && templateId) {
          const { data: template } = await supabase
            .from("checkin_charge_templates")
            .select("body")
            .eq("id", templateId)
            .single();
          if (template?.body) bodyText = template.body;
        }

        let message = replaceTemplateVariables(bodyText, vars);

        if (templateSource === "chatwoot" && (config.chatwoot_canned_response_id != null || config.chatwoot_canned_response_short_code)) {
          const cc = config.channel_config as Record<string, unknown>;
          const baseUrl = String(cc?.base_url || "").replace(/\/$/, "");
          const accountId = Number(cc?.account_id) || 0;
          const apiKey = (cc?.api_key as string) || "";
          if (baseUrl && apiKey) {
            try {
              const crRes = await fetch(
                `${baseUrl}/api/v1/accounts/${accountId}/canned_responses`,
                { headers: { "api_access_token": apiKey, "Content-Type": "application/json" } }
              );
              const crData = await crRes.json().catch(() => ({}));
              const list = (crData?.payload ?? crData ?? []) as Array<{ id: number; short_code: string; content: string }>;
              const canned = Array.isArray(list)
                ? list.find(
                  (c) =>
                    config.chatwoot_canned_response_id != null && c.id === config.chatwoot_canned_response_id ||
                    config.chatwoot_canned_response_short_code && (c.short_code === config.chatwoot_canned_response_short_code || String(c.id) === config.chatwoot_canned_response_short_code)
                )
                : undefined;
              if (canned?.content) message = replaceTemplateVariables(canned.content, vars);
            } catch {
              /* keep message from default/internal */
            }
          }
        }

        const toRaw = (phoneOverrides?.[reservationId] ?? guestPhoneFromDb ?? "").trim();
        const to = normalizePhoneForWhatsApp(toRaw);

        if (!to) {
          results.push({ reservation_id: reservationId, success: false, error: "Telefone do hóspede não encontrado ou inválido" });
          continue;
        }

        const channelConfig = (config.channel_config as Record<string, unknown>) || {};
        let sendResult: { ok: boolean; externalId?: string; error?: string };

        const selectedMeta = resolveMetaTemplateForIntent(config as Record<string, unknown>, intent, channelConfig);
        if (templateSource === "meta" && selectedMeta.name) {
          const bodyParams = selectedMeta.variables.map((key) => vars[key] ?? "");
          if (config.channel === "chatwoot") {
            sendResult = await sendViaChatwootMetaTemplate(channelConfig, to, selectedMeta.name, selectedMeta.language, bodyParams);
          } else {
            sendResult = await sendViaChannelMetaTemplate(channelConfig, to, selectedMeta.name, selectedMeta.language, bodyParams);
          }
        } else {
          sendResult = await sendViaChannel(config.channel, channelConfig, to, message, reservationId);
        }

        const chargePayload = {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          guest_id: reservation.guest_id || reservation.client_id,
          amount,
          status: "pending",
          due_date: dueDateStr,
          payment_link_token: paymentToken,
          payment_link_expires_at: paymentExpiresAt.toISOString(),
          checkin_link_locator: webCheckinLocator,
          sent_at: sendResult.ok ? new Date().toISOString() : null,
          channel_used: sendResult.ok ? config.channel : null,
          template_id: templateId || null,
        };

        const { data: charge, error: chargeErr } = await supabase
          .from("checkin_charges")
          .upsert(chargePayload, { onConflict: "reservation_id" })
          .select("id")
          .single();

        if (chargeErr) {
          results.push({ reservation_id: reservationId, success: false, error: chargeErr.message });
          continue;
        }

        await supabase.from("checkin_charge_logs").insert({
          checkin_charge_id: charge.id,
          event: sendResult.ok ? "sent" : "failed",
          channel: config.channel,
          payload: sendResult.ok ? { external_id: sendResult.externalId } : { error: sendResult.error },
        });

        results.push({
          reservation_id: reservationId,
          success: sendResult.ok,
          checkin_charge_id: charge.id,
          error: sendResult.ok ? undefined : sendResult.error,
        });
      } catch (e) {
        results.push({
          reservation_id: reservationId,
          success: false,
          error: (e as Error).message,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
