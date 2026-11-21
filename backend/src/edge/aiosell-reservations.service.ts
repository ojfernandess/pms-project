import { randomUUID } from "crypto";
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  email_event_type,
  email_provider,
  email_status,
  payment_status,
  reservation_status,
  room_status,
  type ota_channels,
} from "@prisma/client";
import { buildWebCheckinLocatorUrl } from "../lib/web-checkin-public-url";
import { computeWebCheckinExpiresAt } from "../lib/web-checkin-expiry";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { AiosellSyncService } from "./aiosell-sync.service";
import { CheckinChargeService } from "./checkin-charge.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { dedupeAdjacentSameSrcImages } from "./email-template.util";

/**
 * Aiosell reservation webhook + manual/pull sync.
 * Port of supabase/functions/aiosell-reservation-webhook and aiosell-reservations-sync.
 * Webhook verify_jwt is false: the hotel-code / secret gate below is the only webhook auth.
 * After a successful book, modify, or cancel, availability and rates go through AiosellSyncService.
 */

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const SYNC_DAYS_AHEAD = 365;
const ACTIVE_STAY_STATUSES: reservation_status[] = [
  reservation_status.pending,
  reservation_status.confirmed,
  reservation_status.checkedin,
  reservation_status.blocked,
  reservation_status.preregistration,
];
const INVENTORY_STAY_STATUSES: reservation_status[] = [
  ...ACTIVE_STAY_STATUSES,
  reservation_status.noshow,
];
const OTA_BOOKING_ID_LOOKUP_KEYS = [
  "bookingId",
  "booking_id",
  "otaBookingId",
  "cmBookingId",
  "cm_booking_id",
  "confirmationNumber",
  "confirmationNo",
  "reference",
  "externalBookingId",
] as const;

type JsonRecord = Record<string, unknown>;
type TemplateVariables = Record<string, unknown>;
type HttpResult = { status: number; body: unknown };
type ApplyResult = { status: number; json: JsonRecord };
type OtaRow = { id: string; reservation_id: string; ota_reservation_code: string };
type PricingRow = {
  category_id: string;
  pricing_plan_id: string | null;
  channel_room_code: string | null;
  channel_rate_plan_code: string | null;
  fixed_price?: Prisma.Decimal | number | string | null;
  price_multiplier?: Prisma.Decimal | number | string | null;
};

type ApplyOptions = {
  logPrefix?: string;
  requestPathname?: string;
  headers?: Record<string, string | undefined>;
  skipLifecycleQueue?: boolean;
  skipConflictEmail?: boolean;
};

@Injectable()
export class AiosellReservationsService {
  private readonly logger = new Logger(AiosellReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
    private readonly email: EmailDispatchService,
    private readonly checkinCharge: CheckinChargeService,
    private readonly aiosellSync: AiosellSyncService,
    private readonly config: ConfigService,
  ) {}

