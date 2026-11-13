import { randomBytes } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

const INTENTS = [
  "checkin_reminder",
  "payment_pending",
  "checkout_reminder",
  "reservation_modified",
  "reservation_cancelled",
  "reservation_overbooking",
] as const;

type ChargeIntent = (typeof INTENTS)[number];

type SendResult = { ok: boolean; externalId?: string; error?: string };

type ChargeResult = { reservation_id: string; success: boolean; checkin_charge_id?: string; error?: string };

function replaceTemplateVariables(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), value ?? "");
  }
  return out;
}

function generateSecureToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizePhoneForWhatsApp(phone: string, defaultCountryCode = "55"): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";
  const len = digits.length;
  if (len >= 12 && (digits.startsWith(defaultCountryCode) || digits.startsWith("55"))) return digits;
  if (len === 10 || len === 11) return `${defaultCountryCode}${digits}`;
  if (len >= 12) return digits;
  return `${defaultCountryCode}${digits}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function nestedMessage(data: unknown, fallback: string): string {
  const record = asRecord(data);
  const error = record.error;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const message = asRecord(error).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof record.message === "string" && record.message) return record.message;
  const errors = asArray(record.errors);
  const first = asRecord(errors[0]).message;
  if (typeof first === "string" && first) return first;
  return fallback;
}

function parseCsvVariables(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return fallback;
  const parsed = value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function resolveMetaTemplateForIntent(
  config: Record<string, unknown>,
  intent: string | undefined,
  channelConfig: Record<string, unknown>,
): { name: string | null; language: string; variables: string[] } {
  const defaultVars = [
    "guest_name",
    "reservation_code",
    "checkin_date",
    "amount",
    "payment_link",
    "web_checkin_link",
    "establishment_name",
    "establishment_address",
  ];
  const byIntent = asRecord(channelConfig.meta_templates_by_intent);
  const intentKey =
    intent === "checkin_reminder" ||
    intent === "payment_pending" ||
    intent === "checkout_reminder" ||
    intent === "reservation_modified" ||
    intent === "reservation_cancelled" ||
    intent === "reservation_overbooking"
      ? intent
      : "fallback";
  const selected = asRecord(byIntent[intentKey] ?? byIntent.fallback);
  const selectedName = typeof selected.name === "string" ? selected.name.trim() : "";
  const configName = typeof config.meta_template_name === "string" ? config.meta_template_name.trim() : "";
  const selectedLanguage = typeof selected.language === "string" ? selected.language.trim() : "";
  const configLanguage = typeof config.meta_template_language === "string" ? config.meta_template_language.trim() : "";
  return {
    name: selectedName || configName || null,
    language: selectedLanguage || configLanguage || "pt_BR",
    variables: parseCsvVariables(selected.variables ?? config.meta_template_body_variables, defaultVars),
  };
}

function configId(value: unknown): number {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(num) ? num : 0;
}

function formatPtBrDate(value: Date | null | undefined): string {
  if (!value) return "";
  const ymd = value.toISOString().slice(0, 10);
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

type InboxRef = { source_id?: string; inbox?: { id?: number } };
type ContactLike = { id?: number; contact_inboxes?: InboxRef[] };

function contactFromPayload(data: unknown): { contact: ContactLike; inboxes: InboxRef[] } {
  const root = asRecord(data);
  const payload = asRecord(root.payload ?? data);
  const contact = asRecord(payload.contact ?? payload);
  const inboxes = asArray(payload.contact_inboxes ?? contact.contact_inboxes ?? root.contact_inboxes).map((item) => {
    const row = asRecord(item);
    const inbox = asRecord(row.inbox);
    return {
      source_id: typeof row.source_id === "string" ? row.source_id : undefined,
      inbox: { id: typeof inbox.id === "number" ? inbox.id : undefined },
    };
  });
  const id = typeof contact.id === "number" ? contact.id : typeof payload.id === "number" ? payload.id : undefined;
  return { contact: { id, contact_inboxes: inboxes }, inboxes };
}

async function resolveChatwootSource(
  channelConfig: Record<string, unknown>,
  to: string,
): Promise<{ ok: true; sourceId: string; apiBase: string; accountId: number; inboxId: number; headers: Record<string, string> } | { ok: false; error: string }> {
  const baseUrl = typeof channelConfig.base_url === "string" ? channelConfig.base_url : "";
  const accountId = configId(channelConfig.account_id);
  const inboxId = configId(channelConfig.inbox_id);
  const apiKey = typeof channelConfig.api_key === "string" ? channelConfig.api_key : "";
  if (!baseUrl || !apiKey || !to) return { ok: false, error: "Chatwoot: config ou destinatário ausente" };
  const headers = { api_access_token: apiKey, "Content-Type": "application/json" };
  const apiBase = baseUrl.replace(/\/$/, "");
  const phoneDigits = to.replace(/\D/g, "") || to;
  const phoneE164 = to.startsWith("+") ? to : `+${phoneDigits}`;

  let sourceId: string | null = null;
  let contactId: number | null = null;
  const createContactRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inbox_id: inboxId, phone_number: phoneE164, identifier: phoneDigits }),
  });
  const created = contactFromPayload(await readJson(createContactRes));
  contactId = created.contact.id ?? null;
  if (createContactRes.ok && created.inboxes.length > 0) {
    const inboxMatch = created.inboxes.find((item) => item.inbox?.id === inboxId);
    sourceId = inboxMatch?.source_id ?? created.inboxes[0]?.source_id ?? null;
  }
  if (createContactRes.ok && !sourceId && contactId) {
    const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contactId}/contact_inboxes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
    });
    const cibRaw = await readJson(createCibRes);
    const cib = asRecord(asRecord(cibRaw).payload ?? cibRaw);
    sourceId = typeof cib.source_id === "string" ? cib.source_id : phoneDigits;
  }
  if (!sourceId && (createContactRes.status === 422 || createContactRes.status === 404)) {
    const searchRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneDigits)}`, { headers });
    const searchData = asRecord(await readJson(searchRes));
    const list = searchData.payload ?? searchData.data ?? searchData;
    const contacts = asArray(Array.isArray(list) ? list : asRecord(list).contacts).map((item) => contactFromPayload(item).contact);
    const contact =
      contacts.find((item) => (item.contact_inboxes ?? []).some((inbox) => inbox.inbox?.id === inboxId)) ?? contacts[0];
    const inboxes = contact?.contact_inboxes ?? [];
    if (inboxes.length > 0) {
      const inboxMatch = inboxes.find((item) => item.inbox?.id === inboxId);
      sourceId = inboxMatch?.source_id ?? inboxes[0]?.source_id ?? null;
    }
    if (!sourceId && contact?.id) {
      const createCibRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/contacts/${contact.id}/contact_inboxes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inbox_id: inboxId, source_id: phoneDigits }),
      });
      const cibPayload = asRecord(await readJson(createCibRes));
      const cib = asRecord(cibPayload.payload ?? cibPayload);
      sourceId = typeof cib.source_id === "string" ? cib.source_id : phoneDigits;
    }
  }
  return { ok: true, sourceId: sourceId || phoneDigits, apiBase, accountId, inboxId, headers };
}