  async webhook(rawBody: string, headers: Record<string, string | undefined>): Promise<HttpResult> {
    const method = (header(headers, "x-http-method") || header(headers, "x-method") || "POST").toUpperCase();
    if (method === "OPTIONS") return { status: 200, body: { success: true } };
    if (method !== "POST") return { status: 405, body: { success: false, error: "Method not allowed" } };

    let body: JsonRecord;
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        this.logger.warn("aiosell-reservation-webhook 400: corpo não é JSON");
        return { status: 400, body: { success: false, error: "Invalid JSON" } };
      }
      body = parsed as JsonRecord;
    } catch {
      this.logger.warn("aiosell-reservation-webhook 400: corpo não é JSON");
      return { status: 400, body: { success: false, error: "Invalid JSON" } };
    }

    const staffEstablishmentId = typeof body.establishment_id === "string" ? body.establishment_id.trim() : "";
    const applyRevisionId = typeof body.apply_revision_id === "string" ? body.apply_revision_id.trim() : "";
    if (applyRevisionId && staffEstablishmentId) {
      return this.applyRevision(headers, applyRevisionId, staffEstablishmentId);
    }
    const finalizeId =
      typeof body.finalize_cancellation_revision_id === "string" ? body.finalize_cancellation_revision_id.trim() : "";
    if (finalizeId && staffEstablishmentId) {
      return this.finalizeCancellation(headers, finalizeId, staffEstablishmentId);
    }

    const url = requestUrl(headers);
    const otaChannelIdParam = url.searchParams.get("ota_channel_id");
    const layers = collectLayers(body);
    const hotelCode = firstNonEmptyString(layers, [
      "hotelCode",
      "hotelId",
      "hotel_id",
      "propertyCode",
      "propertyId",
      "hotel_code",
      "property_id",
    ]);
    if (!hotelCode && !otaChannelIdParam) {
      this.logger.warn(`aiosell-reservation-webhook 400: hotelCode ou ota_channel_id ${JSON.stringify({ rootKeys: Object.keys(body) })}`);
      return { status: 400, body: { success: false, error: "hotelCode (ou query ota_channel_id) é obrigatório" } };
    }

    const channel = otaChannelIdParam
      ? await this.prisma.ota_channels.findFirst({
          where: { id: otaChannelIdParam, channel_manager_type: "aiosell" },
        })
      : await this.prisma.ota_channels.findFirst({
          where: { channel_manager_type: "aiosell", aiosell_hotel_code: normalizeAiosellCodeInput(hotelCode) },
        });
    if (!channel) {
      return {
        status: 404,
        body: {
          success: false,
          error: otaChannelIdParam ? "Canal Aiosell não encontrado" : "Canal Aiosell não encontrado para este hotelCode",
        },
      };
    }

    const gate = this.webhookGate(channel, body, layers, headers, url, hotelCode, otaChannelIdParam);
    if (!gate.ok) return { status: 401, body: gate.body };
    if (gate.trustedWithoutCredential) {
      this.logger.warn(
        `aiosell-reservation-webhook: webhook sem credencial HTTP aceite (${gate.trustLabel})`,
      );
    }
    if (envFlagTrue("AIOSELL_WEBHOOK_LOG_BODY")) {
      const redacted = redactSecrets(body);
      const serialized = JSON.stringify(redacted);
      const max = 12000;
      this.logger.log(
        `aiosell-reservation-webhook raw_body_snippet ${serialized.length > max ? `${serialized.slice(0, max)}…(truncated,len=${serialized.length})` : serialized}`,
      );
    }

    const result = await this.applyPayload(channel, body, {
      logPrefix: "aiosell-reservation-webhook",
      requestPathname: url.pathname,
      headers,
    });
    if (
      !envFlagTrue("AIOSELL_WEBHOOK_SKIP_POST_SYNC") &&
      !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") &&
      result.status >= 200 &&
      result.status < 300 &&
      result.json.success === true &&
      result.json.queued !== true &&
      channel.sync_enabled !== false &&
      channel.is_active !== false &&
      channel.establishment_id
    ) {
      this.scheduleInventoryPush(channel.id, channel.establishment_id, "aiosell-reservation-webhook");
    }
    return { status: result.status, body: result.json };
  }

  async sync(authorization: string | undefined, body: unknown): Promise<HttpResult> {
    if (!authorization?.trim()) return { status: 401, body: { success: false, error: "Não autorizado" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { status: 401, body: { success: false, error: "Sessão inválida ou expirada" } };

    const payload = asRecord(body);
    if (!payload) return { status: 400, body: { success: false, error: "JSON inválido" } };
    const channelId = typeof payload.channel_id === "string" ? payload.channel_id.trim() : "";
    if (!channelId) return { status: 400, body: { success: false, error: "channel_id obrigatório" } };

    const channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
    if (!channel) return { status: 404, body: { success: false, error: "Canal não encontrado" } };
    if (channel.channel_manager_type !== "aiosell") return { status: 400, body: { success: false, error: "Canal não é Aiosell" } };

    const fromChannel = channel.establishment_id;
    const fromBody = typeof payload.establishment_id === "string" ? payload.establishment_id.trim() : "";
    const establishmentId = fromChannel || fromBody || null;
    if (!establishmentId) {
      return { status: 400, body: { success: false, error: "establishment_id em falta ou canal sem estabelecimento." } };
    }
    if (fromChannel && fromBody && fromChannel !== fromBody) {
      return { status: 400, body: { success: false, error: "establishment_id não coincide com o canal." } };
    }

    try {
      await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return { status: 403, body: { success: false, error: "Sem permissão para este estabelecimento" } };
      }
      if (error instanceof UnauthorizedException) {
        return { status: 401, body: { success: false, error: "Sessão inválida ou expirada" } };
      }
      return { status: 500, body: { success: false, error: `Não foi possível validar permissão: ${errorMessage(error)}` } };
    }

    const days = Math.min(365, Math.max(0, Number(payload.days ?? 0) || 0));
    const daysBack = days || 30;
    const daysAhead = days || 90;
    let bookings: JsonRecord[] = [];
    if (Array.isArray(payload.bookings) && payload.bookings.length > 0) {
      bookings = payload.bookings.filter((item): item is JsonRecord => !!item && typeof item === "object" && !Array.isArray(item));
    } else if (payload.pull === true) {
      const pulled = await this.pullBookings(channel, daysBack, daysAhead);
      if ("status" in pulled) return pulled;
      bookings = pulled.bookings;
    } else {
      return {
        status: 400,
        body: {
          success: false,
          error: "Envie `bookings` (array de payloads) ou `pull: true` com `aiosell_bookings_list_path` configurado.",
        },
      };
    }

    if (bookings.length === 0) {
      return { status: 200, body: { success: true, processed: 0, results: [], message: "Nenhuma reserva para processar." } };
    }

    const results: JsonRecord[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let shouldPushAvailability = false;
    for (const item of bookings) {
      const applied = await this.applyPayload(channel, item, {
        logPrefix: "aiosell-reservations-sync",
        headers: { authorization },
        skipConflictEmail: true,
      });
      const bid = String(item.bookingId ?? item.cmBookingId ?? "");
      if (applied.status >= 200 && applied.status < 300 && applied.json.success) {
        if (applied.json.already_exists) skipped += 1;
        else if (applied.json.action === "book") created += 1;
        const action = String(applied.json.action ?? "");
        if (applied.json.queued === true) {
          /* inventário só depois de aplicar na Tratativas */
        } else if (action === "cancel" || action === "modify" || (action === "book" && !applied.json.already_exists)) {
          shouldPushAvailability = true;
        }
        results.push({ bookingId: bid || null, booking_id: bid || null, status: "ok", ...applied.json });
      } else {
        failed += 1;
        results.push({
          bookingId: bid || null,
          booking_id: bid || null,
          status: "error",
          httpStatus: applied.status,
          error: applied.json.error ?? applied.json,
        });
      }
    }

    if (
      shouldPushAvailability &&
      !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") &&
      channel.sync_enabled !== false &&
      channel.is_active !== false &&
      channel.establishment_id
    ) {
      this.scheduleInventoryPush(channel.id, channel.establishment_id, "aiosell-reservations-sync");
    }

    return { status: 200, body: { success: true, processed: bookings.length, created, skipped, failed, results } };
  }

  private async applyRevision(headers: Record<string, string | undefined>, revisionId: string, establishmentId: string): Promise<HttpResult> {
    if (!isUuid(revisionId) || !isUuid(establishmentId)) return { status: 400, body: { success: false, error: "IDs inválidos" } };
    const access = await this.staffSqlAccess(header(headers, "authorization"), establishmentId);
    if ("status" in access) return access;

    const rev = await this.prisma.channex_booking_revisions.findFirst({
      where: { revision_id: revisionId, establishment_id: establishmentId },
    });
    if (!rev) return { status: 404, body: { success: false, error: "Revisão não encontrada" } };
    if (rev.process_status === "processed") {
      return { status: 200, body: { success: true, already_processed: true, message: "Esta revisão já estava processada." } };
    }
    const channel = await this.prisma.ota_channels.findFirst({
      where: { id: rev.ota_channel_id, channel_manager_type: "aiosell" },
    });
    if (!channel) return { status: 400, body: { success: false, error: "Canal Aiosell inválido para esta revisão" } };
    const payload = asRecord(rev.payload);
    if (payload?.source !== "aiosell_lifecycle") {
      return { status: 400, body: { success: false, error: "Esta pendência não é aplicável pelo fluxo Aiosell." } };
    }
    const raw = asRecord(payload.rawBody);
    if (!raw) return { status: 400, body: { success: false, error: "Payload da revisão inválido (rawBody)" } };

    const result = await this.applyPayload(channel, raw, { logPrefix: "aiosell-apply-revision", headers, skipLifecycleQueue: true });
    const ok = result.status >= 200 && result.status < 300 && result.json.success === true;
    await this.prisma.channex_booking_revisions.updateMany({
      where: { revision_id: revisionId, establishment_id: establishmentId },
      data: {
        process_status: ok ? "processed" : "failed",
        error_message: ok ? null : String(result.json.error ?? "Erro ao aplicar"),
        processed_at: new Date(),
        updated_at: new Date(),
      },
    });
    if (ok && !envFlagTrue("AIOSELL_WEBHOOK_SKIP_POST_SYNC") && !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") && channel.sync_enabled !== false && channel.is_active !== false && channel.establishment_id) {
      this.scheduleInventoryPush(channel.id, channel.establishment_id, "aiosell-apply-revision");
    }
    return { status: result.status, body: result.json };
  }

  private async finalizeCancellation(headers: Record<string, string | undefined>, revisionId: string, establishmentId: string): Promise<HttpResult> {
    if (!isUuid(revisionId) || !isUuid(establishmentId)) return { status: 400, body: { success: false, error: "IDs inválidos" } };
    const access = await this.staffSqlAccess(header(headers, "authorization"), establishmentId);
    if ("status" in access) return access;

    const rev = await this.prisma.channex_booking_revisions.findFirst({
      where: { revision_id: revisionId, establishment_id: establishmentId },
    });
    if (!rev) return { status: 404, body: { success: false, error: "Revisão não encontrada" } };
    if (rev.status !== "cancelled") return { status: 400, body: { success: false, error: "Esta pendência não é de cancelamento" } };
    const reservationId = String(rev.reservation_id ?? "").trim();
    if (!reservationId) {
      return { status: 409, body: { success: false, error: "Revisão sem reserva vinculada. Sincronize as reservas do canal antes de finalizar." } };
    }
    const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { status: true } });
    if (String(reservation?.status ?? "").toLowerCase() !== "cancelled") {
      return {
        status: 409,
        body: {
          success: false,
          error: "A reserva ainda não está cancelada no PMS. Use o cancelamento com política e estorno (como no mapa de reservas) antes de finalizar.",
          hint: "pending_reservation_not_cancelled",
        },
      };
    }
    const channel = await this.prisma.ota_channels.findFirst({
      where: { id: rev.ota_channel_id, channel_manager_type: "aiosell" },
    });
    if (!channel) return { status: 400, body: { success: false, error: "Canal Aiosell inválido para esta revisão" } };

    const uniqueId = String(rev.unique_id ?? "").trim();
    const now = new Date();
    if (uniqueId) {
      await this.prisma.ota_reservations.updateMany({
        where: { ota_channel_id: channel.id, ota_reservation_code: { startsWith: uniqueId } },
        data: { sync_status: "cancelled", synced_at: now },
      });
    }
    await this.prisma.channex_booking_revisions.update({
      where: { id: rev.id },
      data: { process_status: "processed", processed_at: now, error_message: null, updated_at: now },
    });
    if (uniqueId) {
      await this.prisma.channex_booking_revisions.updateMany({
        where: {
          ota_channel_id: rev.ota_channel_id,
          unique_id: uniqueId,
          status: "modified",
          process_status: { in: ["pending", "failed"] },
          revision_id: { not: revisionId },
        },
        data: { process_status: "processed", error_message: `Superseded by cancellation revision ${revisionId}`, updated_at: now },
      });
    }
    if (!envFlagTrue("AIOSELL_WEBHOOK_SKIP_POST_SYNC") && !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") && channel.sync_enabled !== false && channel.is_active !== false && channel.establishment_id) {
      this.scheduleInventoryPush(channel.id, channel.establishment_id, "aiosell-finalize-cancellation");
    }
    return { status: 200, body: { success: true, finalized: true } };
  }

  private async staffSqlAccess(authorization: string | undefined, establishmentId: string): Promise<HttpResult | { userId: string }> {
    if (!authorization?.trim()) return { status: 401, body: { success: false, error: "Não autorizado" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { status: 401, body: { success: false, error: "Sessão inválida" } };
    try {
      const rows = await this.prisma.$queryRaw<Array<{ allowed: boolean }>>`
        SELECT public.user_can_access_establishment(${userId}::uuid, ${establishmentId}::uuid) AS allowed
      `;
      if (rows[0]?.allowed !== true) {
        return { status: 403, body: { success: false, error: "Sem permissão para este estabelecimento" } };
      }
      return { userId };
    } catch (error) {
      return { status: 500, body: { success: false, error: `Não foi possível validar permissão: ${errorMessage(error)}` } };
    }
  }

  private webhookGate(
    channel: ota_channels,
    body: JsonRecord,
    layers: JsonRecord[],
    headers: Record<string, string | undefined>,
    url: URL,
    hotelCode: string | undefined,
    otaChannelIdParam: string | null,
  ): { ok: true; trustedWithoutCredential: boolean; trustLabel: string } | { ok: false; body: JsonRecord } {
    const authHeader = header(headers, "authorization") ?? null;
    const secretHeader = header(headers, "x-aiosell-secret") || header(headers, "x-webhook-secret") || header(headers, "x-api-secret");
    const apikeyHeader = header(headers, "apikey")?.trim() ?? "";
    const xApiKeyHeader = header(headers, "x-api-key")?.trim() ?? "";
    const basic = parseBasicAuth(authHeader);
    const bearerRaw = parseBearerOrTokenAuth(authHeader);
    const whSecret = String(channel.aiosell_webhook_secret ?? "").trim();
    const configuredWebhookSecret = whSecret.length > 0;
    const apiSecret = String(channel.api_secret ?? "").trim();
    const bearerForChannel = resolveBearerForChannel(bearerRaw, whSecret, apiSecret);
    const tokenFromBody = pickWebhookSecretFromBody(body);
    const bodyApiSecretToken = pickBodyApiSecretToken(layers);
    const bodyPairOk = bodyApiKeySecretMatchesChannel(channel, layers);
    const apikeyAsSecret = apikeyHeader && !isSupabasePlatformBearer(apikeyHeader) ? apikeyHeader : "";
    const xApiKeyAsSecret = xApiKeyHeader && !isSupabasePlatformBearer(xApiKeyHeader) ? xApiKeyHeader : "";
    const querySecretVal = pickSecretFromQuery(url);
    const gateOk = gateKeyMatchesUrl(url);
    const inlineSecret = (secretHeader && secretHeader.trim()) || querySecretVal || tokenFromBody || bodyApiSecretToken || apikeyAsSecret || xApiKeyAsSecret;
    const secretOk = !!inlineSecret && (configuredWebhookSecret ? inlineSecret === whSecret : !!(apiSecret && inlineSecret === apiSecret));
    const basicOk = !!(basic && String(channel.api_key ?? "").trim() === String(basic.user ?? "").trim() && apiSecret === String(basic.pass ?? "").trim());
    const bearerOk = !!bearerForChannel && (bearerForChannel === whSecret || (!configuredWebhookSecret && !!channel.api_key && !!apiSecret && bearerForChannel === apiSecret));
    const trustOkEnv = trustHotelCodeBypass(hotelCode, otaChannelIdParam);
    const trustOkChannel = channel.aiosell_webhook_trust_hotel_only === true;
    const trustOk = trustOkEnv || trustOkChannel;
    if (!secretOk && !basicOk && !bearerOk && !bodyPairOk && !gateOk && !trustOk) {
      this.logger.warn(
        `aiosell-reservation-webhook: auth failed (sem segredos) ${JSON.stringify({
          hasHotelCode: !!hotelCode,
          hasOtaChannelIdParam: !!otaChannelIdParam,
          configuredWebhookSecret,
          hasSecretHeader: !!(secretHeader && secretHeader.trim()),
          hasQuerySecret: !!querySecretVal,
          gateConfigured: !!(process.env.AIOSELL_WEBHOOK_GATE_KEY ?? "").trim(),
          gateOk,
          hasBodySecret: !!tokenFromBody,
          hasBodyApiSecretField: !!bodyApiSecretToken,
          bodyApiKeySecretPairOk: bodyPairOk,
          hasApikeyNonPlatform: !!apikeyAsSecret,
          hasXApiKeyNonPlatform: !!xApiKeyAsSecret,
          hasBasic: !!basic,
          hasBearerChannel: !!bearerForChannel,
          bearerWasPlatformJwt: !!(bearerRaw && isSupabasePlatformBearer(bearerRaw)),
          bearerDroppedAsJwt: !!(bearerRaw && looksLikeJwt(bearerRaw) && !bearerForChannel),
          trustModeConfigured: envFlagTrue("AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY"),
          channelTrustHotelOnly: channel.aiosell_webhook_trust_hotel_only === true,
          trustOk,
        })}`,
      );
      return {
        ok: false,
        body: {
          success: false,
          error: "Unauthorized",
          hint: "A Aiosell muitas vezes envia só o JSON (hotelCode) sem Basic Auth. No PMS: Channel Manager → Editar canal Aiosell → ative «Aceitar webhook só com hotelCode». Ou use na URL do webhook ?secret= com o mesmo valor do api_secret, ou configure Basic (usuário = api_key, senha = api_secret). Confirme verify_jwt=false e, se precisar, AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY.",
        },
      };
    }
    const trustLabel = `${trustOkEnv ? "secret AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY" : ""}${trustOkEnv && trustOkChannel ? " e " : ""}${trustOkChannel ? "opção no canal (aiosell_webhook_trust_hotel_only)" : ""}`;
    return { ok: true, trustedWithoutCredential: trustOk && !(secretOk || basicOk || bearerOk || bodyPairOk || gateOk), trustLabel };
  }

  private async applyPayload(channel: ota_channels, body: JsonRecord, opts?: ApplyOptions): Promise<ApplyResult> {
    const logPrefix = opts?.logPrefix ?? "aiosell-reservation";
    const layers = collectLayers(body);
    let action = normalizeActionFromLayers(layers);
    const pathLower = (opts?.requestPathname ?? "").toLowerCase();
    if (!action) {
      if (pathLower.includes("reservation/cancel")) action = "cancel";
      else if (pathLower.includes("reservation/modify")) action = "modify";
    }
    const bookingId = pickBookingIdFromLayers(layers);
    const guest = pickGuestObject(layers);
    const rooms = pickRoomsFromLayers(layers);
    const room0 = rooms[0] || {};
    const roomGuest = asRecord(room0.guest) ?? {};
    const guestMerged = { ...guest, ...roomGuest };
    const guestName = buildAiosellGuestName(body, layers, guestMerged, room0);
    const meta = pickAiosellBookingMeta(body, layers);
    const guestPhone = pickGuestPhone(guestMerged);
    const guestAddr = guestAddressJson(guestMerged.address);
    const checkIn = normalizeAiosellDateField(pickCheckIn(room0, layers)) ?? pickCheckIn(room0, layers);
    const checkOut = normalizeAiosellDateField(pickCheckOut(room0, layers)) ?? pickCheckOut(room0, layers);
    const roomCode = pickRoomCode(room0, layers);
    const rateplanCode = pickRateplanCode(room0, layers);
    const totalOnRoom0Only = pickTotalAmountFromRoomObjectOnly(room0);
    this.logger.log(
      `${logPrefix} booking_payload_shape ${JSON.stringify({
        booking_id: bookingId ?? null,
        action: action || "(empty)",
        rooms_count: rooms.length,
        room_lines: rooms.map((room, index) => summarizeAiosellRoomLine(room, index)),
        room0_only_amount: totalOnRoom0Only,
        mapped_room_code: roomCode ?? null,
        mapped_rateplan_code: rateplanCode ?? null,
      })}`,
    );
    const establishmentId = channel.establishment_id;
    if (!establishmentId) return { status: 400, json: { success: false, error: "Canal sem estabelecimento." } };
    const hotelSettings = await this.prisma.hotel_settings.findFirst({
      where: { establishment_id: establishmentId },
      select: { checkin_time: true, checkout_time: true },
    });

    if (action.includes("cancel")) return this.cancelPayload(channel, body, layers, bookingId, establishmentId, logPrefix, opts);
    if (action.includes("modify") || action.includes("update")) {
      return this.modifyPayload(channel, body, layers, rooms, room0, guestMerged, guestName, guestPhone, guestAddr, meta, checkIn, checkOut, roomCode, rateplanCode, bookingId, establishmentId, logPrefix, opts);
    }
    return this.bookPayload(channel, body, layers, rooms, room0, guestMerged, guestName, guestPhone, guestAddr, meta, checkIn, checkOut, roomCode, rateplanCode, bookingId, establishmentId, hotelSettings, totalOnRoom0Only, logPrefix, opts);
  }

  private async cancelPayload(
    channel: ota_channels,
    body: JsonRecord,
    layers: JsonRecord[],
    bookingId: string | undefined,
    establishmentId: string,
    logPrefix: string,
    opts?: ApplyOptions,
  ): Promise<ApplyResult> {
    const otaRows = await this.listOtaRows(channel.id, layers);
    if (otaRows.length === 0) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada (confirme bookingId / cmBookingId no payload)" } };
    }
    const bookingRef = (bookingId && bookingId.trim()) || otaRows[0].ota_reservation_code.replace(/#.*$/, "") || "";
    if (!opts?.skipLifecycleQueue && aiosellLifecycleQueueEnabled()) {
      return this.queueLifecycle({ channel, establishmentId, bookingId: bookingRef, revisionStatus: "cancelled", body, lifecycle: "cancel", reservationId: otaRows[0].reservation_id });
    }
    const ids = otaRows.map((row) => row.reservation_id);
    void this.sendCheckinEvent(ids, establishmentId, logPrefix, "reservation_cancelled").catch((error) => {
      this.logger.warn(`${logPrefix}: checkin-charge reservation_cancelled ${errorMessage(error)}`);
    });
    try {
      await this.prisma.reservations.updateMany({ where: { id: { in: ids } }, data: { status: reservation_status.cancelled } });
    } catch (error) {
      return { status: 500, json: { success: false, error: errorMessage(error) } };
    }
    return {
      status: 200,
      json: { success: true, message: "Reservation Cancelled Successfully", action: "cancel", reservation_id: ids[0], reservation_ids: ids, cancelled_count: ids.length },
    };
  }

  private async modifyPayload(
    channel: ota_channels,
    body: JsonRecord,
    layers: JsonRecord[],
    rooms: JsonRecord[],
    room0: JsonRecord,
    guestMerged: JsonRecord,
    guestName: string,
    guestPhone: string | null,
    guestAddr: JsonRecord | null,
    meta: ReturnType<typeof pickAiosellBookingMeta>,
    checkIn: string | undefined,
    checkOut: string | undefined,
    roomCode: string | undefined,
    rateplanCode: string | undefined,
    bookingId: string | undefined,
    establishmentId: string,
    logPrefix: string,
    opts?: ApplyOptions,
  ): Promise<ApplyResult> {
    const otaRows = await this.listOtaRows(channel.id, layers);
    if (otaRows.length === 0) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada (confirme bookingId / cmBookingId no payload)" } };
    }
    const bookingRef = (bookingId && bookingId.trim()) || otaRows[0].ota_reservation_code.replace(/#.*$/, "") || "";
    if (!opts?.skipLifecycleQueue && aiosellLifecycleQueueEnabled()) {
      const processingMeta = await this.buildModifyMeta({
        reservationId: otaRows[0].reservation_id,
        otaChannelId: channel.id,
        incomingGuestName: guestName,
        incomingCheckIn: checkIn,
        incomingCheckOut: checkOut,
        incomingRoomCode: roomCode,
        incomingRateplanCode: rateplanCode,
        incomingTotal: pickTotalAmount(room0, body, layers),
        incomingPrepaid: isAiosellPrepaidBooking(layers, body),
        partnerChannelName: meta.sourceChannel,
        multiRoomCount: rooms.length,
      });
      return this.queueLifecycle({
        channel,
        establishmentId,
        bookingId: bookingRef,
        revisionStatus: "modified",
        body,
        lifecycle: "modify",
        reservationId: otaRows[0].reservation_id,
        processingMeta,
      });
    }

    let checkInFinal = checkIn;
    let checkOutFinal = checkOut;
    if (!checkInFinal || !checkOutFinal) {
      const current = await this.prisma.reservations.findUnique({
        where: { id: otaRows[0].reservation_id },
        select: { checkin_date: true, checkout_date: true },
      });
      checkInFinal = checkInFinal || ymd(current?.checkin_date);
      checkOutFinal = checkOutFinal || ymd(current?.checkout_date);
    }
    if (!checkInFinal || !checkOutFinal) return { status: 400, json: { success: false, error: "Datas obrigatórias para alteração" } };
    checkInFinal = normalizeAiosellDateField(checkInFinal) ?? checkInFinal;
    checkOutFinal = normalizeAiosellDateField(checkOutFinal) ?? checkOutFinal;
    if (!isValidPmsStayRange(checkInFinal, checkOutFinal)) {
      const current = await this.prisma.reservations.findUnique({
        where: { id: otaRows[0].reservation_id },
        select: { checkin_date: true, checkout_date: true },
      });
      const fallbackIn = ymd(current?.checkin_date);
      const fallbackOut = ymd(current?.checkout_date);
      if (isValidPmsStayRange(fallbackIn, fallbackOut)) {
        checkInFinal = fallbackIn;
        checkOutFinal = fallbackOut;
      } else {
        return { status: 400, json: { success: false, error: "Período inválido: check-out deve ser posterior ao check-in. Corrija o envio do canal ou as datas na reserva." } };
      }
    }

    const amountRaw = room0.amount ?? room0.totalAmount ?? body.totalAmount ?? body.amount;
    const numericAmount = extractNumberFromAmountLike(amountRaw) ?? (amountRaw != null && amountRaw !== "" ? Number(amountRaw) : NaN);
    const modifyPrepaid = isAiosellPrepaidBooking(layers, body);
    const amountParts = numericAmount != null && !Number.isNaN(numericAmount) && otaRows.length > 1 ? splitMoneyAcrossParts(numericAmount, otaRows.length) : null;
    const pricingRows = await this.pricingRows(channel.id);

    for (let index = 0; index < otaRows.length; index += 1) {
      const roomLine = rooms[index] || room0;
      const lineRoom = pickRoomCode(roomLine, layers);
      const linePlan = pickRateplanCode(roomLine, layers);
      let mapping: { category_id: string; pricing_plan_id?: string | null } | null = null;
      if (lineRoom) {
        mapping = findChannelPricingMapping(lineRoom, linePlan, pricingRows);
        if (!mapping?.category_id) {
          return { status: 400, json: { success: false, error: `Mapeamento não encontrado para alteração (${lineRoom} / ${linePlan ?? "—"}). Configure Tarifas por canal.` } };
        }
      }
      const current = await this.prisma.reservations.findUnique({
        where: { id: otaRows[index].reservation_id },
        select: { category_id: true, room_id: true, establishment_id: true },
      });
      const patch: Prisma.reservationsUpdateInput = {
        checkin_date: utcDate(checkInFinal),
        checkout_date: utcDate(checkOutFinal),
        guest_name: guestName,
      };
      if (numericAmount != null && !Number.isNaN(numericAmount)) {
        const part = amountParts ? amountParts[index] : numericAmount;
        patch.total_amount = new Prisma.Decimal(part.toFixed(2));
        if (modifyPrepaid && part > 0) {
          patch.paid_amount = new Prisma.Decimal(part.toFixed(2));
          patch.payment_status = payment_status.paid;
        }
      }
      if (mapping) {
        patch.room_categories = { connect: { id: mapping.category_id } };
        if (mapping.pricing_plan_id) patch.pricing_plans = { connect: { id: mapping.pricing_plan_id } };
        if (mapping.category_id !== String(current?.category_id ?? "")) {
          const newRoomId = await this.findRoomForCategoryChange({
            establishmentId: current?.establishment_id || establishmentId,
            categoryId: mapping.category_id,
            checkin: checkInFinal,
            checkout: checkOutFinal,
            excludeReservationId: otaRows[index].reservation_id,
            currentRoomId: current?.room_id,
          });
          if (!newRoomId) {
            return { status: 400, json: { success: false, error: "Sem quarto disponível na nova categoria neste período. Libere um quarto no mapa ou atribua manualmente antes de aplicar." } };
          }
          patch.rooms = { connect: { id: newRoomId } };
        }
      }
      try {
        await this.prisma.reservations.update({ where: { id: otaRows[index].reservation_id }, data: patch });
      } catch (error) {
        return { status: 500, json: { success: false, error: errorMessage(error) } };
      }
    }

    await this.prisma.ota_reservations.updateMany({
      where: { id: { in: otaRows.map((row) => row.id) }, ota_channel_id: channel.id },
      data: {
        ota_guest_name: guestName,
        ota_guest_email: typeof guestMerged.email === "string" ? guestMerged.email : null,
        ota_guest_phone: guestPhone,
        ota_source_channel_name: meta.sourceChannel,
        ota_segment: meta.segment,
        ota_cm_booking_id: meta.cmBookingId,
        ota_special_requests: meta.specialRequests,
        ota_guest_address: guestAddr ? (guestAddr as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    if (modifyPrepaid && numericAmount != null && !Number.isNaN(numericAmount) && numericAmount > 0) {
      for (let index = 0; index < otaRows.length; index += 1) {
        const part = amountParts ? amountParts[index] : numericAmount;
        if (part > 0) {
          const payError = await this.insertPrepaidPayment({
            reservationId: otaRows[index].reservation_id,
            establishmentId,
            amount: part,
            bookingId: `${bookingRef}#${index}`,
            partnerChannelName: meta.sourceChannel,
            otaPrepaid: true,
          });
          if (payError) this.logger.warn(`${logPrefix} prepaid payment (modify) ${payError}`);
        }
      }
    }
    try {
      await this.notifyModified({ establishmentId, reservationId: otaRows[0].reservation_id, guestName, partnerName: meta.sourceChannel, bookingRef, checkIn: checkInFinal, checkOut: checkOutFinal });
    } catch (error) {
      this.logger.warn(`${logPrefix} notification reserva modificada ${errorMessage(error)}`);
    }
    void this.sendCheckinEvent(otaRows.map((row) => row.reservation_id), establishmentId, logPrefix, "reservation_modified").catch((error) => {
      this.logger.warn(`${logPrefix}: checkin-charge reservation_modified ${errorMessage(error)}`);
    });
    return {
      status: 200,
      json: {
        success: true,
        message: "Reservation Modified Successfully",
        action: "modify",
        reservation_id: otaRows[0].reservation_id,
        reservation_ids: otaRows.map((row) => row.reservation_id),
        updated_count: otaRows.length,
      },
    };
  }

  private async bookPayload(
    channel: ota_channels,
    body: JsonRecord,
    layers: JsonRecord[],
    rooms: JsonRecord[],
    room0: JsonRecord,
    guestMerged: JsonRecord,
    guestName: string,
    guestPhone: string | null,
    guestAddr: JsonRecord | null,
    meta: ReturnType<typeof pickAiosellBookingMeta>,
    checkIn: string | undefined,
    checkOut: string | undefined,
    roomCode: string | undefined,
    rateplanCode: string | undefined,
    bookingId: string | undefined,
    establishmentId: string,
    hotelSettings: { checkin_time: Date | null; checkout_time: Date | null } | null,
    totalOnRoom0Only: number | null,
    logPrefix: string,
    opts?: ApplyOptions,
  ): Promise<ApplyResult> {
    if (!bookingId) {
      this.logger.warn(`${logPrefix} 400: bookingId ausente ${JSON.stringify({ rootKeys: Object.keys(body) })}`);
      return { status: 400, json: { success: false, error: "bookingId obrigatório" } };
    }
    if (!checkIn || !checkOut) {
      this.logger.warn(`${logPrefix} 400: datas ausentes ${JSON.stringify({ hasCheckIn: !!checkIn, hasCheckOut: !!checkOut, rootKeys: Object.keys(body) })}`);
      return { status: 400, json: { success: false, error: "checkIn/checkOut obrigatórios" } };
    }
    const prepaid = isAiosellPrepaidBooking(layers, body);
    const bookingTotal = pickTotalAmount(room0, body, layers);
    const pricingRows = await this.pricingRows(channel.id);
    const checkinTime = timeToSql(hotelSettings?.checkin_time);
    const checkoutTime = timeToSql(hotelSettings?.checkout_time);

    if (rooms.length > 1) {
      const existing = await this.prisma.ota_reservations.findFirst({
        where: { ota_channel_id: channel.id, ota_reservation_code: `${bookingId}#0` },
        select: { reservation_id: true },
      });
      if (existing?.reservation_id) {
        return { status: 200, json: { success: true, action: "book", already_exists: true, multi_room: true, reservation_id: existing.reservation_id } };
      }
      for (let index = 0; index < rooms.length; index += 1) {
        const lineRoom = pickRoomCode(rooms[index], layers);
        const linePlan = pickRateplanCode(rooms[index], layers);
        const mapping = findChannelPricingMapping(lineRoom, linePlan, pricingRows);
        if (!lineRoom || !mapping?.category_id) {
          return {
            status: 400,
            json: {
              success: false,
              error: !lineRoom
                ? `roomCode obrigatório (quarto ${index + 1})`
                : `Mapeamento não encontrado para o quarto ${index + 1} (${lineRoom} / ${linePlan ?? "—"}). Configure Tarifas por canal.`,
            },
          };
        }
      }
      const { amounts, strategy } = computePerRoomAmounts(rooms, room0, body, layers);
      this.logger.log(`${logPrefix} book_amount_resolution ${JSON.stringify({ booking_id: bookingId, booking_total: bookingTotal, per_room_amounts: amounts, split_strategy: strategy, prepaid, rooms_count: rooms.length, multi_room: true })}`);
      const baseNotes = buildAiosellReservationNotes(bookingId, meta);
      const createdIds: string[] = [];
      for (let index = 0; index < rooms.length; index += 1) {
        const room = rooms[index];
        const mapping = findChannelPricingMapping(pickRoomCode(room, layers), pickRateplanCode(room, layers), pricingRows);
        if (!mapping?.category_id) return { status: 400, json: { success: false, error: "Mapeamento não encontrado" } };
        const stayIn = normalizeAiosellDateField(pickCheckIn(room, layers) || checkIn) ?? checkIn;
        const stayOut = normalizeAiosellDateField(pickCheckOut(room, layers) || checkOut) ?? checkOut;
        const lineGuest = { ...guestMerged, ...(asRecord(room.guest) ?? {}) };
        const lineName = buildAiosellGuestName(body, layers, lineGuest, room);
        const occupancy = asRecord(room.occupancy) ?? {};
        const total = amounts[index] ?? 0;
        const created = await this.createLockedReservation({
          establishmentId,
          categoryId: mapping.category_id,
          pricingPlanId: mapping.pricing_plan_id,
          checkIn: stayIn,
          checkOut: stayOut,
          reservationData: {
            guest_name: lineName,
            adults: Number(room.adults ?? occupancy.adults ?? body.adults ?? 2),
            children: Number(room.children ?? occupancy.children ?? body.children ?? 0),
            total_amount: total,
            paid_amount: prepaid && total > 0 ? total : 0,
            payment_status: prepaid && total > 0 ? "paid" : "pending",
            status: "pending",
            channel: "ota",
            notes: prepaid ? `${baseNotes} · Quarto ${index + 1}/${rooms.length} (Aiosell) · Pagamento: pré-pago (OTA)` : `${baseNotes} · Quarto ${index + 1}/${rooms.length} (Aiosell)`,
            checkin_time: checkinTime,
            checkout_time: checkoutTime,
          },
          logPrefix,
        });
        if ("status" in created) return created;
        const otaCode = `${bookingId}#${index}`;
        const linked = await this.linkOta(created.reservationId, channel.id, otaCode, {
          ota_guest_name: lineName,
          ota_guest_email: typeof lineGuest.email === "string" ? lineGuest.email : null,
          ota_guest_phone: pickGuestPhone(lineGuest),
          ota_source_channel_name: meta.sourceChannel,
          ota_segment: meta.segment,
          ota_cm_booking_id: meta.cmBookingId,
          ota_special_requests: meta.specialRequests,
          ota_guest_address: guestAddressJson(lineGuest.address),
          sync_status: "synced",
          synced_at: new Date().toISOString(),
        });
        if (!linked.ok) {
          await this.cancelOrphan(created.reservationId, `Falha vínculo OTA: ${linked.error}`);
          return { status: 500, json: { success: false, error: `Reserva criada mas vínculo OTA falhou: ${linked.error}` } };
        }
        createdIds.push(linked.reservationId);
        await this.afterBook({ reservationId: linked.reservationId, establishmentId, guestName: lineName, partnerName: meta.sourceChannel, prepaid, amount: total, bookingId: otaCode, logPrefix, headers: opts?.headers, skipConflictEmail: opts?.skipConflictEmail });
      }
      return {
        status: 200,
        json: { success: true, message: "Reservation Updated Successfully", action: "book", multi_room: true, reservation_ids: createdIds, reservation_id: createdIds[0], rooms_created: createdIds.length, prepaid_recorded: prepaid && amounts.some((amount) => amount > 0) },
      };
    }

    if (!roomCode) {
      this.logger.warn(`${logPrefix} 400: roomCode ausente ${JSON.stringify({ rootKeys: Object.keys(body) })}`);
      return { status: 400, json: { success: false, error: "roomCode obrigatório" } };
    }
    const existing = await this.prisma.ota_reservations.findFirst({
      where: { ota_channel_id: channel.id, ota_reservation_code: bookingId },
      select: { reservation_id: true },
    });
    if (existing?.reservation_id) {
      return { status: 200, json: { success: true, action: "book", already_exists: true, reservation_id: existing.reservation_id } };
    }
    const mapping = findChannelPricingMapping(roomCode, rateplanCode, pricingRows);
    if (!mapping?.category_id) {
      this.logger.warn(`${logPrefix} 400: mapeamento channel_pricing ${JSON.stringify({ roomCode, rateplanCode: rateplanCode ?? null })}`);
      return { status: 400, json: { success: false, error: "Mapeamento não encontrado: configure Tarifa por Canal com Room Code / Rate Plan Code para este canal Aiosell" } };
    }
    this.logger.log(
      `${logPrefix} book_amount_resolution ${JSON.stringify({
        booking_id: bookingId,
        total_amount_used_for_pms: bookingTotal,
        total_on_room0_object_only: totalOnRoom0Only,
        prepaid,
        rooms_count: rooms.length,
      })}`,
    );
    const occupancy = asRecord(room0.occupancy) ?? {};
    const baseNotes = buildAiosellReservationNotes(bookingId, meta);
    const created = await this.createLockedReservation({
      establishmentId,
      categoryId: mapping.category_id,
      pricingPlanId: mapping.pricing_plan_id,
      checkIn,
      checkOut,
      reservationData: {
        guest_name: guestName,
        adults: Number(room0.adults ?? occupancy.adults ?? body.adults ?? 2),
        children: Number(room0.children ?? occupancy.children ?? body.children ?? 0),
        total_amount: bookingTotal,
        paid_amount: prepaid && bookingTotal > 0 ? bookingTotal : 0,
        payment_status: prepaid && bookingTotal > 0 ? "paid" : "pending",
        status: "pending",
        channel: "ota",
        notes: prepaid ? `${baseNotes} · Pagamento: pré-pago (OTA)` : baseNotes,
        checkin_time: checkinTime,
        checkout_time: checkoutTime,
      },
      logPrefix,
    });
    if ("status" in created) return created;
    const linked = await this.linkOta(created.reservationId, channel.id, bookingId, {
      ota_guest_name: guestName,
      ota_guest_email: typeof guestMerged.email === "string" ? guestMerged.email : null,
      ota_guest_phone: guestPhone,
      ota_source_channel_name: meta.sourceChannel,
      ota_segment: meta.segment,
      ota_cm_booking_id: meta.cmBookingId,
      ota_special_requests: meta.specialRequests,
      ota_guest_address: guestAddr,
      sync_status: "synced",
      synced_at: new Date().toISOString(),
    });
    if (!linked.ok) {
      await this.cancelOrphan(created.reservationId, `Falha vínculo OTA: ${linked.error}`);
      return { status: 500, json: { success: false, error: `Reserva criada mas vínculo OTA falhou: ${linked.error}` } };
    }
    await this.afterBook({ reservationId: linked.reservationId, establishmentId, guestName, partnerName: meta.sourceChannel, prepaid, amount: bookingTotal, bookingId, logPrefix, headers: opts?.headers, skipConflictEmail: opts?.skipConflictEmail });
    return { status: 200, json: { success: true, message: "Reservation Updated Successfully", action: "book", reservation_id: linked.reservationId, prepaid_recorded: prepaid && bookingTotal > 0 } };
  }

  private async createLockedReservation(args: {
    establishmentId: string;
    categoryId: string;
    pricingPlanId?: string | null;
    checkIn: string;
    checkOut: string;
    reservationData: JsonRecord;
    logPrefix: string;
  }): Promise<{ reservationId: string } | ApplyResult> {
    const data = { ...args.reservationData };
    if (args.pricingPlanId) data.pricing_plan_id = args.pricingPlanId;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.create_reservation_with_lock(
          ${JSON.stringify(data)}::jsonb,
          ${args.checkIn}::date,
          ${args.checkOut}::date,
          ${args.establishmentId}::uuid,
          ${null}::uuid,
          ${args.categoryId}::uuid
        ) AS result
      `;
      const parsed = parseRpcObject(rows[0]?.result);
      if (!parsed) return { status: 500, json: { success: false, error: "Resposta RPC inválida" } };
      if (parsed.success !== true || typeof parsed.reservation_id !== "string") {
        this.logger.warn(`${args.logPrefix} 400: create_reservation_with_lock ${JSON.stringify({ rpcMessage: parsed.error ?? null })}`);
        return { status: 400, json: { success: false, error: String(parsed.error || "Falha ao criar reserva") } };
      }
      return { reservationId: parsed.reservation_id };
    } catch (error) {
      return { status: 500, json: { success: false, error: errorMessage(error) } };
    }
  }

  private async linkOta(reservationId: string, channelId: string, otaCode: string, guestJson: JsonRecord): Promise<{ ok: true; reservationId: string } | { ok: false; error: string }> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.ota_link_reservation_after_sync(
          ${reservationId}::uuid,
          ${channelId}::uuid,
          ${otaCode.trim()},
          ${JSON.stringify(guestJson)}::jsonb
        ) AS result
      `;
      const parsed = parseRpcObject(rows[0]?.result);
      if (!parsed?.success || typeof parsed.reservation_id !== "string") {
        return { ok: false, error: String(parsed?.error || "ota_link_failed") };
      }
      if (parsed.kind === "duplicate_recovered") {
        this.logger.warn(`vínculo OTA duplicado — usando reserva canônica ${JSON.stringify({ canonical_reservation_id: parsed.reservation_id, orphan: reservationId })}`);
      }
      return { ok: true, reservationId: parsed.reservation_id };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  private async cancelOrphan(reservationId: string, reason: string): Promise<void> {
    const current = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { notes: true } });
    const notes = [String(current?.notes || "").trim(), `[OTA sync] ${reason}`].filter(Boolean).join("\n");
    await this.prisma.reservations.updateMany({
      where: {
        id: reservationId,
        status: { in: [reservation_status.pending, reservation_status.unpaid, reservation_status.confirmed, reservation_status.preregistration, reservation_status.blocked] },
      },
      data: { status: reservation_status.cancelled, cancelled_at: new Date(), cancellation_reason: "ota_sync_failed", notes },
    });
  }

  private async afterBook(args: {
    reservationId: string;
    establishmentId: string;
    guestName: string;
    partnerName: string | null;
    prepaid: boolean;
    amount: number;
    bookingId: string;
    logPrefix: string;
    headers?: Record<string, string | undefined>;
    skipConflictEmail?: boolean;
  }): Promise<void> {
    try {
      const row = await this.prisma.reservations.findUnique({ where: { id: args.reservationId }, select: { reservation_code: true } });
      await this.notifyCreated({
        establishmentId: args.establishmentId,
        reservationId: args.reservationId,
        reservationCode: row?.reservation_code ?? null,
        guestName: args.guestName,
        partnerName: args.partnerName,
      });
    } catch (error) {
      this.logger.warn(`${args.logPrefix} reservation notification ${errorMessage(error)}`);
    }
    if (args.prepaid && args.amount > 0) {
      const payError = await this.insertPrepaidPayment({
        reservationId: args.reservationId,
        establishmentId: args.establishmentId,
        amount: args.amount,
        bookingId: args.bookingId,
        partnerChannelName: args.partnerName,
        otaPrepaid: true,
      });
      if (payError) this.logger.warn(`${args.logPrefix} prepaid payment insert ${payError}`);
    }
    try {
      await this.notifyGuest(args.reservationId, args.logPrefix, args.headers, args.skipConflictEmail === true);
    } catch (error) {
      this.logger.warn(`${args.logPrefix} guest notification email ${errorMessage(error)}`);
    }
    try {
      await this.sendCheckinAutomations(args.reservationId, args.establishmentId, args.logPrefix);
    } catch (error) {
      this.logger.warn(`${args.logPrefix} checkin-charge automations ${errorMessage(error)}`);
    }
  }

  private async queueLifecycle(args: {
    channel: ota_channels;
    establishmentId: string;
    bookingId: string;
    revisionStatus: "cancelled" | "modified";
    body: JsonRecord;
    lifecycle: "cancel" | "modify";
    reservationId: string;
    processingMeta?: JsonRecord;
  }): Promise<ApplyResult> {
    const revisionId = randomUUID();
    const payload: JsonRecord = { source: "aiosell_lifecycle", lifecycle: args.lifecycle, rawBody: args.body };
    if (args.processingMeta && Object.keys(args.processingMeta).length > 0) payload._processing_meta = args.processingMeta;
    try {
      await this.prisma.channex_booking_revisions.create({
        data: {
          ota_channel_id: args.channel.id,
          establishment_id: args.establishmentId,
          revision_id: revisionId,
          booking_id: null,
          unique_id: args.bookingId,
          system_id: "aiosell",
          status: args.revisionStatus,
          payload: payload as Prisma.InputJsonValue,
          reservation_id: args.reservationId,
          process_status: "pending",
        },
      });
    } catch (error) {
      this.logger.warn(`aiosell queue lifecycle revision ${errorMessage(error)}`);
      return { status: 500, json: { success: false, error: errorMessage(error) } };
    }
    return {
      status: 200,
      json: {
        success: true,
        queued: true,
        revision_id: revisionId,
        message: args.lifecycle === "cancel" ? "Cancelamento enfileirado — confirme em Tratativas." : "Alteração enfileirada — confirme em Tratativas.",
        action: args.lifecycle,
      },
    };
  }

  private async listOtaRows(channelId: string, layers: JsonRecord[]): Promise<OtaRow[]> {
    const tried = new Set<string>();
    for (const key of OTA_BOOKING_ID_LOOKUP_KEYS) {
      const value = firstNonEmptyString(layers, [key]);
      if (!value || tried.has(value)) continue;
      tried.add(value);
      const rows = await this.prisma.ota_reservations.findMany({
        where: { ota_channel_id: channelId, ota_reservation_code: { startsWith: value } },
        select: { id: true, reservation_id: true, ota_reservation_code: true },
      });
      const matched = rows.filter(
        (row): row is OtaRow =>
          !!row.reservation_id && (row.ota_reservation_code === value || row.ota_reservation_code.startsWith(`${value}#`)),
      );
      if (matched.length) return matched;
    }
    return [];
  }

  private async pricingRows(channelId: string): Promise<PricingRow[]> {
    return this.prisma.channel_pricing.findMany({
      where: { ota_channel_id: channelId, is_active: true },
      select: { category_id: true, pricing_plan_id: true, channel_room_code: true, channel_rate_plan_code: true, fixed_price: true, price_multiplier: true },
    });
  }

  private async roomOverlaps(args: { roomId: string; establishmentId: string; checkin: string; checkout: string; excludeReservationId: string }): Promise<boolean> {
    try {
      const hit = await this.prisma.reservations.findFirst({
        where: {
          room_id: args.roomId,
          establishment_id: args.establishmentId,
          id: { not: args.excludeReservationId },
          status: { in: ACTIVE_STAY_STATUSES },
          checkin_date: { lt: utcDate(args.checkout) },
          checkout_date: { gt: utcDate(args.checkin) },
        },
        select: { id: true },
      });
      return !!hit;
    } catch (error) {
      this.logger.warn(`aiosell room overlap check ${errorMessage(error)}`);
      return true;
    }
  }

  private async findRoomForCategoryChange(args: {
    establishmentId: string;
    categoryId: string;
    checkin: string;
    checkout: string;
    excludeReservationId: string;
    currentRoomId?: string | null;
  }): Promise<string | null> {
    const currentId = args.currentRoomId?.trim();
    if (currentId) {
      const preferred = await this.prisma.rooms.findFirst({
        where: { id: currentId, establishment_id: args.establishmentId },
        select: { id: true, category_id: true, is_blocked: true, status: true },
      });
      if (
        preferred &&
        preferred.category_id === args.categoryId &&
        preferred.is_blocked !== true &&
        preferred.status !== room_status.maintenance &&
        preferred.status !== room_status.blocked
      ) {
        const overlaps = await this.roomOverlaps({ ...args, roomId: currentId });
        if (!overlaps) return currentId;
      }
    }
    const candidates = await this.prisma.rooms.findMany({
      where: {
        establishment_id: args.establishmentId,
        category_id: args.categoryId,
        OR: [{ is_blocked: null }, { is_blocked: false }],
        status: { in: [room_status.available, room_status.occupied, room_status.cleaning] },
      },
      select: { id: true },
      orderBy: { room_number: "asc" },
    });
    for (const candidate of candidates) {
      const overlaps = await this.roomOverlaps({ ...args, roomId: candidate.id });
      if (!overlaps) return candidate.id;
    }
    return null;
  }

  private async buildModifyMeta(args: {
    reservationId: string;
    otaChannelId: string;
    incomingGuestName: string;
    incomingCheckIn?: string;
    incomingCheckOut?: string;
    incomingRoomCode?: string;
    incomingRateplanCode?: string;
    incomingTotal: number;
    incomingPrepaid: boolean;
    partnerChannelName?: string | null;
    multiRoomCount: number;
  }): Promise<JsonRecord> {
    const current = await this.prisma.reservations.findUnique({
      where: { id: args.reservationId },
      select: { checkin_date: true, checkout_date: true, guest_name: true, total_amount: true, paid_amount: true, payment_status: true, room_categories: { select: { name: true } } },
    });
    const details: Array<{ field: string; before: string; after: string }> = [];
    const pushIfDiff = (field: string, before: string, after: string) => {
      if (before !== after) details.push({ field, before, after });
    };
    pushIfDiff("Hóspede", String(current?.guest_name ?? "").trim() || "—", String(args.incomingGuestName ?? "").trim() || "—");
    if (args.incomingCheckIn) pushIfDiff("Check-in", ymd(current?.checkin_date) || "—", args.incomingCheckIn);
    if (args.incomingCheckOut) pushIfDiff("Check-out", ymd(current?.checkout_date) || "—", args.incomingCheckOut);
    pushIfDiff("Valor total (PMS → proposto pelo canal)", moneyDisplay(Number(current?.total_amount ?? 0)), moneyDisplay(args.incomingTotal));
    const pricing = await this.pricingRows(args.otaChannelId);
    const mapping = findChannelPricingMapping(args.incomingRoomCode, args.incomingRateplanCode, pricing);
    let categoryName = "";
    if (mapping?.category_id) {
      const category = await this.prisma.room_categories.findUnique({ where: { id: mapping.category_id }, select: { name: true } });
      categoryName = String(category?.name ?? "").trim();
    }
    const codes = `${args.incomingRoomCode || "—"} / ${args.incomingRateplanCode || "—"}`;
    const afterCategory = categoryName || (args.incomingRoomCode ? `Sem mapeamento em Tarifas por canal (${codes})` : "—");
    pushIfDiff("Categoria no PMS (atual → após mapear códigos do canal)", String(current?.room_categories?.name ?? "").trim() || "—", afterCategory);
    details.push({ field: "Códigos quarto / tarifa (canal)", before: "—", after: codes });
    pushIfDiff(
      "Pagamento (estado PMS vs canal)",
      `${String(current?.payment_status ?? "").trim() || "—"} · já pago ${moneyDisplay(Number(current?.paid_amount ?? 0))}`,
      args.incomingPrepaid ? "Canal indica pré-pago" : "Canal não indica pré-pago",
    );
    if (args.partnerChannelName) details.push({ field: "Parceiro OTA", before: "—", after: formatPartnerChannelName(args.partnerChannelName) });
    if (args.multiRoomCount > 1) details.push({ field: "Quartos no payload", before: "—", after: String(args.multiRoomCount) });
    return { modification_details: details };
  }

  private async insertPrepaidPayment(args: {
    reservationId: string;
    establishmentId: string;
    amount: number;
    bookingId: string;
    partnerChannelName?: string | null;
    otaPrepaid?: boolean;
  }): Promise<string | null> {
    if (args.amount <= 0) return null;
    const settings = await this.prisma.hotel_settings.findFirst({
      where: { establishment_id: args.establishmentId },
      select: { auto_payment_ota: true, auto_payment_carrier_id: true, auto_payment_channel_carrier_id: true, auto_payment_ota_channels: true },
    });
    const otaPrepaid = args.otaPrepaid === true;
    const autoEnabled = settings?.auto_payment_ota === true;
    if (!autoEnabled && !otaPrepaid) return null;
    const allowed = (settings?.auto_payment_ota_channels ?? []).map((value) => normalizePartnerKey(value)).filter(Boolean);
    const partnerKey = normalizePartnerKey(args.partnerChannelName);
    if (autoEnabled && !otaPrepaid && allowed.length > 0) {
      const allowsOthers = allowed.includes("outros") || allowed.includes("others");
      const matchesKnown = !!partnerKey && allowed.includes(partnerKey);
      const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
      if (!(matchesKnown || matchesOthers)) return null;
    }
    const marker = "Pré-pago via canal OTA (Aiosell)";
    const existing = await this.prisma.payments.findFirst({
      where: { reservation_id: args.reservationId, notes: { contains: marker, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return null;
    const notes = [marker, `bookingId: ${args.bookingId}`, args.partnerChannelName ? `canal parceiro: ${formatPartnerChannelName(args.partnerChannelName)}` : null].filter(Boolean).join(" · ");
    try {
      await this.prisma.payments.create({
        data: {
          reservation_id: args.reservationId,
          establishment_id: args.establishmentId,
          amount: new Prisma.Decimal(args.amount.toFixed(2)),
          payment_method: "deposit",
          payment_date: new Date(),
          carrier_id: settings?.auto_payment_channel_carrier_id || settings?.auto_payment_carrier_id || null,
          notes,
        },
      });
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  private async notifyCreated(args: { establishmentId: string; reservationId: string; reservationCode: string | null; guestName: string | null; partnerName?: string | null }): Promise<void> {
    const manager = "Aiosell";
    const partner = String(args.partnerName ?? "não informado").trim() || "não informado";
    const guest = String(args.guestName ?? "Hóspede").trim() || "Hóspede";
    const code = String(args.reservationCode ?? "").trim();
    await this.prisma.$queryRaw`
      SELECT public.create_notification_for_establishment(
        ${args.establishmentId}::uuid,
        ${"new_reservation"}::notification_type,
        ${"Nova Reserva de Canal"},
        ${`${code ? `Nova reserva ${code}` : "Nova reserva"} de ${guest} via ${manager} / ${partner}`},
        ${"medium"}::notification_priority,
        ${JSON.stringify({ reservation_id: args.reservationId, reservation_code: code || null, channel_manager: manager, source_channel: partner, source: "aiosell_channel" })}::jsonb
      )
    `;
  }

  private async notifyModified(args: { establishmentId: string; reservationId: string; guestName: string; partnerName?: string | null; bookingRef: string; checkIn: string; checkOut: string }): Promise<void> {
    const row = await this.prisma.reservations.findUnique({ where: { id: args.reservationId }, select: { reservation_code: true } });
    const code = String(row?.reservation_code ?? "").trim();
    const partner = String(args.partnerName ?? "canal").trim() || "canal";
    await this.prisma.$queryRaw`
      SELECT public.create_notification_for_establishment(
        ${args.establishmentId}::uuid,
        ${"reservation_modified"}::notification_type,
        ${"Reserva alterada (Aiosell)"},
        ${`${code ? `Reserva ${code}` : "Reserva de canal"} — ${args.guestName} (${args.checkIn} a ${args.checkOut}) atualizada via ${partner}. Ref. ${args.bookingRef}.`},
        ${"medium"}::notification_priority,
        ${JSON.stringify({ reservation_id: args.reservationId, reservation_code: code || null, source: "aiosell_channel", lifecycle: "modify", booking_ref: args.bookingRef })}::jsonb
      )
    `;
  }

  private async notifyGuest(reservationId: string, logPrefix: string, headers?: Record<string, string | undefined>, skipConflictEmail = false): Promise<void> {
    const reservation = await this.fetchReservationFull(reservationId);
    if (!reservation) {
      this.logger.warn(`${logPrefix}: reserva não encontrada ${reservationId}`);
      return;
    }
    if (reservation.channel !== "ota") return;
    if (skipConflictEmail && (await this.shouldSkipGuestEmail(reservation))) {
      this.logger.warn(`${logPrefix}: e-mail de confirmação omitido (overbooking/conflito)`);
      return;
    }
    const establishmentId = String(reservation.establishment_id ?? "");
    if (!establishmentId) return;
    const siteRow = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { features_enabled: true, logo_url: true, pms_base_url: true, web_checkin_public_base_url: true },
    });
    const features = asRecord(siteRow?.features_enabled);
    if (!isFeatureEnabled(features?.email, establishmentId)) {
      this.logger.warn(`${logPrefix}: e-mail desativado para o estabelecimento`);
      return;
    }
    const emailSettings = await this.prisma.email_settings.findFirst({ where: { is_active: true } });
    if (!emailSettings) {
      this.logger.warn(`${logPrefix}: email_settings inativo ou ausente`);
      return;
    }
    const paid = reservation.payment_status === "paid" || (Number(reservation.paid_amount || 0) >= Number(reservation.total_amount || 0) && Number(reservation.total_amount || 0) > 0);
    const eventType = paid ? "payment.confirmed" : "reservation.created";
    const template = await this.resolveTemplate(eventType, establishmentId);
    if (!template) {
      this.logger.warn(`${logPrefix}: sem template ativo para ${eventType}`);
      return;
    }
    const guest = asRecord(reservation.guest);
    const financial = asRecord(reservation.financial_responsible);
    const recipientEmail = stringOrEmpty(guest?.email) || stringOrEmpty(financial?.email) || otaGuestEmail(reservation);
    const recipientName = stringOrEmpty(guest?.full_name) || stringOrEmpty(financial?.full_name) || otaGuestName(reservation) || stringOrEmpty(reservation.guest_name) || "Hóspede";
    if (!recipientEmail) {
      this.logger.warn(`${logPrefix}: sem e-mail do hóspede (guest/financeiro/OTA)`);
      return;
    }
    const hotel = await this.prisma.hotel_settings.findFirst({ where: { establishment_id: establishmentId } });
    await this.ensureWebCheckin(reservation, establishmentId);
    const refreshed = (await this.fetchReservationFull(reservationId)) ?? reservation;
    let baseUrl = detectBaseUrl(headers);
    if (siteRow?.pms_base_url?.trim()) {
      const pmsUrl = siteRow.pms_base_url.trim();
      try {
        baseUrl = new URL(pmsUrl.startsWith("http://") || pmsUrl.startsWith("https://") ? pmsUrl : `https://${pmsUrl}`).origin;
      } catch {
        baseUrl = pmsUrl;
      }
    }
    const variables = await this.buildEmailVariables(refreshed, hotel, siteRow, baseUrl, eventType);
    const subject = processTemplate(String(template.subject ?? ""), variables);
    const bodyHtml = processTemplate(String(template.body_html ?? ""), variables);
    if (emailSettings.provider === email_provider.resend || emailSettings.provider === email_provider.sendgrid) {
      const sent = await this.dispatchProvider(emailSettings, { to: recipientEmail, to_name: recipientName, subject, html: bodyHtml, text: "" }, headers);
      if (sent.status >= 200 && sent.status < 300) {
        this.logger.log(`${logPrefix}: enviado diretamente (${emailSettings.provider}) para ${recipientEmail}`);
        return;
      }
      this.logger.warn(`${logPrefix}: envio direto falhou, usando fila ${JSON.stringify(sent.body)}`);
    }
    await this.queueAndSend({ template, eventType, recipientEmail, recipientName, subject, bodyHtml, variables, reservationId, emailSettings, logPrefix, headers });
  }

  private async shouldSkipGuestEmail(reservation: JsonRecord): Promise<boolean> {
    const id = String(reservation.id ?? "");
    if (!id) return false;
    if (reservation.pending_resolved_at != null) return false;
    const notes = String(reservation.notes || "").toLowerCase();
    const roomId = reservation.room_id ? String(reservation.room_id) : "";
    if (notes.includes("overbooking") && !roomId) return true;
    const establishmentId = reservation.establishment_id ? String(reservation.establishment_id) : "";
    if (!roomId || !establishmentId) return false;
    const others = await this.prisma.reservations.findMany({
      where: { establishment_id: establishmentId, room_id: roomId, id: { not: id }, status: { in: ACTIVE_STAY_STATUSES } },
      select: { checkin_date: true, checkout_date: true },
    });
    return others.some((other) => stayOverlaps(ymd(reservation.checkin_date), ymd(reservation.checkout_date), ymd(other.checkin_date), ymd(other.checkout_date)));
  }

  private async resolveTemplate(eventType: "reservation.created" | "payment.confirmed", establishmentId: string): Promise<JsonRecord | null> {
    const prismaEvent = eventType === "payment.confirmed" ? email_event_type.payment_confirmed : email_event_type.reservation_created;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ template: unknown }>>`
        SELECT public.get_resolved_email_template(${eventType}::email_event_type, ${establishmentId}::uuid) AS template
      `;
      // RPC ok: null = desativado no estabelecimento — não cair no global
      const raw = rows[0]?.template;
      if (raw == null) return null;
      const resolved = asRecord(parseRpcObject(raw) ?? raw);
      return resolved?.id ? resolved : null;
    } catch (error) {
      this.logger.warn(`get_resolved_email_template ${errorMessage(error)}`);
    }
    // Fallback só se a RPC falhar: ainda respeita is_active=false
    try {
      const override = await this.prisma.establishment_email_templates.findFirst({
        where: { establishment_id: establishmentId, event_type: eventType as never },
        select: { is_active: true },
      });
      if (override && override.is_active === false) return null;
    } catch {
      /* ignore */
    }
    const templates = await this.prisma.email_templates.findMany({ where: { event_type: prismaEvent, is_active: true } });
    return pickEmailTemplate(templates.map((template) => ({ ...template })), establishmentId);
  }

  private async queueAndSend(args: {
    template: JsonRecord;
    eventType: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    bodyHtml: string;
    variables: TemplateVariables;
    reservationId: string;
    emailSettings: { provider: email_provider; sender_email: string; sender_name: string; reply_to_email: string | null; api_key: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_username: string | null; smtp_password: string | null };
    logPrefix: string;
    headers?: Record<string, string | undefined>;
  }): Promise<void> {
    const cc = String(args.template.cc_emails ?? "").trim() || null;
    const bcc = String(args.template.bcc_emails ?? "").trim() || null;
    let queueId: string | null = null;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string | null }>>`
        SELECT public.insert_email_queue(
          ${String(args.template.id)}::uuid,
          ${args.eventType},
          ${args.recipientEmail},
          ${args.recipientName || ""},
          ${args.subject},
          ${args.bodyHtml},
          ${args.reservationId}::uuid,
          ${JSON.stringify(args.variables)}::jsonb,
          ${1}::integer,
          ${cc},
          ${bcc}
        ) AS id
      `;
      queueId = rows[0]?.id ?? null;
    } catch (error) {
      this.logger.warn(`${args.logPrefix}: insert_email_queue ${errorMessage(error)}`);
    }
    if (!queueId) {
      try {
        const inserted = await this.prisma.email_queue.create({
          data: {
            template_id: String(args.template.id),
            event_type: args.eventType === "payment.confirmed" ? email_event_type.payment_confirmed : email_event_type.reservation_created,
            recipient_email: args.recipientEmail,
            recipient_name: args.recipientName,
            subject: args.subject,
            body_html: args.bodyHtml,
            reservation_id: args.reservationId,
            variables: args.variables as Prisma.InputJsonValue,
            priority: 1,
            status: email_status.pending,
            cc_emails: cc,
            bcc_emails: bcc,
          },
          select: { id: true },
        });
        queueId = inserted.id;
      } catch (error) {
        this.logger.warn(`${args.logPrefix}: insert direto email_queue ${errorMessage(error)}`);
        return;
      }
    }
    await this.dispatchQueued(queueId, args.emailSettings, args.logPrefix, args.headers);
  }

  private async dispatchQueued(
    queueId: string,
    emailSettings: { provider: email_provider; sender_email: string; sender_name: string; reply_to_email: string | null; api_key: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_username: string | null; smtp_password: string | null },
    logPrefix: string,
    headers?: Record<string, string | undefined>,
  ): Promise<void> {
    const item = await this.prisma.email_queue.findUnique({ where: { id: queueId } });
    if (!item) {
      this.logger.warn(`${logPrefix}: fila email — item não encontrado ${queueId}`);
      return;
    }
    await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.sending } });
    const fail = async (message: string) => {
      await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.pending, error_message: message.slice(0, 500) } });
    };
    try {
      const sent = await this.dispatchProvider(emailSettings, {
        to: item.recipient_email,
        to_name: item.recipient_name ?? undefined,
        subject: item.subject,
        html: item.body_html,
        text: item.body_text ?? "",
      }, headers);
      if (sent.status >= 200 && sent.status < 300) {
        await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.sent, sent_at: new Date() } });
      } else {
        await fail(JSON.stringify(sent.body));
      }
    } catch (error) {
      this.logger.warn(`${logPrefix}: erro ao enviar fila ${errorMessage(error)}`);
      await fail(errorMessage(error));
    }
  }

  private async dispatchProvider(
    settings: { provider: email_provider; sender_email: string; sender_name: string; reply_to_email: string | null; api_key: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_username: string | null; smtp_password: string | null },
    message: { to: string; to_name?: string; subject: string; html: string; text?: string },
    headers?: Record<string, string | undefined>,
  ): Promise<HttpResult> {
    const body = {
      to: message.to,
      to_name: message.to_name,
      from: settings.sender_email,
      from_name: settings.sender_name,
      reply_to: settings.reply_to_email || settings.sender_email,
      subject: message.subject,
      html: message.html,
      text: message.text ?? "",
      api_key: settings.api_key || "",
      smtp_config: {
        host: settings.smtp_host || undefined,
        port: settings.smtp_port || 587,
        secure: settings.smtp_secure || false,
        auth: { user: settings.smtp_username || undefined, pass: settings.smtp_password || undefined },
      },
    };
    if (settings.provider === email_provider.resend) return this.email.resend(body);
    if (settings.provider === email_provider.sendgrid) return this.email.sendgrid(body);
    if (settings.provider === email_provider.smtp) {
      return this.email.smtp(header(headers ?? {}, "authorization") || "Bearer internal", body);
    }
    return { status: 400, body: { error: `Provedor de e-mail não suportado: ${settings.provider}` } };
  }

  private async sendCheckinAutomations(reservationId: string, establishmentId: string, logPrefix: string): Promise<void> {
    const config = await this.prisma.checkin_charge_config.findFirst({
      where: { establishment_id: establishmentId, enabled: true },
      select: { send_timing: true },
    });
    if (!config) return;
    const row = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { status: true, total_amount: true, paid_amount: true, channel: true },
    });
    if (!row) return;
    const status = String(row.status ?? "");
    const isOta = String(row.channel ?? "direct") !== "direct";
    const eligible = status === "confirmed" || (isOta && (status === "pending" || status === "preregistration"));
    const total = Number(row.total_amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    if (total > 0 && paid < total) {
      await this.postCheckin(reservationId, "payment_pending", logPrefix);
      return;
    }
    if ((config.send_timing === "after_confirmation" || (config.send_timing === "after_ota" && isOta)) && eligible) {
      await this.postCheckin(reservationId, "checkin_reminder", logPrefix);
    }
  }

  private async sendCheckinEvent(reservationIds: string[], establishmentId: string, logPrefix: string, intent: "reservation_cancelled" | "reservation_modified" | "reservation_overbooking"): Promise<void> {
    if (reservationIds.length === 0) return;
    const config = await this.prisma.checkin_charge_config.findFirst({ where: { establishment_id: establishmentId }, select: { enabled: true } });
    if (!config?.enabled) return;
    for (const reservationId of reservationIds) await this.postCheckin(reservationId, intent, logPrefix);
  }

  private async postCheckin(reservationId: string, intent: string, logPrefix: string): Promise<void> {
    const result = await this.checkinCharge.run({ reservation_id: reservationId, intent });
    const data = asRecord(result.body);
    const first = Array.isArray(data?.results) ? asRecord(data.results[0]) : null;
    if (result.status < 200 || result.status >= 300 || first?.success === false) {
      this.logger.warn(`${logPrefix}: send-checkin-charge ${intent} ${reservationId} ${String(first?.error ?? data?.error ?? result.status)}`);
    }
  }

  private async fetchReservationFull(reservationId: string): Promise<JsonRecord | null> {
    const load = () =>
      this.prisma.reservations.findUnique({
        where: { id: reservationId },
        include: {
          clients_reservations_client_idToclients: true,
          clients_reservations_guest_idToclients: true,
          rooms: { select: { id: true, room_number: true, name: true, fixed_password: true } },
          room_categories: { select: { id: true, name: true, description: true, building_id: true } },
          reservation_service_fees: { select: { amount: true, quantity: true } },
          ota_reservations: { select: { ota_guest_email: true, ota_guest_name: true } },
        },
      });
    let row = await load();
    if (!row) return null;
    if (!row.reservation_code) {
      await delay(300);
      row = (await load()) ?? row;
    }
    return {
      ...row,
      checkin_date: ymd(row.checkin_date),
      checkout_date: ymd(row.checkout_date),
      checkin_time: timeToSql(row.checkin_time),
      checkout_time: timeToSql(row.checkout_time),
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount),
      identification_number: row.identification_number?.toString(),
      guest: row.clients_reservations_guest_idToclients,
      financial_responsible: row.clients_reservations_client_idToclients,
      reservation_service_fees: row.reservation_service_fees.map((fee) => ({ amount: Number(fee.amount), quantity: fee.quantity })),
    };
  }

  private async ensureWebCheckin(reservation: JsonRecord, establishmentId: string): Promise<void> {
    const reservationId = String(reservation.id);
    const existing = await this.prisma.web_checkin.findUnique({ where: { reservation_id: reservationId }, select: { id: true } });
    if (existing) return;
    const code = reservation.reservation_code ? String(reservation.reservation_code) : "";
    if (!code) return;
    const token = Buffer.from(`${reservationId}:${code}:${Date.now()}`).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
    const checkin = reservation.checkin_date ? String(reservation.checkin_date) : new Date().toISOString();
    const checkout = reservation.checkout_date ? String(reservation.checkout_date) : null;
    const expiresAt = computeWebCheckinExpiresAt(checkin, checkout);
    await this.prisma.web_checkin.create({ data: { reservation_id: reservationId, establishment_id: establishmentId, token, locator: code, expires_at: expiresAt, status: "pending" } });
  }

  private async buildEmailVariables(
    reservation: JsonRecord,
    hotel: JsonRecord | null,
    site: { logo_url?: string | null; pms_base_url?: string | null; web_checkin_public_base_url?: string | null } | null,
    baseUrl: string,
    eventType: string,
  ): Promise<TemplateVariables> {
    const hotelRecord = hotel ?? {};
    const checkinTimeRaw = String(reservation.checkin_time || hotelRecord.checkin_time || "14:00");
    const checkoutTimeRaw = String(reservation.checkout_time || hotelRecord.checkout_time || "12:00");
    const address = hotelAddress(hotelRecord);
    const phone = hotelRecord.phone_ddi && hotelRecord.phone_number ? `${hotelRecord.phone_ddi} ${hotelRecord.phone_number}` : String(hotelRecord.phone_number || hotelRecord.phone || "");
    const whatsapp = String(hotelRecord.whatsapp || (hotelRecord.whatsapp_ddi && hotelRecord.whatsapp_number ? `${hotelRecord.whatsapp_ddi} ${hotelRecord.whatsapp_number}` : hotelRecord.whatsapp_number || ""));
    const web = await this.prisma.web_checkin.findUnique({ where: { reservation_id: String(reservation.id) }, select: { locator: true } });
    const locator = web?.locator || (reservation.reservation_code ? String(reservation.reservation_code) : "");
    const fees = Array.isArray(reservation.reservation_service_fees) ? reservation.reservation_service_fees : [];
    const feeTotal = fees.reduce<number>((sum, fee) => sum + Number(asRecord(fee)?.amount || 0) * Number(asRecord(fee)?.quantity || 1), 0);
    const total = Number(reservation.total_amount || 0) + feeTotal;
    const paid = Number(reservation.paid_amount || 0);
    const guest = asRecord(reservation.guest);
    const financial = asRecord(reservation.financial_responsible);
    const room = asRecord(reservation.rooms);
    const category = asRecord(reservation.room_categories);
    // Estabelecimento → sistema; só logo_url (hotel_logo vazio evita duplicata)
    const logos = publicLogoUrls(
      String(hotelRecord.logo_url || ""),
      String(site?.logo_url || ""),
    );
    const preferredLogo =
      (logos.logoUrl && /^https?:\/\//i.test(logos.logoUrl) ? logos.logoUrl : "") ||
      (logos.hotelLogo && /^https?:\/\//i.test(logos.hotelLogo) ? logos.hotelLogo : "") ||
      logos.logoUrl ||
      logos.hotelLogo ||
      "";
    return {
      guest_name: stringOrEmpty(guest?.full_name) || stringOrEmpty(financial?.full_name) || otaGuestName(reservation) || stringOrEmpty(reservation.guest_name) || "Hóspede",
      reservation_code: String(reservation.reservation_code || ""),
      identification_number: reservation.identification_number ? `#${String(reservation.identification_number).trim()}` : String(reservation.reservation_code || ""),
      checkin_date: formatDatePt(String(reservation.checkin_date || "")),
      checkout_date: formatDatePt(String(reservation.checkout_date || "")),
      checkin_time: checkinTimeRaw.includes(":") ? checkinTimeRaw.slice(0, 5) : checkinTimeRaw,
      checkout_time: checkoutTimeRaw.includes(":") ? checkoutTimeRaw.slice(0, 5) : checkoutTimeRaw,
      total_amount: total.toFixed(2).replace(".", ","),
      paid_amount: paid.toFixed(2).replace(".", ","),
      payment_status: eventType === "payment.confirmed" || reservation.payment_status === "paid" ? "Pago" : "Pendente",
      room_number: String(room?.room_number || ""),
      room_name: String(room?.name || ""),
      room_password: String(room?.fixed_password || ""),
      room_category: String(category?.name || ""),
      category_name: String(category?.name || ""),
      adults: Number(reservation.adults || 0),
      children: Number(reservation.children || 0),
      hotel_name: String(hotelRecord.name || ""),
      hotel_address: address,
      hotel_contact: phone,
      hotel_email: String(hotelRecord.email || ""),
      hotel_phone: phone,
      hotel_whatsapp: whatsapp,
      hotel_website: String(hotelRecord.website || ""),
      hotel_policies: typeof hotelRecord.policies === "string" ? hotelRecord.policies : "",
      policies_link: policiesLink(hotelRecord, reservation, baseUrl),
      web_checkin_link: locator ? buildWebCheckinLocatorUrl(locator, site) : "",
      logo_url: preferredLogo,
      hotel_logo: "",
      payment_link: "",
    };
  }

  private async pullBookings(channel: ota_channels, daysBack: number, daysAhead: number): Promise<{ bookings: JsonRecord[] } | HttpResult> {
    const listPath = channel.aiosell_bookings_list_path?.trim();
    if (!listPath) {
      return {
        status: 400,
        body: {
          success: false,
          error: "Preencha `aiosell_bookings_list_path` no canal (endpoint GET fornecido pela Aiosell) ou envie `bookings: [...]` no corpo.",
          hint: "A documentação pública Aiosell descreve apenas o webhook push; o endpoint de listagem depende do contrato com o suporte Aiosell.",
        },
      };
    }
    const hotelCode = channel.aiosell_hotel_code ? normalizeChannelCodeInput(channel.aiosell_hotel_code) : "";
    if (!channel.api_key || !channel.api_secret || !hotelCode) {
      return { status: 400, body: { success: false, error: "Configure api_key, api_secret e aiosell_hotel_code no canal para pull HTTP." } };
    }
    const url = new URL(joinBaseUrlAndPath(channel.aiosell_base_url || "https://live.aiosell.com", listPath));
    const fromDate = addDaysIso(new Date(), -daysBack);
    const toDate = addDaysIso(new Date(), daysAhead);
    if (!url.searchParams.has("hotelCode")) url.searchParams.set("hotelCode", hotelCode);
    if (!url.searchParams.has("fromDate")) url.searchParams.set("fromDate", fromDate);
    if (!url.searchParams.has("toDate")) url.searchParams.set("toDate", toDate);
    const response = await fetch(url.toString(), { method: "GET", headers: { Authorization: basicAuthHeader(channel.api_key, channel.api_secret), Accept: "application/json" } });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return { status: 502, body: { success: false, error: "Resposta do canal não é JSON", status: response.status, preview: text.slice(0, 400) } };
    }
    if (!response.ok) return { status: 502, body: { success: false, error: `HTTP ${response.status} ao obter reservas`, body: parsed } };
    return { bookings: extractBookingsArray(parsed) };
  }

  private scheduleInventoryPush(channelId: string, establishmentId: string, logPrefix: string): void {
    const token = (this.config.get<string>("INTERNAL_API_TOKEN") || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!token) {
      this.logger.warn(`${logPrefix}: INTERNAL_API_TOKEN ou SUPABASE_SERVICE_ROLE_KEY ausente`);
      return;
    }
    void this.aiosellSync
      .run(`Bearer ${token}`, { channel_id: channelId, establishment_id: establishmentId })
      .then((result) => {
        const payload = result.body as { success?: boolean; error?: unknown };
        if (result.status >= 400 || payload.success === false) {
          this.logger.warn(`${logPrefix}: aiosell-sync HTTP ${result.status} ${String(payload.error ?? "").slice(0, 240)}`);
        }
      })
      .catch((error) => {
        this.logger.warn(`${logPrefix}: aiosell-sync ${errorMessage(error)}`);
      });
  }
}

function envFlagTrue(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function aiosellLifecycleQueueEnabled(): boolean {
  return !envFlagTrue("AIOSELL_AUTO_APPLY_CANCEL_MODIFY");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) return value;
  }
  return undefined;
}

function requestUrl(headers: Record<string, string | undefined>): URL {
  for (const name of ["x-original-url", "x-request-url", "x-forwarded-uri", "x-invoke-path"]) {
    const raw = header(headers, name);
    if (!raw) continue;
    try {
      if (raw.startsWith("http://") || raw.startsWith("https://")) return new URL(raw);
      const host = header(headers, "x-forwarded-host") || header(headers, "host") || "localhost";
      const proto = header(headers, "x-forwarded-proto") || "https";
      return new URL(raw.startsWith("/") ? `${proto}://${host}${raw}` : `${proto}://${host}/${raw}`);
    } catch {
      /* next candidate */
    }
  }
  return new URL("https://localhost/functions/v1/aiosell-reservation-webhook");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseBasicAuth(value: string | null): { user: string; pass: string } | null {
  if (!value?.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6).trim(), "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index < 0) return null;
    return { user: decoded.slice(0, index), pass: decoded.slice(index + 1) };
  } catch {
    return null;
  }
}

function parseBearerOrTokenAuth(value: string | null): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("bearer ")) return value.slice(7).trim() || null;
  if (lower.startsWith("token ")) return value.slice(6).trim() || null;
  return null;
}