async function sendViaChannelMetaTemplate(
  channelConfig: Record<string, unknown>,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<SendResult> {
  const phone = typeof channelConfig.phone_id === "string" ? channelConfig.phone_id : "";
  const token = typeof channelConfig.access_token === "string" ? channelConfig.access_token : "";
  if (!token || !to) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
  try {
    const bodyParams = bodyParameters.map((text) => ({ type: "text" as const, text }));
    const res = await fetch(`https://graph.facebook.com/v18.0/${phone}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: bodyParams.length ? [{ type: "body", parameters: bodyParams }] : [],
        },
      }),
    });
    const data = await readJson(res);
    if (!res.ok) return { ok: false, error: nestedMessage(data, res.statusText) };
    const externalId = asRecord(asArray(asRecord(data).messages)[0]).id;
    return { ok: true, externalId: typeof externalId === "string" ? externalId : undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function sendViaChatwootMetaTemplate(
  channelConfig: Record<string, unknown>,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<SendResult> {
  try {
    const source = await resolveChatwootSource(channelConfig, to);
    if (!source.ok) return source;
    const convRes = await fetch(`${source.apiBase}/api/v1/accounts/${source.accountId}/conversations`, {
      method: "POST",
      headers: source.headers,
      body: JSON.stringify({ source_id: source.sourceId, inbox_id: source.inboxId, message: { content: " " } }),
    });
    const convData = asRecord(await readJson(convRes));
    if (!convRes.ok) return { ok: false, error: nestedMessage(convData, String(convRes.status)) };
    const conversationId = convData.id ?? asRecord(convData.payload).id;
    if (conversationId == null) return { ok: false, error: "Chatwoot: conversa não encontrada" };
    const bodyMap = bodyParameters.reduce<Record<string, string>>((acc, val, idx) => {
      acc[String(idx + 1)] = val ?? "";
      return acc;
    }, {});
    const msgRes = await fetch(`${source.apiBase}/api/v1/accounts/${source.accountId}/conversations/${String(conversationId)}/messages`, {
      method: "POST",
      headers: source.headers,
      body: JSON.stringify({
        content: "Template WhatsApp",
        message_type: "outgoing",
        private: false,
        content_type: "text",
        template_params: {
          name: templateName,
          category: "UTILITY",
          language: languageCode,
          processed_params: { body: bodyMap },
        },
      }),
    });
    const msgData = asRecord(await readJson(msgRes));
    if (!msgRes.ok) return { ok: false, error: nestedMessage(msgData, String(msgRes.status)) };
    const externalId = msgData.id ?? conversationId;
    return { ok: true, externalId: String(externalId) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function sendViaChannel(
  channel: string,
  channelConfig: Record<string, unknown>,
  to: string,
  message: string,
  reservationId: string,
): Promise<SendResult> {
  switch (channel) {
    case "whatsapp_cloud": {
      const phone = typeof channelConfig.phone_id === "string" ? channelConfig.phone_id : "";
      const token = typeof channelConfig.access_token === "string" ? channelConfig.access_token : "";
      if (!token || !to) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
      try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${phone}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to.replace(/\D/g, ""),
            type: "text",
            text: { body: message },
          }),
        });
        const data = await readJson(res);
        if (!res.ok) return { ok: false, error: nestedMessage(data, res.statusText) };
        const externalId = asRecord(asArray(asRecord(data).messages)[0]).id;
        return { ok: true, externalId: typeof externalId === "string" ? externalId : undefined };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    }
    case "chatwoot": {
      try {
        const source = await resolveChatwootSource(channelConfig, to);
        if (!source.ok) return source;
        const convRes = await fetch(`${source.apiBase}/api/v1/accounts/${source.accountId}/conversations`, {
          method: "POST",
          headers: source.headers,
          body: JSON.stringify({ source_id: source.sourceId, inbox_id: source.inboxId, message: { content: message } }),
        });
        const convData = asRecord(await readJson(convRes));
        if (!convRes.ok) return { ok: false, error: nestedMessage(convData, String(convRes.status)) };
        const conversationId = convData.id ?? asRecord(convData.payload).id;
        return { ok: true, externalId: conversationId != null ? String(conversationId) : undefined };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    }
    case "evolution_api": {
      const baseUrl = typeof channelConfig.base_url === "string" ? channelConfig.base_url : "";
      const instance = typeof channelConfig.instance === "string" ? channelConfig.instance : "";
      if (!baseUrl || !instance || !to) return { ok: false, error: "Evolution API: config ou destinatário ausente" };
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: to.replace(/\D/g, ""), text: message }),
        });
        const data = asRecord(await readJson(res));
        if (!res.ok) return { ok: false, error: nestedMessage(data, res.statusText) };
        const externalId = asRecord(data.key).id;
        return { ok: true, externalId: typeof externalId === "string" ? externalId : undefined };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    }
    case "webhook": {
      const url = typeof channelConfig.url === "string" ? channelConfig.url : "";
      if (!url) return { ok: false, error: "Webhook: URL ausente" };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, message, reservation_id: reservationId }),
        });
        if (!res.ok) return { ok: false, error: await res.text() };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    }
    default:
      return { ok: false, error: `Canal não suportado: ${channel}` };
  }
}

@Injectable()
export class CheckinChargeService {
  private readonly logger = new Logger(CheckinChargeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(body: unknown): Promise<{ status: number; body: unknown }> {
    try {
      const payload = asRecord(body);
      let reservationIds: string[] = [];
      let intent: ChargeIntent | undefined;
      let phoneOverrides: Record<string, string> | undefined;
      let templateIdOverride: string | undefined;

      if (typeof payload.reservation_id === "string" && payload.reservation_id) reservationIds = [payload.reservation_id];
      else if (Array.isArray(payload.reservation_ids)) {
        reservationIds = payload.reservation_ids.filter((item): item is string => typeof item === "string" && item.length > 0);
      }
      if (typeof payload.intent === "string" && (INTENTS as readonly string[]).includes(payload.intent)) {
        intent = payload.intent as ChargeIntent;
      }
      if (payload.phone_overrides && typeof payload.phone_overrides === "object" && !Array.isArray(payload.phone_overrides)) {
        phoneOverrides = payload.phone_overrides as Record<string, string>;
      }
      if (typeof payload.template_id_override === "string") templateIdOverride = payload.template_id_override;

      if (reservationIds.length === 0) {
        return { status: 400, body: { error: "Informe reservation_id ou reservation_ids[]" } };
      }

      const siteSettings = await this.prisma.site_settings.findUnique({
        where: { id: SITE_SETTINGS_ID },
        select: { features_enabled: true, pms_base_url: true },
      });
      const baseUrl = (siteSettings?.pms_base_url || "https://localhost").replace(/\/$/, "");
      const results: ChargeResult[] = [];

      for (const reservationId of reservationIds) {
        try {
          const outcome = await this.sendOne({
            reservationId,
            intent,
            phoneOverrides,
            templateIdOverride,
            baseUrl,
            features: siteSettings?.features_enabled ?? null,
          });
          results.push(outcome);
        } catch (error) {
          results.push({ reservation_id: reservationId, success: false, error: errorMessage(error) });
        }
      }

      return { status: 200, body: { success: true, results } };
    } catch (error) {
      this.logger.error(`send-checkin-charge: ${errorMessage(error)}`);
      return { status: 500, body: { error: errorMessage(error) } };
    }
  }

  private async sendOne(input: {
    reservationId: string;
    intent: ChargeIntent | undefined;
    phoneOverrides: Record<string, string> | undefined;
    templateIdOverride: string | undefined;
    baseUrl: string;
    features: Prisma.JsonValue | null;
  }): Promise<ChargeResult> {
    const { reservationId, intent, phoneOverrides, templateIdOverride, baseUrl } = input;
    const reservation = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        establishment_id: true,
        reservation_code: true,
        checkin_date: true,
        checkout_date: true,
        total_amount: true,
        status: true,
        guest_id: true,
        client_id: true,
        guest_name: true,
        ota_reservations: { select: { ota_guest_name: true, ota_guest_phone: true } },
      },
    });
    if (!reservation) return { reservation_id: reservationId, success: false, error: "Reserva não encontrada" };

    const allowedStatuses = ["pending", "unpaid", "confirmed", "checkedin"];
    const statusOk = allowedStatuses.includes(reservation.status) || (intent === "reservation_cancelled" && reservation.status === "cancelled");
    if (!statusOk) {
      return {
        reservation_id: reservationId,
        success: false,
        error: "Reserva não está em status permitido para envio (pendente, não paga, confirmada ou com check-in)",
      };
    }

    const establishmentId = reservation.establishment_id;
    const establishment = establishmentId
      ? await this.prisma.establishments.findUnique({
          where: { id: establishmentId },
          select: { company_id: true, name: true },
        })
      : null;
    const companyId = establishment?.company_id;
    const establishmentName = establishment?.name || "Estabelecimento";

    let establishmentAddress = "";
    if (establishmentId) {
      const hotelSettings = await this.prisma.hotel_settings.findFirst({
        where: { establishment_id: establishmentId },
        select: { street: true, number: true, neighborhood: true, city: true, state: true, zip_code: true },
      });
      if (hotelSettings) {
        establishmentAddress = [hotelSettings.street, hotelSettings.number, hotelSettings.neighborhood, hotelSettings.city, hotelSettings.state, hotelSettings.zip_code]
          .filter(Boolean)
          .join(", ")
          .trim();
      }
    }
    if (!companyId || !establishmentId) {
      return { reservation_id: reservationId, success: false, error: "Estabelecimento sem empresa" };
    }

    const featureRecord = asRecord(input.features);
    const feature = asRecord(featureRecord.checkin_charge_enabled);
    const companyIds = asArray(feature.company_ids).filter((item): item is string => typeof item === "string");
    const featureEnabled = feature.enabled === true && (companyIds.length === 0 || companyIds.includes(companyId));
    if (!featureEnabled) {
      return { reservation_id: reservationId, success: false, error: "Cobrança de check-in não habilitada para esta empresa" };
    }

    const config = await this.prisma.checkin_charge_config.findUnique({ where: { establishment_id: establishmentId } });
    if (!config || !config.enabled) {
      return { reservation_id: reservationId, success: false, error: "Configuração de cobrança de check-in não ativa" };
    }

    let amount = 0;
    const total = Number(reservation.total_amount) || 0;
    if (config.amount_type === "total") amount = total;
    else if (config.amount_type === "percent" && config.amount_value != null) amount = (total * Number(config.amount_value)) / 100;
    else if (config.amount_type === "fixed" && config.amount_value != null) amount = Number(config.amount_value);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (config.due_date_days ?? 3));
    const dueDateStr = dueDate.toISOString().split("T")[0];
    const expiresDays = config.payment_link_expires_days ?? 7;

    const paymentIntentId = await this.createStripePaymentIntent({
      establishmentId,
      amount,
      reservationId,
      guestId: reservation.guest_id || reservation.client_id,
      description: `Cobrança de check-in - Reserva ${reservation.reservation_code || reservationId.slice(0, 8)}`,
    });

    let paymentLink: string;
    let paymentToken: string;
    let paymentExpiresAt: Date;
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
    const webCheckin = await this.prisma.web_checkin.findUnique({
      where: { reservation_id: reservationId },
      select: { locator: true },
    });
    if (webCheckin?.locator) {
      webCheckinLocator = webCheckin.locator;
    } else {
      const reservationCode = reservation.reservation_code || reservationId.slice(0, 8);
      const locatorToUse = reservationCode.trim() || `WC-${reservationId.slice(0, 8)}`;
      const checkoutDate = reservation.checkout_date ? new Date(reservation.checkout_date) : null;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      if (checkoutDate && checkoutDate > expiresAt) expiresAt.setTime(checkoutDate.getTime());
      try {
        const created = await this.prisma.web_checkin.create({
          data: {
            reservation_id: reservationId,
            establishment_id: reservation.establishment_id,
            token: generateSecureToken(),
            locator: locatorToUse,
            status: "pending",
            expires_at: expiresAt,
          },
          select: { locator: true },
        });
        webCheckinLocator = created.locator;
      } catch (error) {
        this.logger.warn(`web_checkin não criado para ${reservationId}: ${errorMessage(error)}`);
      }
    }
    const webCheckinLink = webCheckinLocator ? `${baseUrl}/web-checkin/${webCheckinLocator}` : "";

    const ota = reservation.ota_reservations[0] ?? null;
    const idSet = [...new Set([reservation.guest_id, reservation.client_id].filter((id): id is string => !!id))];
    const clientRows = idSet.length
      ? await this.prisma.clients.findMany({
          where: { id: { in: idSet } },
          select: { id: true, full_name: true, phone: true },
        })
      : [];
    const byId = new Map(clientRows.map((client) => [client.id, client]));
    const guestRow = reservation.guest_id ? byId.get(reservation.guest_id) ?? null : null;
    const finRow = reservation.client_id ? byId.get(reservation.client_id) ?? null : null;
    const guestName =
      guestRow?.full_name?.trim() || finRow?.full_name?.trim() || ota?.ota_guest_name?.trim() || reservation.guest_name?.trim() || "Hóspede";
    const guestPhoneFromDb = guestRow?.phone?.trim() || finRow?.phone?.trim() || ota?.ota_guest_phone?.trim() || "";
    const checkinDateStr = reservation.checkin_date ? reservation.checkin_date.toISOString().split("T")[0] : "";
    const reservationCode = reservation.reservation_code || reservationId.slice(0, 8);
    const vars: Record<string, string> = {
      guest_name: guestName,
      reservation_code: reservationCode,
      localizador: reservationCode,
      checkin_date: formatPtBrDate(reservation.checkin_date) || checkinDateStr,
      checkout_date: formatPtBrDate(reservation.checkout_date),
      amount: amount.toFixed(2),
      payment_link: paymentLink,
      web_checkin_link: webCheckinLink || "(link será enviado após pagamento)",
      establishment_name: establishmentName,
      establishment_address: establishmentAddress,
    };

    const templateSource = config.template_source || "internal";
    let templateId = config.template_id;
    if (templateSource === "internal" && !templateIdOverride && intent) {
      const intentId =
        intent === "checkin_reminder"
          ? config.template_id_reminder
          : intent === "payment_pending"
            ? config.template_id_payment
            : intent === "checkout_reminder"
              ? config.template_id_checkout
              : intent === "reservation_modified"
                ? config.template_id_modified
                : intent === "reservation_cancelled"
                  ? config.template_id_cancelled
                  : config.template_id_overbooking;
      if (intentId) templateId = intentId;
    }
    if (templateSource === "internal" && templateIdOverride) templateId = templateIdOverride;

    let bodyText = `Olá {{guest_name}} 👋

Sua reserva está confirmada!

📌 Localizador: {{reservation_code}}
Check-in: {{checkin_date}}
Check-out: {{checkout_date}}

Para garantir sua entrada, realize o pagamento e check-in online no link abaixo:

🔗 {{payment_link}}

Qualquer dúvida, responda esta mensagem.`;
    if (templateSource === "internal" && templateId) {
      const template = await this.prisma.checkin_charge_templates.findUnique({
        where: { id: templateId },
        select: { body: true },
      });
      if (template?.body) bodyText = template.body;
    }
    let message = replaceTemplateVariables(bodyText, vars);

    const channelConfig = asRecord(config.channel_config);
    if (templateSource === "chatwoot" && (config.chatwoot_canned_response_id != null || config.chatwoot_canned_response_short_code)) {
      const chatwootBase = String(channelConfig.base_url || "").replace(/\/$/, "");
      const accountId = configId(channelConfig.account_id);
      const apiKey = typeof channelConfig.api_key === "string" ? channelConfig.api_key : "";
      if (chatwootBase && apiKey) {
        try {
          const crRes = await fetch(`${chatwootBase}/api/v1/accounts/${accountId}/canned_responses`, {
            headers: { api_access_token: apiKey, "Content-Type": "application/json" },
          });
          const crData = await readJson(crRes);
          const list = asArray(asRecord(crData).payload ?? crData);
          const canned = list
            .map((item) => asRecord(item))
            .find((item) => {
              const id = typeof item.id === "number" ? item.id : Number(item.id);
              const shortCode = typeof item.short_code === "string" ? item.short_code : "";
              return (
                (config.chatwoot_canned_response_id != null && id === config.chatwoot_canned_response_id) ||
                (config.chatwoot_canned_response_short_code &&
                  (shortCode === config.chatwoot_canned_response_short_code || String(id) === config.chatwoot_canned_response_short_code))
              );
            });
          if (typeof canned?.content === "string" && canned.content) message = replaceTemplateVariables(canned.content, vars);
        } catch {
          // keep the internal/default message
        }
      }
    }

    const toRaw = (phoneOverrides?.[reservationId] ?? guestPhoneFromDb ?? "").trim();
    const to = normalizePhoneForWhatsApp(toRaw);
    if (!to) {
      return { reservation_id: reservationId, success: false, error: "Telefone do hóspede não encontrado ou inválido" };
    }

    const configForMeta: Record<string, unknown> = {
      meta_template_name: config.meta_template_name,
      meta_template_language: config.meta_template_language,
      meta_template_body_variables: config.meta_template_body_variables,
    };
    const selectedMeta = resolveMetaTemplateForIntent(configForMeta, intent, channelConfig);
    let sendResult: SendResult;
    if (templateSource === "meta" && selectedMeta.name) {
      const bodyParams = selectedMeta.variables.map((key) => vars[key] ?? "");
      sendResult =
        config.channel === "chatwoot"
          ? await sendViaChatwootMetaTemplate(channelConfig, to, selectedMeta.name, selectedMeta.language, bodyParams)
          : await sendViaChannelMetaTemplate(channelConfig, to, selectedMeta.name, selectedMeta.language, bodyParams);
    } else {
      sendResult = await sendViaChannel(config.channel, channelConfig, to, message, reservationId);
    }

    const guestId = reservation.guest_id || reservation.client_id;
    const chargeData = {
      establishment_id: establishmentId,
      guest_id: guestId,
      amount,
      status: "pending",
      due_date: new Date(`${dueDateStr}T00:00:00.000Z`),
      payment_link_token: paymentToken,
      payment_link_expires_at: paymentExpiresAt,
      checkin_link_locator: webCheckinLocator,
      sent_at: sendResult.ok ? new Date() : null,
      channel_used: sendResult.ok ? config.channel : null,
      template_id: templateId || null,
    };
    let charge: { id: string };
    try {
      charge = await this.prisma.checkin_charges.upsert({
        where: { reservation_id: reservationId },
        create: { reservation_id: reservationId, ...chargeData },
        update: chargeData,
        select: { id: true },
      });
    } catch (error) {
      return { reservation_id: reservationId, success: false, error: errorMessage(error) };
    }

    try {
      await this.prisma.checkin_charge_logs.create({
        data: {
          checkin_charge_id: charge.id,
          event: sendResult.ok ? "sent" : "failed",
          channel: config.channel,
          payload: (sendResult.ok ? { external_id: sendResult.externalId ?? null } : { error: sendResult.error ?? null }) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(`checkin_charge_logs não gravado: ${errorMessage(error)}`);
    }

    return {
      reservation_id: reservationId,
      success: sendResult.ok,
      checkin_charge_id: charge.id,
      ...(sendResult.ok ? {} : { error: sendResult.error }),
    };
  }

  private async createStripePaymentIntent(input: {
    establishmentId: string;
    amount: number;
    reservationId: string;
    guestId: string | null;
    description: string;
  }): Promise<string | null> {
    try {
      const config = await this.prisma.stripe_establishment_config.findFirst({
        where: { establishment_id: input.establishmentId, is_enabled: true },
      });
      if (!config) return null;
      const globalConfig = await this.prisma.stripe_global_config.findFirst({ select: { test_mode: true } });
      const isTestMode = globalConfig?.test_mode ?? true;
      const secretKey = isTestMode ? config.test_secret_key : config.live_secret_key;
      if (!secretKey) return null;

      let customerId = config.stripe_customer_id;
      if (!customerId && input.guestId) {
        const guest = await this.prisma.clients.findUnique({
          where: { id: input.guestId },
          select: { full_name: true, email: true, phone: true },
        });
        if (guest) {
          const params = new URLSearchParams();
          if (guest.email) params.set("email", guest.email);
          if (guest.full_name) params.set("name", guest.full_name);
          if (guest.phone) params.set("phone", guest.phone);
          params.set("metadata[guest_id]", input.guestId);
          params.set("metadata[establishment_id]", input.establishmentId);
          const customerRes = await fetch("https://api.stripe.com/v1/customers", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secretKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
              "Stripe-Version": "2023-10-16",
            },
            body: params.toString(),
          });
          const customer = asRecord(await readJson(customerRes));
          if (customerRes.ok && typeof customer.id === "string") {
            customerId = customer.id;
            await this.prisma.stripe_establishment_config.update({
              where: { id: config.id },
              data: { stripe_customer_id: customerId },
            });
          }
        }
      }

      const amountInCents = Math.round(Number(input.amount) * 100);
      const paymentParams = new URLSearchParams();
      paymentParams.set("amount", String(amountInCents));
      paymentParams.set("currency", "brl");
      paymentParams.set("description", input.description);
      paymentParams.set("metadata[establishment_id]", input.establishmentId);
      paymentParams.set("metadata[payment_type]", "reservation");
      paymentParams.set("metadata[reservation_id]", input.reservationId);
      paymentParams.set("metadata[quote_id]", "");
      paymentParams.set("metadata[guest_id]", input.guestId || "");
      if (customerId) paymentParams.set("customer", customerId);

      const intentRes = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": "2023-10-16",
        },
        body: paymentParams.toString(),
      });
      const intent = asRecord(await readJson(intentRes));
      if (!intentRes.ok || typeof intent.id !== "string") return null;

      try {
        await this.prisma.stripe_payments.create({
          data: {
            establishment_id: input.establishmentId,
            reservation_id: input.reservationId,
            guest_id: input.guestId,
            stripe_payment_intent_id: intent.id,
            stripe_customer_id: customerId,
            amount: amountInCents,
            currency: "BRL",
            status: typeof intent.status === "string" ? intent.status : "requires_payment_method",
            payment_type: "reservation",
            description: input.description,
            metadata: { payment_intent: intent.id } as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        this.logger.warn(`stripe_payments não gravado: ${errorMessage(error)}`);
      }
      return intent.id;
    } catch (error) {
      this.logger.warn(`Stripe payment intent não criado: ${errorMessage(error)}`);
      return null;
    }
  }
}