function looksLikeJwt(token: string): boolean {
  const parts = token.trim().split(".");
  return token.trim().startsWith("eyJ") && parts.length === 3 && parts.every((part) => part.length > 0);
}

function isSupabasePlatformBearer(token: string | null): boolean {
  if (!token?.trim()) return false;
  const value = token.trim();
  return [process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SB_PUBLISHABLE_KEY].some((secret) => !!secret?.trim() && secret.trim() === value);
}

function resolveBearerForChannel(bearerRaw: string | null, webhookSecret: string, apiSecret: string): string | null {
  if (!bearerRaw?.trim()) return null;
  const bearer = bearerRaw.trim();
  if (webhookSecret && bearer === webhookSecret) return bearer;
  if (apiSecret && bearer === apiSecret) return bearer;
  if (isSupabasePlatformBearer(bearer) || looksLikeJwt(bearer)) return null;
  return bearer;
}

function pickWebhookSecretFromBody(body: JsonRecord): string {
  const root = stringField(body, ["secret", "webhookSecret", "webhook_secret", "authToken"]);
  if (root) return root;
  const data = asRecord(body.data);
  return data ? stringField(data, ["webhookSecret", "webhook_secret", "authToken", "secret"]) : "";
}

function pickSecretFromQuery(url: URL): string {
  for (const name of ["secret", "token", "auth", "webhook_secret", "pms_secret", "key"]) {
    const value = url.searchParams.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function gateKeyMatchesUrl(url: URL): boolean {
  const expected = (process.env.AIOSELL_WEBHOOK_GATE_KEY ?? "").trim();
  const given = url.searchParams.get("gate")?.trim();
  return !!expected && !!given && given === expected;
}

function pickBodyApiSecretToken(layers: JsonRecord[]): string {
  return firstNonEmptyString(layers, ["apiSecret", "api_secret", "pmsApiSecret", "channelApiSecret", "webhookApiSecret"]) ?? "";
}

function bodyApiKeySecretMatchesChannel(channel: { api_key?: string | null; api_secret?: string | null }, layers: JsonRecord[]): boolean {
  const key = firstNonEmptyString(layers, ["apiKey", "api_key", "pmsApiKey", "username", "user"]);
  const secret = firstNonEmptyString(layers, ["apiSecret", "api_secret", "pmsApiSecret"]);
  if (!key || !secret) return false;
  return String(channel.api_key ?? "").trim() === key && String(channel.api_secret ?? "").trim() === secret;
}

function trustHotelCodeBypass(hotelCode: string | undefined, otaChannelIdParam: string | null): boolean {
  if (!envFlagTrue("AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY")) return false;
  if (otaChannelIdParam) return true;
  const code = normalizeAiosellCodeInput(hotelCode ?? "");
  if (!code) return false;
  const allow = (process.env.AIOSELL_WEBHOOK_TRUST_HOTEL_CODES ?? "").trim();
  if (!allow) return true;
  return allow.split(",").map((item) => normalizeAiosellCodeInput(item)).filter(Boolean).some((item) => item.toLowerCase() === code.toLowerCase());
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  const record = asRecord(value);
  if (!record) return value;
  const hidden = /secret|password|api_key|apikey|authorization|token/i;
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, hidden.test(key) ? "[redacted]" : redactSecrets(item)]));
}

function collectLayers(body: JsonRecord): JsonRecord[] {
  const out: JsonRecord[] = [body];
  for (const key of ["data", "payload", "reservation", "booking"]) {
    const nested = asRecord(body[key]);
    if (nested) out.push(nested);
  }
  const data = asRecord(body.data);
  if (data) {
    for (const key of ["reservation", "booking"]) {
      const nested = asRecord(data[key]);
      if (nested) out.push(nested);
    }
  }
  return out;
}

function firstNonEmptyString(layers: JsonRecord[], keys: string[]): string | undefined {
  for (const layer of layers) {
    for (const key of keys) {
      const value = layer[key];
      if (typeof value === "number" && !Number.isNaN(value)) return String(value);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}

function stringField(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function layerString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  if (typeof value === "number" && !Number.isNaN(value)) return String(value);
  return null;
}

function normalizeAiosellPrimaryAction(value: string): string {
  if (["change", "changed", "amend", "amended", "alter", "altered", "edit", "edited", "adjust", "adjustment", "revision"].includes(value)) return "modify";
  return value;
}

function normalizeActionFromLayers(layers: JsonRecord[]): string {
  for (const layer of layers) {
    for (const key of ["action", "bookingAction", "booking_action", "operationType", "operation_type"]) {
      const value = layerString(layer[key]);
      if (value) return normalizeAiosellPrimaryAction(value);
    }
  }
  for (const layer of layers) {
    for (const key of ["event", "bookingType", "operation"]) {
      const value = layerString(layer[key]);
      if (!value) continue;
      if (value === "modification" || value === "modification_request" || value === "booking_modification") return "modify";
      if (value === "cancellation" || value === "cancel_request" || value === "booking_cancellation") return "cancel";
      return normalizeAiosellPrimaryAction(value);
    }
  }
  for (const layer of layers) {
    const value = layerString(layer.type);
    if (!value) continue;
    if (value.includes("modif") || value.includes("change") || value.endsWith("_update") || value === "booking_updated") return "modify";
    if (value.includes("cancel")) return "cancel";
    if (value === "book" || value === "new" || value === "booking") return "book";
  }
  for (const layer of layers) {
    if (layer.status == null || layer.status === "") continue;
    const value = String(layer.status).trim().toLowerCase();
    if (value === "cancelled" || value === "canceled") return "cancel";
    if (value === "modified" || value === "update") return "modify";
  }
  return "";
}

function pickBookingIdFromLayers(layers: JsonRecord[]): string | undefined {
  return firstNonEmptyString(layers, ["bookingId", "cmBookingId", "otaBookingId", "reservation_id", "reservationId", "booking_id", "bookingReference", "confirmationNo", "confirmationNumber", "externalBookingId", "reference", "bookingCode", "ota_booking_id", "confirmation_code", "bookingNumber", "booking_id_ext", "id"]);
}

function pickRoomsFromLayers(layers: JsonRecord[]): JsonRecord[] {
  for (const layer of layers) {
    for (const key of ["rooms", "roomList", "room_stays", "roomStays"]) {
      const rooms = layer[key];
      if (Array.isArray(rooms) && rooms.length) return rooms.filter((room): room is JsonRecord => !!asRecord(room));
    }
    const single = asRecord(layer.room);
    if (single) return [single];
  }
  return [];
}

function pickGuestObject(layers: JsonRecord[]): JsonRecord {
  for (const layer of layers) {
    const guest = asRecord(layer.guest);
    if (guest) return guest;
  }
  return {};
}

function isBadGuestNameToken(value: string): boolean {
  const token = value.trim().toLowerCase();
  return token === "" || token === "null" || token === "undefined";
}

function pickGuestString(guest: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = guest[key];
    if (value == null || value === "") continue;
    const raw = String(value).trim();
    if (!isBadGuestNameToken(raw)) return raw;
  }
  return undefined;
}

function sanitizeGuestName(value: string): string {
  let text = value.trim().replace(/\s+/g, " ");
  text = text.replace(/\s+(null|undefined)\s*$/gi, "").replace(/^(null|undefined)\s+/gi, "").trim();
  return isBadGuestNameToken(text) ? "" : text;
}

function buildAiosellGuestName(body: JsonRecord, layers: JsonRecord[], guest: JsonRecord, room: JsonRecord): string {
  const fromLayers = firstNonEmptyString(layers, ["guestName", "guest_name"]);
  if (fromLayers && !isBadGuestNameToken(fromLayers)) return sanitizeGuestName(fromLayers);
  if (typeof body.guestName === "string" && body.guestName.trim() && !isBadGuestNameToken(body.guestName.trim())) return sanitizeGuestName(body.guestName.trim());
  const fromRoom = firstNonEmptyString([room], ["guestName", "guest_name", "primaryGuestName"]);
  if (fromRoom && !isBadGuestNameToken(fromRoom)) return sanitizeGuestName(fromRoom);
  const combined = [pickGuestString(guest, ["firstName", "first_name", "givenName", "given_name"]), pickGuestString(guest, ["lastName", "last_name", "surname", "familyName"])].filter((part): part is string => !!part).join(" ").trim();
  if (combined) return sanitizeGuestName(combined);
  return pickGuestString(guest, ["name", "fullName", "full_name"]) ? sanitizeGuestName(pickGuestString(guest, ["name", "fullName", "full_name"]) as string) : "Hóspede OTA";
}

function formatPartnerChannelName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  const lower = value.toLowerCase();
  if (lower === "airbnb") return "Airbnb";
  if (lower === "booking" || lower === "booking.com") return "Booking.com";
  if (lower === "expedia") return "Expedia";
  if (lower === "direct") return "Direct";
  return value;
}

function normalizePartnerKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isKnownOtaPartner(partnerKey: string): boolean {
  return ["booking.com", "booking", "airbnb", "expedia", "direct"].includes(partnerKey);
}

function pickGuestPhone(guest: JsonRecord): string | null {
  for (const key of ["phone", "mobile", "phoneNumber", "mobilePhone", "telephone", "tel"]) {
    const value = guest[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function pickAiosellBookingMeta(body: JsonRecord, layers: JsonRecord[]) {
  const source = firstNonEmptyString(layers, ["channel", "channelName", "sourceChannel", "otaChannel", "partnerChannel"]) || (typeof body.channel === "string" ? body.channel.trim() : "");
  const segment = firstNonEmptyString(layers, ["segment", "bookingSegment"]) || (typeof body.segment === "string" ? body.segment.trim() : "");
  return {
    sourceChannel: source || null,
    segment: segment || null,
    cmBookingId: firstNonEmptyString(layers, ["cmBookingId", "cm_booking_id", "itineraryId", "itinerary_id"]) || null,
    specialRequests: firstNonEmptyString(layers, ["specialRequests", "special_requests", "remarks"]) || null,
    bookedOn: firstNonEmptyString(layers, ["bookedOn", "booked_on", "bookingDate", "booking_date"]) || null,
  };
}

function guestAddressJson(value: unknown): JsonRecord | null {
  return asRecord(value);
}

function buildAiosellReservationNotes(bookingId: string, meta: ReturnType<typeof pickAiosellBookingMeta>): string {
  const parts = [`Aiosell booking ${bookingId}`];
  if (meta.sourceChannel) parts.push(`Canal parceiro: ${formatPartnerChannelName(meta.sourceChannel)}`);
  if (meta.segment) parts.push(`Segmento: ${meta.segment}`);
  if (meta.cmBookingId) parts.push(`CM booking: ${meta.cmBookingId}`);
  if (meta.bookedOn) parts.push(`Reservado em: ${meta.bookedOn}`);
  if (meta.specialRequests) parts.push(`Pedidos: ${meta.specialRequests}`);
  return parts.join(" · ");
}

const CHECKIN_KEYS = ["checkin", "checkIn", "checkin_date", "checkinDate", "arrivalDate", "arrival", "fromDate", "startDate", "check_in", "dateFrom", "start_date", "stayFrom", "stay_from", "from"];
const CHECKOUT_KEYS = ["checkout", "checkOut", "checkout_date", "checkoutDate", "departureDate", "departure", "toDate", "endDate", "check_out", "dateTo", "end_date", "stayTo", "stay_to", "to"];

function pickCheckIn(room: JsonRecord, layers: JsonRecord[]): string | undefined {
  return firstNonEmptyString([room], CHECKIN_KEYS) || firstNonEmptyString(layers, CHECKIN_KEYS);
}

function pickCheckOut(room: JsonRecord, layers: JsonRecord[]): string | undefined {
  return firstNonEmptyString([room], CHECKOUT_KEYS) || firstNonEmptyString(layers, CHECKOUT_KEYS);
}

function normalizeAiosellDateField(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw.trim();
}

function isValidPmsStayRange(checkin: string | undefined, checkout: string | undefined): boolean {
  const start = normalizeAiosellDateField(checkin) ?? String(checkin ?? "").trim();
  const end = normalizeAiosellDateField(checkout) ?? String(checkout ?? "").trim();
  return !!start && !!end && start < end;
}

function pickRoomCode(room: JsonRecord, layers: JsonRecord[]): string | undefined {
  const keys = ["roomCode", "room_code", "roomTypeCode", "room_type_code", "categoryCode", "roomType", "roomId"];
  return firstNonEmptyString([room], keys) || firstNonEmptyString(layers, keys);
}

function pickRateplanCode(room: JsonRecord, layers: JsonRecord[]): string | undefined {
  const keys = ["rateplanCode", "rate_plan_code", "ratePlanCode", "rateCode", "mealPlanCode", "rate_plan"];
  return firstNonEmptyString([room], keys) || firstNonEmptyString(layers, keys);
}

function normalizeAiosellCodeInput(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function normalizeChannelCodeInput(value: unknown): string {
  return normalizeAiosellCodeInput(value);
}

function sanitizeAiosellCode(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function extractNumberFromAmountLike(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value.trim()))) return Number(value.trim());
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ["amountAfterTax", "amountBeforeTax", "total", "amount", "grandTotal"]) {
    const nested = extractNumberFromAmountLike(record[key]);
    if (nested != null) return nested;
  }
  return undefined;
}

function pickTotalAmountFromRoomObjectOnly(room: JsonRecord): number | null {
  const direct = extractNumberFromAmountLike(room.amount) ?? extractNumberFromAmountLike(room.total);
  if (direct != null) return direct;
  for (const key of ["totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"]) {
    if (room[key] != null && room[key] !== "" && !Number.isNaN(Number(room[key]))) return Number(room[key]);
  }
  return null;
}

function summarizeAiosellRoomLine(room: JsonRecord, index: number): JsonRecord {
  return { index, roomCode: pickRoomCode(room, []) ?? null, rateplanCode: pickRateplanCode(room, []) ?? null, amount_numeric_on_room: pickTotalAmountFromRoomObjectOnly(room) };
}

function pickTotalAmount(room: JsonRecord, body: JsonRecord, layers: JsonRecord[]): number {
  const direct = extractNumberFromAmountLike(room.amount) ?? extractNumberFromAmountLike(body.amount);
  if (direct != null) return direct;
  const keys = ["amount", "totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"];
  for (const source of [room, body, ...layers]) {
    for (const key of keys) {
      if (source[key] != null && source[key] !== "" && !Number.isNaN(Number(source[key]))) return Number(source[key]);
    }
  }
  return 0;
}

function splitMoneyAcrossParts(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function sumRoomSellRates(room: JsonRecord): number | null {
  if (!Array.isArray(room.prices) || room.prices.length === 0) return null;
  let sum = 0;
  let found = false;
  for (const price of room.prices) {
    const record = asRecord(price);
    const rate = record?.sellRate ?? record?.sell_rate ?? record?.rate ?? record?.price;
    const numeric = Number(rate);
    if (rate != null && !Number.isNaN(numeric) && numeric > 0) {
      sum += numeric;
      found = true;
    }
  }
  return found ? sum : null;
}

function computePerRoomAmounts(rooms: JsonRecord[], room0: JsonRecord, body: JsonRecord, layers: JsonRecord[]): { amounts: number[]; strategy: string } {
  const perRoom = rooms.map((room) => pickTotalAmountFromRoomObjectOnly(room));
  if (perRoom.length > 0 && perRoom.every((amount) => amount != null && !Number.isNaN(amount))) {
    return { amounts: perRoom.map((amount) => amount as number), strategy: "per_room_lines" };
  }
  const bookingTotal = pickTotalAmount(room0, body, layers);
  if (rooms.length > 1) {
    const weights = rooms.map((room) => sumRoomSellRates(room));
    if (weights.every((weight) => weight != null && weight > 0) && bookingTotal > 0) {
      const totalWeight = (weights as number[]).reduce((sum, weight) => sum + weight, 0);
      return { amounts: (weights as number[]).map((weight) => Math.round((weight / totalWeight) * bookingTotal * 100) / 100), strategy: "prices_proportional" };
    }
  }
  return { amounts: splitMoneyAcrossParts(bookingTotal, rooms.length), strategy: "split_booking_total" };
}

function splitAiosellRatePlanCodes(raw: unknown): string[] {
  const source = String(raw ?? "").replace(/\u00a0/g, " ");
  if (!source.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of source.split(/[,;\n\r]+/)) {
    const token = part.trim();
    const key = token.toLowerCase();
    if (!token || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function channelRateplanMatches(stored: unknown, incoming: string | null | undefined): boolean {
  if (incoming == null || !String(incoming).trim()) return true;
  const storedText = String(stored ?? "").trim();
  if (!storedText) return true;
  const want = String(incoming).toUpperCase().trim();
  return splitAiosellRatePlanCodes(storedText).some((code) => code.toUpperCase() === want);
}

function findChannelPricingMapping(roomCode: string | undefined, rateplanCode: string | undefined, rows: PricingRow[]): { category_id: string; pricing_plan_id?: string | null } | null {
  if (!roomCode) return null;
  const exact = rows.find((row) => row.channel_room_code && row.channel_room_code.toUpperCase() === roomCode.toUpperCase() && channelRateplanMatches(row.channel_rate_plan_code, rateplanCode));
  const fallback = exact ?? rows.find((row) => row.channel_room_code && row.channel_room_code.toUpperCase() === roomCode.toUpperCase());
  if (!fallback?.category_id) return null;
  return { category_id: fallback.category_id, pricing_plan_id: fallback.pricing_plan_id };
}

function boolFromUnknown(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

function looksLikePrepaid(value: unknown): boolean {
  if (value == null) return false;
  const text = String(value).toLowerCase().trim();
  return text.includes("prepaid") || text.includes("pre-paid") || text.includes("pre pago") || text.includes("prepago") || text === "pp";
}

function isAiosellPrepaidBooking(layers: JsonRecord[], body: JsonRecord): boolean {
  const pahKeys = ["pah", "payAtHotel", "pay_at_hotel", "paymentAtHotel"];
  for (const layer of [...layers, body]) {
    for (const key of pahKeys) {
      if (!(key in layer)) continue;
      const value = boolFromUnknown(layer[key]);
      if (value === true) return false;
      if (value === false) return true;
    }
  }
  const statusKeys = ["paymentStatus", "payment_status", "bookingPaymentStatus", "paymentType", "payment_type", "bookingPaymentType", "prepaidStatus"];
  for (const layer of layers) {
    if (statusKeys.some((key) => looksLikePrepaid(layer[key])) || looksLikePrepaid(layer.segment) || looksLikePrepaid(layer.bookingSegment)) return true;
  }
  return statusKeys.some((key) => looksLikePrepaid(body[key])) || looksLikePrepaid(body.segment);
}

function parseRpcObject(value: unknown): JsonRecord | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function ymd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function timeToSql(value: Date | null | undefined): string | null {
  if (!value) return null;
  const hours = value.getUTCHours().toString().padStart(2, "0");
  const minutes = value.getUTCMinutes().toString().padStart(2, "0");
  const seconds = value.getUTCSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function moneyDisplay(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end && out.length < 400) {
    out.push(cursor);
    cursor = addDaysIso(utcDate(cursor), 1);
  }
  return out;
}

function stayOverlaps(checkin: string, checkout: string, otherIn: string, otherOut: string): boolean {
  return !!checkin && !!checkout && !!otherIn && !!otherOut && checkin < otherOut && otherIn < checkout;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringOrEmpty(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function otaGuestEmail(reservation: JsonRecord): string {
  const rows = Array.isArray(reservation.ota_reservations) ? reservation.ota_reservations : [reservation.ota_reservations];
  const email = asRecord(rows[0])?.ota_guest_email;
  return stringOrEmpty(email);
}

function otaGuestName(reservation: JsonRecord): string {
  const rows = Array.isArray(reservation.ota_reservations) ? reservation.ota_reservations : [reservation.ota_reservations];
  return stringOrEmpty(asRecord(rows[0])?.ota_guest_name);
}

function isFeatureEnabled(config: unknown, establishmentId: string): boolean {
  if (!establishmentId) return false;
  if (typeof config === "boolean") return config;
  const record = asRecord(config);
  if (!record || record.enabled !== true) return false;
  if (!Array.isArray(record.establishment_ids)) return true;
  return record.establishment_ids.includes(establishmentId);
}

function pickEmailTemplate(templates: JsonRecord[], establishmentId: string): JsonRecord | null {
  for (const template of templates) {
    const ids = template.establishment_ids;
    if (ids == null) return template;
    const list = Array.isArray(ids) ? ids : typeof ids === "string" ? safeJsonArray(ids) : [];
    if (list.length === 0) continue;
    if (list.includes(establishmentId)) return template;
  }
  return null;
}

function safeJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hotelAddress(hotel: JsonRecord): string {
  const parts: string[] = [];
  if (hotel.street) parts.push(hotel.number ? `${hotel.street}, ${hotel.number}` : String(hotel.street));
  if (hotel.neighborhood) parts.push(String(hotel.neighborhood));
  if (hotel.city) {
    let city = String(hotel.city);
    if (hotel.state) city += ` - ${hotel.state}`;
    if (hotel.zip_code) city += ` - CEP: ${hotel.zip_code}`;
    parts.push(city);
  }
  return parts.join(", ");
}

function policiesLink(hotel: JsonRecord, reservation: JsonRecord, baseUrl: string): string {
  const category = asRecord(reservation.room_categories);
  const buildingId = category?.building_id ? String(category.building_id) : "";
  const establishmentId = reservation.establishment_id ? String(reservation.establishment_id) : String(hotel.establishment_id ?? "");
  const id = buildingId || establishmentId;
  if (!id) return "";
  const token = Buffer.from(`${buildingId ? "building" : "establishment"}:${id}`).toString("base64");
  const slug = String(hotel.name || "hotel").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${baseUrl}/policies/${slug}/${token}`;
}

function publicLogoUrls(hotelLogo: string, systemLogo: string): { logoUrl: string; hotelLogo: string } {
  const base =
    (process.env.SUPABASE_URL ?? "").replace(/\/$/, "") ||
    (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    (process.env.PMS_PUBLIC_URL ?? "").replace(/\/$/, "");
  const resolve = (raw: string): string => {
    const value = String(raw || "").trim();
    if (!value || /^(null|undefined|none|#)$/i.test(value)) return "";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    if (!base) return "";
    for (const bucket of ["hotel-assets", "uploads", "hotel-logos"]) {
      let path = value;
      if (bucket === "hotel-assets" && !path.startsWith("hotel/") && !path.includes("/")) path = `hotel/${path}`;
      const embedded = path.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (embedded?.[1]) path = embedded[1];
      return `${base}/storage/v1/object/public/${bucket}/${path}`;
    }
    return "";
  };
  const hotel = resolve(hotelLogo);
  const system = resolve(systemLogo);
  // logoUrl = preferência final (hotel → sistema); hotelLogo legado vazio
  return { logoUrl: hotel || system, hotelLogo: "" };
}

function detectBaseUrl(headers?: Record<string, string | undefined>): string {
  if (process.env.SITE_URL?.trim()) return process.env.SITE_URL.trim();
  if (process.env.VERCEL_URL?.trim()) return `https://${process.env.VERCEL_URL.trim()}`;
  if (process.env.RENDER_EXTERNAL_URL?.trim()) return process.env.RENDER_EXTERNAL_URL.trim();
  if (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`;
  const origin = headers ? header(headers, "origin") || header(headers, "referer") : undefined;
  if (origin) {
    try {
      const url = new URL(origin);
      if (!url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) return url.origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:8080";
}

function getNestedValue(variables: TemplateVariables, path: string): unknown {
  let value: unknown = variables;
  for (const part of path.split(".")) {
    if (value == null) return null;
    if (Array.isArray(value) && /^\d+$/.test(part)) value = value[Number(part)];
    else if (typeof value === "object" && part in (value as JsonRecord)) value = (value as JsonRecord)[part];
    else return null;
  }
  return value;
}

function isTemplateFalsy(value: unknown): boolean {
  return value == null || value === "" || value === 0 || value === false;
}

function processTemplate(template: string, variables: TemplateVariables): string {
  let processed = String(template || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ");
  processed = processEach(processed, variables);
  for (let pass = 0; pass < 50; pass += 1) {
    const next = processIf(processed, variables);
    if (next === processed) break;
    processed = next;
  }
  processed = processed.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_match, path: string) => {
    const value = getNestedValue(variables, path);
    return value == null ? "" : String(value);
  });
  processed = processed.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = getNestedValue(variables, path);
    return value == null ? "" : String(value);
  });
  // Segurança: tags Handlebars órfãs (legado / aninhamento)
  processed = processed
    .replace(/\{\{\/if\}\}/g, "")
    .replace(/\{\{else\}\}/g, "")
    .replace(/\{\{#if\s+[\w.]+\}\}/g, "");
  processed = processed.replace(/(?<=>)\s*\n+\s*(?=<)/g, "");
  return dedupeAdjacentSameSrcImages(processed);
}

function processEach(template: string, variables: TemplateVariables): string {
  const match = template.match(/\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/);
  if (!match) return template;
  const items = getNestedValue(variables, match[1]);
  const rendered = Array.isArray(items)
    ? items.map((item) => processTemplate(match[2], { ...variables, ...(asRecord(item) ?? {}), this: item })).join("")
    : "";
  return processEach(template.replace(match[0], rendered), variables);
}

function processIf(template: string, variables: TemplateVariables): string {
  const start = template.search(/\{\{#if\s+[\w.]+\}\}/);
  if (start < 0) return template;
  const tag = template.slice(start).match(/^\{\{#if\s+([\w.]+)\}\}/);
  if (!tag) return template;
  let depth = 1;
  let cursor = start + tag[0].length;
  let elseAt = -1;
  while (depth > 0 && cursor < template.length) {
    const nextIf = template.indexOf("{{#if", cursor);
    const nextElse = template.indexOf("{{else}}", cursor);
    const nextEnd = template.indexOf("{{/if}}", cursor);
    if (nextEnd < 0) return template;
    if (nextIf >= 0 && nextIf < nextEnd && (nextElse < 0 || nextIf < nextElse)) {
      depth += 1;
      cursor = nextIf + 5;
      continue;
    }
    if (depth === 1 && nextElse >= 0 && nextElse < nextEnd && elseAt < 0) elseAt = nextElse;
    depth -= 1;
    if (depth === 0) {
      const end = nextEnd + "{{/if}}".length;
      const raw = elseAt > start ? template.slice(start + tag[0].length, elseAt) : template.slice(start + tag[0].length, nextEnd);
      const alternate = elseAt > start ? template.slice(elseAt + "{{else}}".length, nextEnd) : "";
      const replacement = isTemplateFalsy(getNestedValue(variables, tag[1])) ? alternate : raw;
      return template.slice(0, start) + replacement + template.slice(end);
    }
    cursor = nextEnd + 7;
  }
  return template;
}

function formatDatePt(value: string): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function joinBaseUrlAndPath(base: string, path: string): string {
  const root = (base || "").trim().replace(/\/$/, "");
  let suffix = (path ?? "").trim();
  if (!suffix.startsWith("/")) suffix = `/${suffix}`;
  try {
    if (/^\/api\/v2\/cm\//i.test(suffix)) return `${new URL(root).origin}${suffix}`;
  } catch {
    /* invalid base */
  }
  if (/\/cm$/i.test(root) && /^\/cm(\/|$)/i.test(suffix)) suffix = suffix.replace(/^\/cm/i, "");
  if (!suffix.startsWith("/")) suffix = `/${suffix}`;
  return `${root}${suffix}`.replace(/(\/cm)\/cm(\/)/gi, "$1$2");
}

function extractBookingsArray(json: unknown): JsonRecord[] {
  if (Array.isArray(json)) return json.filter((item): item is JsonRecord => !!asRecord(item));
  const record = asRecord(json);
  if (!record) return [];
  for (const key of ["bookings", "reservations", "data", "items", "results", "records"]) {
    if (Array.isArray(record[key])) return record[key].filter((item): item is JsonRecord => !!asRecord(item));
  }
  return [];
}

function mappingComplete(row: PricingRow | null): boolean {
  if (!row) return false;
  return !!sanitizeAiosellCode(normalizeChannelCodeInput(row.channel_room_code)) && splitAiosellRatePlanCodes(row.channel_rate_plan_code).some((code) => sanitizeAiosellCode(code));
}

function findPricing(rows: PricingRow[], categoryId: string, planId: string | null): PricingRow | null {
  const exact = rows.find((row) => row.category_id === categoryId && (row.pricing_plan_id ?? null) === (planId ?? null));
  const fallback = rows.find((row) => row.category_id === categoryId && row.pricing_plan_id == null);
  if (exact && mappingComplete(exact)) return exact;
  if (fallback && mappingComplete(fallback)) return fallback;
  return exact ?? fallback ?? null;
}

function calendarRecord(row: {
  base_price: Prisma.Decimal;
  adult_price: Prisma.Decimal | null;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean | null;
  closed_to_departure: boolean | null;
  stop_sell_ota: boolean | null;
  sales_status: string | null;
  min_advance_days: number | null;
  max_advance_days: number | null;
  occupancy_1_fluctuation_type: string | null;
  occupancy_1_fluctuation_value: Prisma.Decimal | null;
  occupancy_3_fluctuation_type: string | null;
  occupancy_3_fluctuation_value: Prisma.Decimal | null;
  occupancy_4_fluctuation_type: string | null;
  occupancy_4_fluctuation_value: Prisma.Decimal | null;
}): JsonRecord {
  return {
    base_price: Number(row.base_price),
    adult_price: row.adult_price == null ? null : Number(row.adult_price),
    min_stay: row.min_stay,
    max_stay: row.max_stay,
    closed_to_arrival: row.closed_to_arrival,
    closed_to_departure: row.closed_to_departure,
    stop_sell_ota: row.stop_sell_ota,
    sales_status: row.sales_status,
    min_advance_days: row.min_advance_days,
    max_advance_days: row.max_advance_days,
    occupancy_1_fluctuation_type: row.occupancy_1_fluctuation_type,
    occupancy_1_fluctuation_value: row.occupancy_1_fluctuation_value == null ? null : Number(row.occupancy_1_fluctuation_value),
    occupancy_3_fluctuation_type: row.occupancy_3_fluctuation_type,
    occupancy_3_fluctuation_value: row.occupancy_3_fluctuation_value == null ? null : Number(row.occupancy_3_fluctuation_value),
    occupancy_4_fluctuation_type: row.occupancy_4_fluctuation_type,
    occupancy_4_fluctuation_value: row.occupancy_4_fluctuation_value == null ? null : Number(row.occupancy_4_fluctuation_value),
  };
}

function clampOccupancy(raw: unknown): 1 | 2 | 3 | 4 {
  const value = Math.floor(Number(raw));
  return value >= 1 && value <= 4 ? (value as 1 | 2 | 3 | 4) : 2;
}

function inferOccupancy(rateplanCode: string): 1 | 2 | 3 | 4 | null {
  const match = sanitizeAiosellCode(rateplanCode).toLowerCase().match(/-([sdqt])-(?:ep|cp|ro|bb|rb)/);
  if (!match) return null;
  if (match[1] === "s") return 1;
  if (match[1] === "d") return 2;
  if (match[1] === "t") return 3;
  return 4;
}

function listPriceForOccupancy(rate: JsonRecord, occupancy: 1 | 2 | 3 | 4): number {
  const base = Number(rate.base_price);
  const adult = Number(rate.adult_price);
  const bar = Number.isFinite(base) ? base : 0;
  const extra = Number.isFinite(adult) ? adult : 0;
  let price = occupancy === 1 ? Math.max(0, bar - extra) : occupancy === 3 ? bar + extra : occupancy === 4 ? bar + extra * 2 : bar;
  const typeKey = occupancy === 1 ? "occupancy_1_fluctuation_type" : occupancy === 3 ? "occupancy_3_fluctuation_type" : occupancy === 4 ? "occupancy_4_fluctuation_type" : "";
  const valueKey = occupancy === 1 ? "occupancy_1_fluctuation_value" : occupancy === 3 ? "occupancy_3_fluctuation_value" : occupancy === 4 ? "occupancy_4_fluctuation_value" : "";
  if (typeKey && (rate[typeKey] === "fixed" || rate[typeKey] === "percentage") && rate[valueKey] != null && !Number.isNaN(Number(rate[valueKey]))) {
    const fluctuation = Number(rate[valueKey]);
    price = rate[typeKey] === "percentage" ? price * (1 + fluctuation / 100) : price + fluctuation;
  }
  return Math.max(0, Math.round(price * 100) / 100);
}

function applyChannelPrice(base: number, cfg: PricingRow): number {
  if (cfg.fixed_price != null && cfg.fixed_price !== "") return roundMoney(Number(cfg.fixed_price));
  if (cfg.price_multiplier != null && cfg.price_multiplier !== "") {
    const multiplier = Number(cfg.price_multiplier);
    if (Number.isFinite(multiplier) && multiplier > 0 && Math.abs(multiplier - 1) >= 1e-6) return roundMoney(base * multiplier);
  }
  return roundMoney(base);
}

function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function restrictionShape(minStay: number | null, maxStay: number | null, closeOnArrival: boolean, closeOnDeparture: boolean, stopSell: boolean, minAdvance: number | null, maxAdvance: number | null): JsonRecord {
  return {
    stopSell,
    exactStayArrival: null,
    maximumStayArrival: null,
    minimumAdvanceReservation: minAdvance != null && minAdvance > 0 ? Math.floor(minAdvance) : null,
    minimumStay: minStay != null && minStay >= 1 ? Math.floor(minStay) : null,
    closeOnArrival,
    minimumStayArrival: null,
    maximumStay: maxStay,
    maximumAdvanceReservation: maxAdvance != null && maxAdvance > 0 ? Math.floor(maxAdvance) : null,
    closeOnDeparture,
  };
}

function rateRestrictions(row: JsonRecord): JsonRecord {
  const minStay = row.min_stay != null && Number(row.min_stay) >= 1 ? Math.floor(Number(row.min_stay)) : null;
  const maxStay = row.max_stay != null ? Number(row.max_stay) : null;
  const closed = String(row.sales_status ?? "").toLowerCase() === "closed" || String(row.sales_status ?? "").toLowerCase() === "no_price";
  return restrictionShape(minStay, maxStay, !!row.closed_to_arrival, !!row.closed_to_departure, !!row.stop_sell_ota || closed, row.min_advance_days != null ? Number(row.min_advance_days) : null, row.max_advance_days != null ? Number(row.max_advance_days) : null);
}

function isCategoryClosed(status: string | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "closed" || value === "restricted_ota" || value === "restricted_all";
}

function mergeDayPayloads(byDate: Map<string, JsonRecord[]>, key: "rates" | "rooms"): JsonRecord[] {
  const dates = [...byDate.keys()].sort();
  const out: JsonRecord[] = [];
  for (const date of dates) {
    const items = byDate.get(date) ?? [];
    const signature = JSON.stringify(items);
    const last = out[out.length - 1];
    if (last && last.endDate === addDaysIso(utcDate(String(last.endDate)), 0) && JSON.stringify(last[key]) === signature && addDaysIso(utcDate(String(last.endDate)), 1) === date) {
      last.endDate = date;
    } else if (last && addDaysIso(utcDate(String(last.endDate)), 1) === date && JSON.stringify(last[key]) === signature) {
      last.endDate = date;
    } else {
      out.push({ startDate: date, endDate: date, [key]: items });
    }
  }
  return out;
}

function chunkSize(name: string, fallback: number, max: number): number {
  const parsed = Number.parseInt((process.env[name] ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, parsed) : fallback;
}
