import { timingSafeEqual } from "crypto";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { email_event_type, payment_status, Prisma, reservation_status } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { CheckinChargeService } from "./checkin-charge.service";
import { ChannexOtaService } from "./channex-ota.service";
import { PrismaService } from "../prisma/prisma.service";
import { computeWebCheckinExpiresAt } from "../lib/web-checkin-expiry";
import { renderEmailTemplate } from "./email-template.util";

type AnyObj = Record<string, unknown>;
type Result = { status: number; body: unknown };
type RevisionKind = "new" | "modified" | "cancelled";
type OtaRow = { id: string; reservation_id: string | null };

const OPEN_STAY: reservation_status[] = [
  reservation_status.pending,
  reservation_status.confirmed,
  reservation_status.checkedin,
  reservation_status.blocked,
  reservation_status.preregistration,
];

@Injectable()
export class ChannexReservationsService {
  private readonly logger = new Logger(ChannexReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
    private readonly checkinCharge: CheckinChargeService,
    private readonly channexOta: ChannexOtaService,
  ) {}

  async webhook(rawBody: string, headers: Record<string, string | undefined>): Promise<Result> {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const rawPayload = parseIfJsonString(parsed);
      const payload =
        asObject(rawPayload) ??
        firstObjectFromArray(rawPayload) ??
        ({ raw_payload: rawPayload } as AnyObj);
      const dataParsed = parseIfJsonString(payload.data);
      const payloadData =
        asObject(dataParsed) ??
        asObject(payload.data) ??
        asObject(payload.payload) ??
        asObject(payload.object) ??
        firstObjectFromArray(payload.data) ??
        null;
      const attrsNested = payloadData && typeof payloadData.attributes === "object" ? (payloadData.attributes as AnyObj) : null;
      const eventName =
        normalizeEvent(payload.event ?? payload.event_name ?? payload.type ?? payloadData?.event ?? payloadData?.event_name ?? payloadData?.type) ||
        normalizeEvent(deepFindStringByKeys(payload, ["event", "event_name", "type"]));
      const revisionId =
        pickString(
          payload.revision_id,
          payload.booking_revision_id,
          payload.revisionId,
          payload.bookingRevisionId,
          payloadData?.revision_id,
          payloadData?.booking_revision_id,
          payloadData?.revisionId,
          payloadData?.bookingRevisionId,
          (payloadData?.revision as AnyObj | undefined)?.id,
          (() => {
            const pdt = String(payloadData?.type ?? "").toLowerCase();
            return typeof payloadData?.id === "string" && pdt.includes("revision") ? String(payloadData.id).trim() : null;
          })(),
          attrsNested?.revision_id,
        ) ?? deepFindStringByKeys(payload, ["revision_id", "booking_revision_id", "revisionId", "bookingRevisionId", "revision.id"]);
      const bookingId =
        pickString(
          payload.booking_id,
          payload.bookingId,
          payloadData?.booking_id,
          payloadData?.bookingId,
          (payloadData?.booking as AnyObj | undefined)?.id,
          attrsNested?.booking_id,
          attrsNested?.bookingId,
        ) ?? deepFindStringByKeys(payload, ["booking_id", "bookingId", "booking.id"]);
      const bookingUniqueId =
        pickString(
          payload.booking_unique_id,
          payload.unique_id,
          payload.bookingUniqueId,
          payloadData?.booking_unique_id,
          payloadData?.unique_id,
          payloadData?.bookingUniqueId,
          attrsNested?.unique_id,
          attrsNested?.ota_reservation_code,
          attrsNested?.booking_unique_id,
        ) ?? deepFindStringByKeys(payload, ["booking_unique_id", "bookingUniqueId", "unique_id", "uniqueId"]);
      const customerNameWs = pickString(payload.customer_name, payloadData?.customer_name) ?? deepFindStringByKeys(payload, ["customer_name", "customerName"]);
      const arrivalDateWs = pickString(payload.arrival_date, payloadData?.arrival_date) ?? deepFindStringByKeys(payload, ["arrival_date", "arrivalDate"]);
      const webhookSummary: AnyObj = {};
      if (customerNameWs) webhookSummary.customer_name = customerNameWs;
      if (arrivalDateWs) webhookSummary.arrival_date = arrivalDateWs;
      const amountRaw = payload.amount ?? payloadData?.amount;
      if (amountRaw != null && String(amountRaw).trim() !== "") webhookSummary.amount = amountRaw;
      const curWs = pickString(payload.currency, payloadData?.currency);
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
          nestedPickString(payload, "relationships.property.data.id"),
          nestedPickString(payloadData, "relationships.property.data.id"),
          nestedPickString(payloadData, "property.data.id"),
          (payloadData?.property as AnyObj | undefined)?.id,
        ) ??
        deepFindStringByKeys(payload, ["property_id", "propertyId"]) ??
        "";

      if (eventName === "ari") {
        if (!propertyId) return ok({ success: true, ignored: true, reason: "ari_sem_property_id" });
        const { row: ariChannel } = await this.findChannexChannelByPropertyId(propertyId);
        if (ariChannel?.id) {
          await this.insertLog({
            otaChannelId: String(ariChannel.id),
            establishmentId: String(ariChannel.establishment_id ?? ""),
            direction: "webhook",
            status: "info",
            endpoint: "channex-reservation-webhook",
            request: { event: eventName, property_id: propertyId, note: "Somente auditoria; re-sincronize ARI manualmente no PMS se necessário." },
            message: `Webhook ARI recebido (${eventName})`,
          });
        }
        return ok({ success: true, logged: "ari", property_id: propertyId });
      }

      const isBookingTrigger = [
        "booking",
        "booking_new",
        "booking_modification",
        "booking_cancellation",
        "non_acked_booking",
        "booking_unmapped_room",
        "booking_unmapped_rate",
      ].includes(eventName);
      if (!isBookingTrigger) return ok({ success: true, ignored: true, reason: "Evento sem ação de reserva" });

      const { row: channel, matchValues } = await this.findChannexChannelByPropertyId(propertyId);
      if (!channel?.id) {
        return ok({
          success: true,
          ignored: true,
          reason: "Canal Channex não mapeado para property_id",
          hint: "Confirme no PMS (Canal Channex) que Property ID é o UUID da propriedade no Channex, igual ao property_id deste webhook.",
          debug: {
            property_id_raw: propertyId,
            property_id_canonical: toCanonicalUuidLoose(propertyId),
            query_values_tried: matchValues,
          },
        });
      }

      if (channel.channex_webhook_verify_user_api_key === true) {
        const expected = ensureString(channel.channex_api_key);
        const got = incomingUserApiKey(headers);
        if (!expected || !timingSafeEqualString(expected, got)) {
          return { status: 401, body: { success: false, error: "Webhook não autorizado (user-api-key)" } };
        }
      }

      const establishmentId = ensureString(channel.establishment_id);
      await this.insertLog({
        otaChannelId: channel.id,
        establishmentId,
        direction: "webhook",
        status: "info",
        endpoint: "channex-reservation-webhook",
        request: payload,
        message: `Webhook recebido (${eventName})`,
      });

      if (channel.channex_use_webhook === false) {
        return ok({ success: true, ignored: true, reason: "Webhook trigger desativado no canal" });
      }

      let revisionIdEffective = revisionId;
      let bookingIdEffective = bookingId;
      let bookingUniqueIdEffective = bookingUniqueId;
      let cancellationRevisionResolvedViaApi = false;
      if (eventName === "booking_cancellation" && !revisionIdEffective && !bookingIdEffective && !bookingUniqueIdEffective) {
        const resolved = await this.resolveCancelledRevision(channel, propertyId, parseIsoMs(payload.timestamp));
        if (resolved) {
          revisionIdEffective = resolved.revisionId;
          if (resolved.bookingId) bookingIdEffective = resolved.bookingId;
          if (resolved.uniqueId) bookingUniqueIdEffective = resolved.uniqueId;
          cancellationRevisionResolvedViaApi = true;
        }
      }

      const initialWindowSeconds =
        eventName === "non_acked_booking" ? 0 : !revisionIdEffective && !bookingIdEffective && !bookingUniqueIdEffective ? 180 : 0;
      const auth = this.serviceAuthorization();
      const first = await this.sync(auth, {
        channel_id: channel.id,
        establishment_id: establishmentId,
        revision_id: revisionIdEffective,
        booking_id: bookingIdEffective,
        booking_unique_id: bookingUniqueIdEffective,
        source_event: eventName,
        recent_window_seconds: initialWindowSeconds,
        ...webhookSummaryPayload,
      });
      let invokePayload = first.body;
      const firstOk = first.status >= 200 && first.status < 300;
      let fallbackWindowSeconds = 0;
      const shouldRetryWithLargerWindow =
        !revisionIdEffective && !bookingIdEffective && !bookingUniqueIdEffective && firstOk && processedCount(invokePayload) === 0;
      if (shouldRetryWithLargerWindow) {
        fallbackWindowSeconds = 7200;
        const retry = await this.sync(auth, {
          channel_id: channel.id,
          establishment_id: establishmentId,
          source_event: eventName,
          recent_window_seconds: fallbackWindowSeconds,
          ...webhookSummaryPayload,
        });
        if (retry.status >= 200 && retry.status < 300) invokePayload = retry.body;
      }

      if (eventName === "booking_cancellation" && firstOk && processedCount(invokePayload) === 0) {
        await delay(2500);
        const resolved = await this.resolveCancelledRevision(channel, propertyId, parseIsoMs(payload.timestamp));
        if (resolved) {
          revisionIdEffective = resolved.revisionId;
          if (resolved.bookingId) bookingIdEffective = resolved.bookingId;
          if (resolved.uniqueId) bookingUniqueIdEffective = resolved.uniqueId;
          cancellationRevisionResolvedViaApi = true;
          const late = await this.sync(auth, {
            channel_id: channel.id,
            establishment_id: establishmentId,
            revision_id: revisionIdEffective,
            booking_id: bookingIdEffective,
            booking_unique_id: bookingUniqueIdEffective,
            source_event: eventName,
            recent_window_seconds: 0,
            ...webhookSummaryPayload,
          });
          if (late.status >= 200 && late.status < 300) invokePayload = late.body;
        }
      }

      await this.insertLog({
        otaChannelId: channel.id,
        establishmentId,
        direction: "webhook",
        status: firstOk ? "success" : "warning",
        endpoint: "channex-reservation-webhook -> channex-reservations-sync",
        request: {
          extracted: {
            event: eventName,
            revision_id: revisionIdEffective,
            booking_id: bookingIdEffective,
            booking_unique_id: bookingUniqueIdEffective,
            property_id: propertyId,
            cancellation_revision_resolved_via_api: cancellationRevisionResolvedViaApi,
          },
          windows: { initial_window_seconds: initialWindowSeconds, fallback_window_seconds: fallbackWindowSeconds },
          debug: payloadDebug(rawPayload, payload, payloadData),
        },
        response: invokePayload,
        message: `Webhook processado (${eventName})`,
      });

      return ok({
        success: firstOk,
        event: eventName,
        revision_id: revisionIdEffective,
        booking_id: bookingIdEffective,
        booking_unique_id: bookingUniqueIdEffective,
        hint: !revisionId && !bookingId && !bookingUniqueId
          ? cancellationRevisionResolvedViaApi
            ? "Webhook sem IDs no corpo (send_data=false). booking_revision_id obtido via API Channex antes do sync."
            : "Webhook resumido detectado (provavelmente send_data=false). PMS usou pull do feed com retry/fallback; se processed=0, ative send_data=true no webhook Channex."
          : null,
        debug: {
          ...payloadDebug(rawPayload, payload, payloadData),
          initial_window_seconds: initialWindowSeconds,
          fallback_window_seconds: fallbackWindowSeconds,
        },
        sync: invokePayload,
      });
    } catch (error) {
      this.logger.error(`channex-reservation-webhook error: ${error instanceof Error ? error.message : "Erro interno"}`);
      return { status: 500, body: { success: false, error: error instanceof Error ? error.message : "Erro interno" } };
    }
  }

  async sync(authorization: string | undefined, body: unknown): Promise<Result> {
    try {
      if (!authorization?.trim()) return fail(401, "Não autorizado");
      const internal = this.internal(authorization);
      let userId: string | null = null;
      if (!internal) {
        userId = await this.identity.resolve(authorization);
        if (!userId) return fail(401, "Sessão inválida ou expirada");
      }

      const payload = asObject(typeof body === "string" ? parseIfJsonString(body) : body);
      if (!payload) return fail(400, "JSON inválido");
      const channelId = ensureString(payload.channel_id);
      const establishmentId = ensureString(payload.establishment_id);
      const revisionFilter = ensureString(payload.revision_id);
      const bookingIdFilter = ensureString(payload.booking_id);
      const bookingUniqueIdFilter = ensureString(payload.booking_unique_id);
      const forceReprocess = payload.force_reprocess === true;
      const autoApplyLifecycle = payload.auto_apply_lifecycle === true;
      const sourceEvent = ensureString(payload.source_event).toLowerCase();
      const recentWindowSeconds =
        typeof payload.recent_window_seconds === "number" && Number.isFinite(payload.recent_window_seconds)
          ? Math.max(0, Math.floor(payload.recent_window_seconds))
          : 0;
      const webhookSummary = payload.webhook_summary && typeof payload.webhook_summary === "object" ? (payload.webhook_summary as AnyObj) : null;
      if (!channelId || !establishmentId) return fail(400, "channel_id e establishment_id são obrigatórios");

      const channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
      if (!channel) return fail(404, "Canal não encontrado");
      if (ensureString(channel.establishment_id) !== establishmentId) {
        return fail(403, "Canal não pertence ao estabelecimento informado");
      }
      if (!internal && userId) {
        try {
          await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
        } catch (error) {
          if (error instanceof ForbiddenException) return fail(403, "Sem permissão para este estabelecimento");
          return fail(500, `Não foi possível validar permissão: ${error instanceof Error ? error.message : "erro"}`);
        }
      }
      if (ensureString(channel.channel_manager_type) !== "channex") return fail(400, "Canal informado não é do tipo Channex");

      if (payload.finalize_channex_cancellation_revision === true) {
        return this.finalizeCancellation(channelId, establishmentId, ensureString(payload.revision_id));
      }

      const apiKey = ensureString(channel.channex_api_key);
      const propertyId = ensureString(channel.channex_property_id);
      const baseUrl = ensureString(channel.channex_base_url || "https://staging.channex.io");
      if (!apiKey || !propertyId) return fail(400, "Canal sem channex_api_key/channex_property_id configurados");

      const loaded = await this.loadRevisionList({
        channelId,
        establishmentId,
        apiKey,
        propertyId,
        baseUrl,
        revisionFilter,
        bookingIdFilter,
        bookingUniqueIdFilter,
        recentWindowSeconds,
        sourceEvent,
      });
      if (!loaded.ok) return { status: loaded.status, body: loaded.body };

      await this.clearStaleModifications(channelId, establishmentId);
      const counters = emptyCounters();
      for (const item of loaded.list) {
        await this.processRevision({
          item,
          listLength: loaded.list.length,
          channelId,
          establishmentId,
          revisionFilter,
          bookingIdFilter,
          bookingUniqueIdFilter,
          forceReprocess,
          autoApplyLifecycle,
          sourceEvent,
          webhookSummary,
          counters,
        });
      }

      await this.runAck(channelId, establishmentId);
      await this.insertLog({
        otaChannelId: channelId,
        establishmentId,
        direction: "pull_booking",
        status: counters.failed > 0 ? "warning" : "success",
        endpoint: loaded.feedPath,
        message: `Processadas ${counters.processed} revisão(ões)`,
        request: {
          revisionFilter: revisionFilter || null,
          bookingIdFilter: bookingIdFilter || null,
          bookingUniqueIdFilter: bookingUniqueIdFilter || null,
          recentWindowSeconds,
        },
        response: {
          processed: counters.processed,
          created: counters.created,
          modified: counters.modified,
          cancelled: counters.cancelled,
          failed: counters.failed,
          fetched_items: loaded.list.length,
          skipped_missing_ids: counters.skippedMissingIds,
          skipped_by_source_event: counters.skippedBySourceEvent,
          skipped_already_processed: counters.skippedAlreadyProcessed,
        },
      });
      return ok({
        success: true,
        processed: counters.processed,
        created: counters.created,
        modified: counters.modified,
        cancelled: counters.cancelled,
        failed: counters.failed,
        fetched_items: loaded.list.length,
        skipped_missing_ids: counters.skippedMissingIds,
        skipped_by_source_event: counters.skippedBySourceEvent,
        skipped_already_processed: counters.skippedAlreadyProcessed,
      });
    } catch (error) {
      this.logger.error(`channex-reservations-sync error: ${error instanceof Error ? error.message : "Erro interno"}`);
      return fail(500, error instanceof Error ? error.message : "Erro interno");
    }
  }

  private async finalizeCancellation(channelId: string, establishmentId: string, finalizeRevisionId: string): Promise<Result> {
    if (!finalizeRevisionId) return fail(400, "revision_id é obrigatório para finalizar a revisão");
    let rev: {
      id: string;
      status: string;
      reservation_id: string | null;
      booking_id: string | null;
      unique_id: string | null;
      process_status: string;
    } | null = null;
    try {
      rev = await this.prisma.channex_booking_revisions.findFirst({
        where: { ota_channel_id: channelId, revision_id: finalizeRevisionId },
        select: { id: true, status: true, reservation_id: true, booking_id: true, unique_id: true, process_status: true },
      });
    } catch (error) {
      return fail(500, `Erro ao ler revisão: ${error instanceof Error ? error.message : "erro"}`);
    }
    if (!rev?.id) return fail(404, "Revisão Channex não encontrada");
    const proc = ensureString(rev.process_status).toLowerCase();
    if (proc === "processed" || proc === "acked") return ok({ success: true, finalized: true, already_processed: true });
    if (normalizeRevisionStatus(rev.status) !== "cancelled") return fail(400, "Esta pendência não é de cancelamento");

    const bookingIdF = ensureString(rev.booking_id);
    const uniqueIdF = ensureString(rev.unique_id);
    let resId = ensureString(rev.reservation_id);
    if (!resId && (bookingIdF || uniqueIdF)) {
      const latestRid = await this.latestLinkedReservationId(channelId, bookingIdF, uniqueIdF);
      if (latestRid) {
        resId = latestRid;
        await this.prisma.channex_booking_revisions.update({
          where: { id: rev.id },
          data: { reservation_id: latestRid, updated_at: new Date() },
        });
      }
    }
    if (!resId) {
      const cancelledLink = await this.findLocalCancelledReservation(establishmentId, channelId, uniqueIdF, bookingIdF);
      if (cancelledLink) {
        resId = cancelledLink;
        await this.prisma.channex_booking_revisions.update({
          where: { id: rev.id },
          data: { reservation_id: cancelledLink, updated_at: new Date() },
        });
      }
    }
    if (!resId) {
      return ok({
        success: true,
        finalized: false,
        skipped: true,
        reason: "no_reservation_link",
        error: "Revisão sem reserva vinculada. Sincronize as reservas Channex antes de finalizar.",
      });
    }
    const resCheck = await this.prisma.reservations.findUnique({ where: { id: resId }, select: { id: true, status: true } });
    if (ensureString(resCheck?.status).toLowerCase() !== "cancelled") {
      return ok({
        success: true,
        finalized: false,
        retry: true,
        hint: "pending_reservation_not_cancelled",
        error: "A reserva ainda não está cancelada no PMS. Use o cancelamento com política e estorno (como no mapa de reservas) antes de finalizar.",
      });
    }
    const existingOta = await this.findOtaReservation(channelId, uniqueIdF, bookingIdF);
    await this.updateOtaRow(channelId, uniqueIdF, bookingIdF, existingOta, { sync_status: "cancelled", synced_at: new Date() });
    await this.prisma.channex_booking_revisions.update({
      where: { id: rev.id },
      data: { process_status: "processed", processed_at: new Date(), error_message: null, updated_at: new Date() },
    });
    await this.supersede(channelId, finalizeRevisionId, bookingIdF, uniqueIdF, `Superseded by cancellation revision ${finalizeRevisionId}`, true);
    await this.enqueueAck(channelId, establishmentId, finalizeRevisionId);
    await this.runAck(channelId, establishmentId);
    await this.insertLog({
      otaChannelId: channelId,
      establishmentId,
      direction: "pull_booking",
      status: "success",
      endpoint: "finalize_channex_cancellation_revision",
      message: `Revisão ${finalizeRevisionId} finalizada após cancelamento no PMS`,
      request: { revision_id: finalizeRevisionId },
    });
    return ok({ success: true, finalized: true });
  }

  private async loadRevisionList(args: {
    channelId: string;
    establishmentId: string;
    apiKey: string;
    propertyId: string;
    baseUrl: string;
    revisionFilter: string;
    bookingIdFilter: string;
    bookingUniqueIdFilter: string;
    recentWindowSeconds: number;
    sourceEvent: string;
  }): Promise<{ ok: true; list: AnyObj[]; feedPath: string } | { ok: false; status: number; body: unknown }> {
    const webhookRecentPull = !args.revisionFilter && !args.bookingIdFilter && !args.bookingUniqueIdFilter && args.recentWindowSeconds > 0;
    const feedOrder = webhookRecentPull ? "desc" : "asc";
    const feedPath = args.revisionFilter
      ? `/api/v1/booking_revisions/${encodeURIComponent(args.revisionFilter)}?include=booking`
      : `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(args.propertyId)}&order[inserted_at]=${feedOrder}`;
    let feedStatus: number | null = null;
    let feedOk = false;
    let feedData: unknown = {};
    let list: AnyObj[] = [];
    const delays = [800, 1600, 3200];
    for (let attemptIdx = 0; attemptIdx < 4; attemptIdx++) {
      if (attemptIdx > 0) await delay(delays[attemptIdx - 1] ?? 0);
      let attempt: { ok: boolean; status: number; data: unknown };
      try {
        attempt = await fetchChannex(args.baseUrl, args.apiKey, feedPath);
      } catch (error) {
        feedStatus = null;
        feedOk = false;
        feedData = { network_error: error instanceof Error ? error.message : String(error) };
        if (attemptIdx === 3) break;
        continue;
      }
      feedStatus = attempt.status;
      feedOk = attempt.ok;
      feedData = attempt.data;
      if (attempt.ok) {
        list = parseFeedList(attempt.data);
        if (list.length > 0) break;
        if (!webhookRecentPull || attemptIdx === 3) break;
        continue;
      }
      if (!isTransientChannexHttpStatus(attempt.status)) break;
      if (attemptIdx === 3) break;
    }
    if (!feedOk) {
      await this.insertLog({
        otaChannelId: args.channelId,
        establishmentId: args.establishmentId,
        direction: "pull_booking",
        status: "error",
        endpoint: feedPath,
        httpStatus: feedStatus,
        response: feedData,
        message: "Erro ao buscar booking revisions",
      });
      return { ok: false, status: 502, body: { success: false, error: "Falha ao buscar revisões no Channex", hint: String(feedStatus ?? 0) } };
    }

    if (list.length === 0 && !args.revisionFilter && !args.bookingIdFilter && !args.bookingUniqueIdFilter && args.recentWindowSeconds > 0) {
      const alt = await fetchChannex(
        args.baseUrl,
        args.apiKey,
        `/api/v1/booking_revisions?filter[property_id]=${encodeURIComponent(args.propertyId)}&order[inserted_at]=desc`,
      );
      if (alt.ok) list = parseFeedList(alt.data);
    }
    if (list.length === 0 && (args.revisionFilter || args.bookingIdFilter || args.bookingUniqueIdFilter)) {
      const fallback = await fetchChannex(
        args.baseUrl,
        args.apiKey,
        `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(args.propertyId)}&order[inserted_at]=desc`,
      );
      if (fallback.ok) {
        const root = asObject(fallback.data);
        const fallbackList = Array.isArray(root?.data) ? (root.data as AnyObj[]) : [];
        list = fallbackList.filter((entry) => {
          const attrs = (asObject(entry.attributes) ?? {}) as AnyObj;
          const rid = ensureString(attrs.id || entry.id);
          const bid = ensureString(attrs.booking_id);
          const uid = ensureString(attrs.unique_id || attrs.ota_reservation_code);
          if (args.revisionFilter && rid === args.revisionFilter) return true;
          if (args.bookingIdFilter && bid === args.bookingIdFilter) return true;
          if (args.bookingUniqueIdFilter && uid === args.bookingUniqueIdFilter) return true;
          return false;
        });
      }
    }
    if (list.length === 0 && args.revisionFilter) {
      const byId = await fetchChannex(
        args.baseUrl,
        args.apiKey,
        `/api/v1/booking_revisions?filter[id]=${encodeURIComponent(args.revisionFilter)}&pagination[limit]=5&include=booking`,
      );
      if (byId.ok) list = parseFeedList(byId.data);
    }
    if (list.length === 0 && args.revisionFilter && isUuid(args.revisionFilter)) {
      const localRevision = await this.prisma.channex_booking_revisions.findFirst({
        where: { ota_channel_id: args.channelId, revision_id: args.revisionFilter },
        select: { revision_id: true, booking_id: true, unique_id: true, payload: true, status: true, reservation_id: true },
      });
      if (localRevision?.revision_id) {
        const stored = asObject(localRevision.payload) ?? {};
        const rowStatus = ensureString(localRevision.status);
        const rowBid = ensureString(localRevision.booking_id);
        const rowUid = ensureString(localRevision.unique_id);
        const rowResId = ensureString(localRevision.reservation_id);
        list = [
          {
            id: localRevision.revision_id,
            _local_reservation_id: rowResId || undefined,
            attributes: {
              ...stored,
              id: localRevision.revision_id,
              booking_id: rowBid || ensureString(stored.booking_id),
              unique_id: rowUid || ensureString(stored.unique_id) || ensureString(stored.booking_unique_id) || ensureString(stored.ota_reservation_code),
              status: ensureString(stored.status) || rowStatus || undefined,
            },
          },
        ];
      }
    }
    if (webhookRecentPull) {
      list = filterRevisionsByRecentWindow(list, args.recentWindowSeconds, args.sourceEvent);
      if (list.length === 0) {
        const recover = await fetchChannex(
          args.baseUrl,
          args.apiKey,
          `/api/v1/booking_revisions?filter[property_id]=${encodeURIComponent(args.propertyId)}&order[inserted_at]=desc&pagination[limit]=80`,
        );
        if (recover.ok) list = filterRevisionsByRecentWindow(parseFeedList(recover.data), args.recentWindowSeconds, args.sourceEvent);
      }
    }
    return { ok: true, list, feedPath };
  }

  private async clearStaleModifications(channelId: string, establishmentId: string): Promise<void> {
    const staleModified = await this.prisma.channex_booking_revisions.findMany({
      where: { ota_channel_id: channelId, status: "modified", process_status: { in: ["pending", "failed"] }, reservation_id: { not: null } },
      select: { id: true, reservation_id: true },
      take: 200,
    });
    for (const row of staleModified) {
      const reservationId = ensureString(row.reservation_id);
      if (!reservationId) continue;
      const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { status: true } });
      if (ensureString(reservation?.status).toLowerCase() === "cancelled") {
        await this.prisma.channex_booking_revisions.update({
          where: { id: row.id },
          data: { process_status: "processed", error_message: "Superseded: local reservation already cancelled", updated_at: new Date() },
        });
      }
    }
    const staleModifiedNoRid = await this.prisma.channex_booking_revisions.findMany({
      where: { ota_channel_id: channelId, status: "modified", process_status: { in: ["pending", "failed"] }, reservation_id: null },
      select: { id: true, booking_id: true, unique_id: true },
      take: 150,
    });
    for (const row of staleModifiedNoRid) {
      const bid = ensureString(row.booking_id);
      const uid = ensureString(row.unique_id);
      if (!bid && !uid) continue;
      const cancelledLink = await this.findLocalCancelledReservation(establishmentId, channelId, uid, bid);
      if (cancelledLink) {
        await this.prisma.channex_booking_revisions.update({
          where: { id: row.id },
          data: {
            process_status: "processed",
            error_message: "Superseded: local reservation already cancelled",
            reservation_id: cancelledLink,
            updated_at: new Date(),
          },
        });
      }
    }
  }

  private async processRevision(args: {
    item: AnyObj;
    listLength: number;
    channelId: string;
    establishmentId: string;
    revisionFilter: string;
    bookingIdFilter: string;
    bookingUniqueIdFilter: string;
    forceReprocess: boolean;
    autoApplyLifecycle: boolean;
    sourceEvent: string;
    webhookSummary: AnyObj | null;
    counters: Counters;
  }): Promise<void> {
    const { counters } = args;
    let attrs = asObject(args.item.attributes) ?? {};
    const processingMeta: ProcessingMeta = { used_category_mapping_fallback: false, fallback_reservation_id: null, modification_details: [] };
    const localReservationHint = ensureString(args.item._local_reservation_id);
    let revisionId = ensureString(attrs.id || attrs.revision_id || args.item.id || args.item.revision_id || nestedValue(args.item, "revision.id"));
    if (!revisionId && args.revisionFilter) revisionId = args.revisionFilter;
    let bookingId = ensureString(
      attrs.booking_id || attrs.bookingId || args.item.booking_id || args.item.bookingId || nestedValue(args.item, "relationships.booking.data.id") || nestedValue(args.item, "booking.id"),
    );
    let uniqueId = ensureString(attrs.unique_id || attrs.ota_reservation_code || attrs.booking_unique_id || args.item.unique_id || args.item.booking_unique_id || args.item.bookingUniqueId);
    if (!bookingId && args.bookingIdFilter) bookingId = args.bookingIdFilter;
    if (!uniqueId && args.bookingUniqueIdFilter) uniqueId = args.bookingUniqueIdFilter;
    if (args.webhookSummary) {
      const summaryCustomer = ensureString(args.webhookSummary.customer_name);
      const matchIds = channexWebhookSummaryMatchesItem(args.webhookSummary, {
        revisionId,
        bookingId,
        uniqueId,
        revisionFilter: args.revisionFilter,
        bookingIdFilter: args.bookingIdFilter,
        bookingUniqueIdFilter: args.bookingUniqueIdFilter,
      });
      if (matchIds || (args.listLength === 1 && Boolean(summaryCustomer))) attrs = mergeChannexWebhookSummaryIntoAttrs(attrs, args.webhookSummary);
    }
    const otaName = ensureString(attrs.ota_name) || "Channex";
    const existingOta = await this.findOtaReservation(args.channelId, uniqueId, bookingId);
    const reservationAlreadyExists = !!ensureString(existingOta?.reservation_id);
    const detectedOverbooking = detectChannexOverbooking(attrs, args.sourceEvent);
    const isSelfOverbookingRelocation = isPmsOverbookingRelocationRevision(attrs);
    if (!revisionId || (!bookingId && !uniqueId)) {
      counters.skippedMissingIds += 1;
      return;
    }
    const exists = isUuid(revisionId)
      ? await this.prisma.channex_booking_revisions.findFirst({
          where: { ota_channel_id: args.channelId, revision_id: revisionId },
          select: { id: true, process_status: true, reservation_id: true, status: true },
        })
      : null;
    let revisionStatus = deriveRevisionStatus(attrs, reservationAlreadyExists);
    const storedLifecycle = normalizeRevisionStatus(exists?.status);
    if (storedLifecycle === "cancelled") revisionStatus = "cancelled";
    if (args.sourceEvent === "booking_cancellation") revisionStatus = "cancelled";
    if (args.sourceEvent === "booking_cancellation" && revisionStatus !== "cancelled") {
      counters.skippedBySourceEvent += 1;
      return;
    }
    if (args.sourceEvent === "booking_modification" && revisionStatus === "cancelled") {
      counters.skippedBySourceEvent += 1;
      return;
    }
    if (!args.forceReprocess && exists?.id && (exists.process_status === "acked" || exists.process_status === "processed")) {
      counters.skippedAlreadyProcessed += 1;
      return;
    }
    counters.processed += 1;
    let reservationId = "";
    let processStatusForRevision: "processed" | "pending" = "processed";
    try {
      const customer = asObject(attrs.customer) ?? {};
      const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
      const firstRoom = asObject(rooms[0]) ?? {};
      const guests = Array.isArray(firstRoom.guests) ? (firstRoom.guests as AnyObj[]) : [];
      const firstGuest = asObject(guests[0]);
      const firstName = ensureString(customer.name || customer.first_name || firstGuest?.name);
      const lastName = ensureString(customer.surname || customer.last_name || firstGuest?.surname);
      const fromSummary = ensureString(attrs.customer_name);
      const guestName = fromSummary || `${firstName} ${lastName}`.trim() || "Hóspede Channex";
      const email = ensureString(customer.mail || customer.email) || null;
      const phone = ensureString(customer.phone || customer.mobile || customer.phone_number) || null;
      const roomMeta = asObject(firstRoom.meta) ?? {};
      const roomTypeId = ensureString(firstRoom.room_type_id || firstRoom.room_type_code || roomMeta.room_type_code);
      const ratePlanId = ensureString(firstRoom.rate_plan_id || firstRoom.rate_plan_code || roomMeta.rate_plan_code);
      const arrivalDate = ensureString(attrs.arrival_date || firstRoom.checkin_date);
      const departureDate = ensureString(attrs.departure_date || firstRoom.checkout_date);
      const amount = Number(attrs.amount ?? firstRoom.amount ?? 0);
      const paidByOta = ensureString(attrs.payment_collect).toLowerCase() === "ota";
      const occInfo = extractOccupancyInfo(attrs, firstRoom);
      const channexNotes = extractChannexNotes(attrs, firstRoom);
      const childAgeLine = occInfo.children > 0 ? `Children: ${occInfo.children}` + (occInfo.ages.length > 0 ? ` | Child Age: ${occInfo.ages.join(", ")}` : "") : "";
      const notesSuffix = [childAgeLine, ...channexNotes.map((note) => `Notes (Channex): ${note}`)].filter(Boolean).join("\n");
      const clientId = await this.resolveClient(guestName, email, phone, customer);
      const shouldApplyAutoPayment = paidByOta ? await this.shouldApplyChannelAutoPayment(args.establishmentId, otaName) : false;
      reservationId = ensureString(existingOta?.reservation_id);
      if (!reservationId && localReservationHint) reservationId = localReservationHint;
      if (!reservationId) reservationId = ensureString(exists?.reservation_id);
      const shouldQueueLifecyclePending =
        (revisionStatus === "modified" || revisionStatus === "cancelled") && !args.forceReprocess && !args.autoApplyLifecycle && !isSelfOverbookingRelocation;
      if (shouldQueueLifecyclePending) {
        if (reservationId && (revisionStatus === "modified" || revisionStatus === "cancelled")) {
          const currentReservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { status: true } });
          processStatusForRevision = ensureString(currentReservation?.status).toLowerCase() === "cancelled" ? "processed" : "pending";
        } else {
          processStatusForRevision = "pending";
        }
        if (revisionStatus === "modified") counters.modified += 1;
        if (revisionStatus === "cancelled") counters.cancelled += 1;
      }
      let categoryId = "";
      let channexMappedPricingPlanId: string | null = null;
      const needsCategoryMapping =
        (!shouldQueueLifecyclePending && (revisionStatus === "new" || revisionStatus === "modified") && !reservationId) ||
        (revisionStatus === "modified" && args.forceReprocess);
      if (!reservationId && (revisionStatus === "modified" || revisionStatus === "cancelled")) {
        const latestReservationId = await this.latestLinkedReservationId(args.channelId, bookingId, uniqueId);
        if (latestReservationId) {
          reservationId = latestReservationId;
          const latestReservation = await this.prisma.reservations.findUnique({ where: { id: latestReservationId }, select: { status: true } });
          if (ensureString(latestReservation?.status).toLowerCase() === "cancelled") processStatusForRevision = "processed";
        }
      }
      if (!reservationId && (revisionStatus === "new" || revisionStatus === "modified")) {
        const cancelledLocalId = await this.findLocalCancelledReservation(args.establishmentId, args.channelId, uniqueId, bookingId);
        if (cancelledLocalId) {
          reservationId = cancelledLocalId;
          processStatusForRevision = "processed";
          await this.insertLog({
            otaChannelId: args.channelId,
            establishmentId: args.establishmentId,
            direction: "pull_booking",
            status: "info",
            endpoint: "channex-reservations-sync (link_cancelled_local_skip_duplicate)",
            message: `Vínculo à reserva já cancelada no PMS — evita duplicar/reabrir pelo feed (${revisionId})`,
            request: { revision_id: revisionId, reservation_id: cancelledLocalId, booking_id: bookingId || null, unique_id: uniqueId || null, revision_status: revisionStatus },
          });
        }
      }
      if (!reservationId && revisionStatus === "modified" && args.forceReprocess) {
        reservationId = await this.findReservationByNotes(args.establishmentId, [uniqueId, bookingId], OPEN_STAY, true);
      }
      if (!reservationId && revisionStatus === "cancelled") {
        reservationId = await this.findReservationByNotes(args.establishmentId, [uniqueId, bookingId], OPEN_STAY, false);
      }
      if (shouldQueueLifecyclePending && revisionStatus === "modified" && reservationId) {
        processingMeta.modification_details = await this.modificationDetails({
          channelId: args.channelId,
          reservationId,
          guestName,
          arrivalDate,
          departureDate,
          amount,
          roomTypeId,
          ratePlanId,
        });
      }
      if (needsCategoryMapping) {
        const mapped = await this.categoryMapping(args.channelId, roomTypeId, ratePlanId);
        categoryId = mapped.categoryId;
        if (mapped.pricingPlanId) channexMappedPricingPlanId = mapped.pricingPlanId;
        if (!categoryId) {
          const fallbackReservationId = await this.latestLinkedReservationId(args.channelId, bookingId, uniqueId);
          if (fallbackReservationId) {
            const fallbackReservation = await this.prisma.reservations.findUnique({
              where: { id: fallbackReservationId },
              select: { category_id: true, pricing_plan_id: true },
            });
            categoryId = ensureString(fallbackReservation?.category_id);
            const fbPlan = ensureString(fallbackReservation?.pricing_plan_id);
            if (fbPlan) channexMappedPricingPlanId = fbPlan;
            if (categoryId) {
              processingMeta.used_category_mapping_fallback = true;
              processingMeta.fallback_reservation_id = fallbackReservationId;
            }
          }
        }
        if (!categoryId) throw new Error(`Mapeamento não encontrado para room_type_id=${roomTypeId} rate_plan_id=${ratePlanId}`);
      }
      if (revisionStatus === "modified" && args.forceReprocess && !reservationId) {
        throw new Error(`Não foi possível localizar a reserva original para reprocessar booking ${uniqueId || bookingId}. Operação bloqueada para evitar duplicidade.`);
      }
      const stay: StayInput = {
        channelId: args.channelId,
        establishmentId: args.establishmentId,
        revisionId,
        bookingId,
        uniqueId,
        guestName,
        email,
        phone,
        clientId,
        arrivalDate,
        departureDate,
        amount,
        paidByOta,
        shouldApplyAutoPayment,
        adults: occInfo.adults,
        children: occInfo.children,
        notesSuffix,
        childAgeLine,
        channexNotes,
        otaName,
        detectedOverbooking,
        categoryId,
        mappedPlanId: channexMappedPricingPlanId,
        existingOta,
        roomTypeId,
        ratePlanId,
      };
      if (!shouldQueueLifecyclePending && (revisionStatus === "new" || revisionStatus === "modified") && !reservationId) {
        reservationId = await this.createChannelStay(stay);
        counters.created += 1;
      } else if (!shouldQueueLifecyclePending && revisionStatus === "modified" && reservationId) {
        const outcome = await this.modifyChannelStay(stay, reservationId, args.forceReprocess, isSelfOverbookingRelocation);
        reservationId = outcome.reservationId;
        if (outcome.processStatus) processStatusForRevision = outcome.processStatus;
        counters.modified += 1;
      } else if (!shouldQueueLifecyclePending && revisionStatus === "cancelled" && reservationId) {
        await this.cancelChannelStay(stay, reservationId);
        counters.cancelled += 1;
      } else if (!shouldQueueLifecyclePending && revisionStatus === "cancelled" && !reservationId) {
        await this.supersede(args.channelId, revisionId, bookingId, uniqueId, `Superseded by cancellation revision ${revisionId}`, true);
        counters.cancelled += 1;
      }
      await this.upsertRevision({
        channelId: args.channelId,
        establishmentId: args.establishmentId,
        revisionId,
        bookingId,
        uniqueId,
        systemId: ensureString(attrs.system_id) || null,
        status: revisionStatus || "new",
        payload: { ...attrs, _processing_meta: { ...processingMeta, detected_overbooking: detectedOverbooking } },
        reservationId: reservationId || null,
        processStatus: processStatusForRevision,
        errorMessage: null,
        setReservationId: true,
      });
      await this.supersede(args.channelId, revisionId, bookingId, uniqueId, `Superseded by newer revision ${revisionId}`, false);
      if (processStatusForRevision === "processed") await this.enqueueAck(args.channelId, args.establishmentId, revisionId);
    } catch (error) {
      counters.failed += 1;
      await this.upsertRevision({
        channelId: args.channelId,
        establishmentId: args.establishmentId,
        revisionId,
        bookingId,
        uniqueId,
        systemId: ensureString(attrs.system_id) || null,
        status: revisionStatus || "new",
        payload: { ...attrs, _processing_meta: { ...processingMeta, detected_overbooking: detectedOverbooking } },
        reservationId: null,
        processStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Falha no processamento",
        setReservationId: false,
      });
    }
  }

  private async createChannelStay(stay: StayInput): Promise<string> {
    let reservationId = "";
    let reservationIsOverbooking = stay.detectedOverbooking;
    if (stay.detectedOverbooking && stay.categoryId) {
      reservationId = await this.createOverbookingFallback(stay, "Channex");
      await this.insertLog({
        otaChannelId: stay.channelId,
        establishmentId: stay.establishmentId,
        direction: "pull_booking",
        status: "warning",
        endpoint: "channex-reservations-sync (detected_overbooking_fallback)",
        message: `Reserva criada em modo overbooking por sinal do feed/webhook (${stay.revisionId})`,
        request: { booking_id: stay.bookingId || null, unique_id: stay.uniqueId || null, reservation_id: reservationId, category_id: stay.categoryId },
      });
    } else {
      const created = await this.createReservationWithLock(stay, [`Channex ${stay.otaName} · booking ${stay.uniqueId || stay.bookingId}`]);
      if (!created.reservationId) {
        if (isAvailabilityErrorMessage(created.error) && stay.categoryId) {
          reservationIsOverbooking = true;
          reservationId = await this.createOverbookingFallback(stay, "Channex");
          await this.insertLog({
            otaChannelId: stay.channelId,
            establishmentId: stay.establishmentId,
            direction: "pull_booking",
            status: "warning",
            endpoint: "channex-reservations-sync (overbooking_fallback)",
            message: `Reserva criada sem quarto por indisponibilidade (${stay.revisionId})`,
            request: {
              booking_id: stay.bookingId || null,
              unique_id: stay.uniqueId || null,
              reservation_id: reservationId,
              category_id: stay.categoryId,
              rpc_error: created.error,
            },
          });
        } else {
          throw new Error(created.error || "Falha ao criar reserva");
        }
      } else {
        reservationId = created.reservationId;
      }
    }
    reservationId = await this.linkOtaOrCancelOrphan(stay, reservationId);
    try {
      const reservationRow = await this.prisma.reservations.findUnique({
        where: { id: reservationId },
        select: { reservation_code: true, checkin_date: true, checkout_date: true, total_amount: true, paid_amount: true, notes: true },
      });
      if (ensureString(reservationRow?.notes).toLowerCase().includes("overbooking")) reservationIsOverbooking = true;
      await this.notifyEstablishment({
        establishmentId: stay.establishmentId,
        type: "new_reservation",
        title: "Nova Reserva de Canal",
        message: `${reservationRow?.reservation_code ? `Nova reserva ${reservationRow.reservation_code}` : "Nova reserva"} de ${stay.guestName || "Hóspede"} via Channex / ${stay.otaName || "não informado"}`,
        priority: "medium",
        metadata: {
          reservation_id: reservationId,
          reservation_code: reservationRow?.reservation_code || null,
          channel_manager: "Channex",
          source_channel: stay.otaName,
          source: "channex_channel",
        },
      });
      await this.ensureWebCheckin(
        reservationId,
        stay.establishmentId,
        reservationRow?.reservation_code ?? null,
        reservationRow?.checkin_date ?? null,
        reservationRow?.checkout_date ?? null
      );
      await this.queueChannelReservationEmail({
        reservationId,
        establishmentId: stay.establishmentId,
        guestName: stay.guestName,
        guestEmail: stay.email,
        totalAmount: numberOf(reservationRow?.total_amount ?? stay.amount ?? 0),
        paidAmount: numberOf(reservationRow?.paid_amount ?? 0),
        checkinDate: dateOnlyString(reservationRow?.checkin_date ?? stay.arrivalDate),
        checkoutDate: dateOnlyString(reservationRow?.checkout_date ?? stay.departureDate),
        reservationCode: ensureString(reservationRow?.reservation_code),
      });
    } catch (error) {
      this.logger.warn(`channex-reservations-sync notification/web-checkin warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    try {
      if (reservationIsOverbooking) await this.checkinCharge.run({ reservation_id: reservationId, intent: "reservation_overbooking" });
      else await this.maybeSendCheckinCharge(reservationId, stay.establishmentId);
    } catch (error) {
      this.logger.warn(`channex-reservations-sync checkin-charge warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    if (stay.paidByOta && stay.amount > 0) {
      const payErr = await this.insertChannelPrepaidPayment(stay, reservationId);
      if (payErr) this.logger.warn(`channex-reservations-sync prepaid payment warning: ${payErr}`);
    }
    return reservationId;
  }

  private async modifyChannelStay(
    stay: StayInput,
    reservationId: string,
    forceReprocess: boolean,
    isSelfOverbookingRelocation: boolean,
  ): Promise<{ reservationId: string; processStatus?: "processed" | "pending" }> {
    const guard = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { status: true } });
    if (ensureString(guard?.status).toLowerCase() === "cancelled") {
      await this.insertLog({
        otaChannelId: stay.channelId,
        establishmentId: stay.establishmentId,
        direction: "pull_booking",
        status: "info",
        endpoint: "channex-reservations-sync (skip_modified_local_cancelled)",
        message: `Modificação Channex ignorada: reserva já cancelada no PMS (${stay.revisionId})`,
        request: { revision_id: stay.revisionId, reservation_id: reservationId, booking_id: stay.bookingId || null, unique_id: stay.uniqueId || null },
      });
      return { reservationId, processStatus: "processed" };
    }
    if (isSelfOverbookingRelocation && !forceReprocess) {
      await this.updateOtaRow(stay.channelId, stay.uniqueId, stay.bookingId, stay.existingOta, { sync_status: "synced", synced_at: new Date() });
      await this.insertLog({
        otaChannelId: stay.channelId,
        establishmentId: stay.establishmentId,
        direction: "pull_booking",
        status: "info",
        endpoint: "channex-reservations-sync (self_overbooking_relocation)",
        message: `Modificação técnica (realocação overbooking PMS) ignorada para pendência/reprocessamento (${stay.revisionId})`,
        request: { booking_id: stay.bookingId || null, unique_id: stay.uniqueId || null, reservation_id: reservationId },
      });
      return { reservationId };
    }
    const previousReservation = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { id: true, checkin_date: true, checkout_date: true, guest_name: true, total_amount: true, room_id: true, category_id: true, pricing_plan_id: true, notes: true },
    });
    if (forceReprocess && previousReservation?.id) {
      return { reservationId: await this.reprocessModification(stay, reservationId, previousReservation) };
    }
    let reservationIsOverbooking = stay.detectedOverbooking;
    const shouldApplyAutoPayment = stay.paidByOta ? await this.shouldApplyChannelAutoPayment(stay.establishmentId, stay.otaName) : false;
    let mappedCategoryId = "";
    let mappedPricingPlanId = "";
    if (stay.roomTypeId && stay.ratePlanId) {
      const mapping = await this.singlePricing(stay.channelId, stay.roomTypeId, stay.ratePlanId);
      mappedCategoryId = ensureString(mapping?.category_id);
      mappedPricingPlanId = ensureString(mapping?.pricing_plan_id);
    }
    const paid = stay.paidByOta && shouldApplyAutoPayment && stay.amount > 0;
    const notes = mergeReservationNotes(previousReservation?.notes, [
      stay.detectedOverbooking
        ? `Channex ${stay.otaName} · booking ${stay.uniqueId || stay.bookingId} · modify · OVERBOOKING (detectado no feed/webhook)`
        : `Channex ${stay.otaName} · booking ${stay.uniqueId || stay.bookingId} · modify`,
      ...(stay.childAgeLine ? [stay.childAgeLine] : []),
      ...stay.channexNotes.map((note) => `Notes (Channex): ${note}`),
    ]);
    const prevCategory = ensureString(previousReservation?.category_id);
    const sets: Prisma.Sql[] = [
      Prisma.sql`checkin_date = ${stay.arrivalDate || null}::date`,
      Prisma.sql`checkout_date = ${stay.departureDate || null}::date`,
      Prisma.sql`guest_name = ${stay.guestName}`,
      Prisma.sql`adults = ${stay.adults}`,
      Prisma.sql`children = ${stay.children}`,
      Prisma.sql`total_amount = ${stay.amount > 0 ? stay.amount : 0}`,
      Prisma.sql`paid_amount = ${paid ? stay.amount : 0}`,
      Prisma.sql`payment_status = ${paid ? "paid" : "pending"}::public.payment_status`,
      Prisma.sql`notes = ${notes}`,
    ];
    if (mappedCategoryId) {
      sets.push(Prisma.sql`category_id = ${mappedCategoryId}::uuid`);
      if (!prevCategory || prevCategory !== mappedCategoryId) sets.push(Prisma.sql`room_id = NULL`);
    }
    if (mappedPricingPlanId) sets.push(Prisma.sql`pricing_plan_id = ${mappedPricingPlanId}::uuid`);
    await this.prisma.$executeRaw`UPDATE public.reservations SET ${Prisma.join(sets, ", ")} WHERE id = ${reservationId}::uuid`;
    await this.updateOtaRow(stay.channelId, stay.uniqueId, stay.bookingId, stay.existingOta, {
      ota_guest_name: stay.guestName,
      ota_guest_email: stay.email,
      ota_guest_phone: stay.phone,
      ota_source_channel_name: stay.otaName,
      sync_status: "synced",
      synced_at: new Date(),
    });
    try {
      const reservationRow = await this.prisma.reservations.findUnique({
        where: { id: reservationId },
        select: { reservation_code: true, checkin_date: true, checkout_date: true, total_amount: true, paid_amount: true, notes: true },
      });
      if (ensureString(reservationRow?.notes).toLowerCase().includes("overbooking")) reservationIsOverbooking = true;
      await this.notifyLifecycle(stay, reservationId, reservationRow?.reservation_code ?? null, "reservation_modified");
      await this.ensureWebCheckin(
        reservationId,
        stay.establishmentId,
        reservationRow?.reservation_code ?? null,
        reservationRow?.checkin_date ?? null,
        reservationRow?.checkout_date ?? null
      );
      await this.queueChannelReservationEmail({
        reservationId,
        establishmentId: stay.establishmentId,
        guestName: stay.guestName,
        guestEmail: stay.email,
        totalAmount: numberOf(reservationRow?.total_amount ?? stay.amount ?? 0),
        paidAmount: numberOf(reservationRow?.paid_amount ?? 0),
        checkinDate: dateOnlyString(reservationRow?.checkin_date ?? stay.arrivalDate),
        checkoutDate: dateOnlyString(reservationRow?.checkout_date ?? stay.departureDate),
        reservationCode: ensureString(reservationRow?.reservation_code),
      });
    } catch (error) {
      this.logger.warn(`channex-reservations-sync modified notification/web-checkin warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    try {
      if (!reservationIsOverbooking) await this.maybeSendCheckinCharge(reservationId, stay.establishmentId);
    } catch (error) {
      this.logger.warn(`channex-reservations-sync modified checkin-charge warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    if (stay.paidByOta && stay.amount > 0) {
      const payErr = await this.insertChannelPrepaidPayment({ ...stay, shouldApplyAutoPayment }, reservationId);
      if (payErr) this.logger.warn(`channex-reservations-sync modified prepaid payment warning: ${payErr}`);
    }
    try {
      await this.checkinCharge.run({ reservation_id: reservationId, intent: reservationIsOverbooking ? "reservation_overbooking" : "reservation_modified" });
    } catch (error) {
      this.logger.warn(`channex-reservations-sync modified lifecycle template warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    return { reservationId };
  }

  private async reprocessModification(
    stay: StayInput,
    oldReservationId: string,
    previousReservation: {
      id: string;
      checkin_date: Date;
      checkout_date: Date;
      guest_name: string | null;
      total_amount: Prisma.Decimal;
      room_id: string | null;
      category_id: string;
      pricing_plan_id: string | null;
      notes: string | null;
    },
  ): Promise<string> {
    let reservationIsOverbooking = stay.detectedOverbooking;
    await this.refundReservationPayments(oldReservationId);
    await this.prisma.reservations.update({
      where: { id: oldReservationId },
      data: {
        status: reservation_status.cancelled,
        cancelled_at: new Date(),
        paid_amount: 0,
        payment_status: payment_status.pending,
        notes: `Reserva cancelada para reprocessamento de modificação do canal · booking ${stay.uniqueId || stay.bookingId}`,
      },
    });
    let reservationId = "";
    if (stay.detectedOverbooking && stay.categoryId) {
      reservationId = await this.createOverbookingFallback(stay, "Channex");
      await this.insertLog({
        otaChannelId: stay.channelId,
        establishmentId: stay.establishmentId,
        direction: "pull_booking",
        status: "warning",
        endpoint: "channex-reservations-sync (modified_detected_overbooking_fallback)",
        message: `Reprocessamento criou reserva em modo overbooking por sinal do feed/webhook (${stay.revisionId})`,
        request: { booking_id: stay.bookingId || null, unique_id: stay.uniqueId || null, reservation_id: reservationId, category_id: stay.categoryId },
      });
    } else {
      const created = await this.createReservationWithLock(stay, [`Channex ${stay.otaName} · booking ${stay.uniqueId || stay.bookingId} · modified (reprocess)`]);
      if (!created.reservationId) {
        if (isAvailabilityErrorMessage(created.error) && stay.categoryId) {
          reservationIsOverbooking = true;
          reservationId = await this.createOverbookingFallback(stay, "Channex");
          await this.insertLog({
            otaChannelId: stay.channelId,
            establishmentId: stay.establishmentId,
            direction: "pull_booking",
            status: "warning",
            endpoint: "channex-reservations-sync (modified_overbooking_fallback)",
            message: `Reprocessamento criou reserva sem quarto por indisponibilidade (${stay.revisionId})`,
            request: {
              booking_id: stay.bookingId || null,
              unique_id: stay.uniqueId || null,
              reservation_id: reservationId,
              category_id: stay.categoryId,
              rpc_error: created.error,
            },
          });
        } else {
          throw new Error(created.error || "Falha ao reprocessar modificação");
        }
      } else {
        reservationId = created.reservationId;
      }
    }
    const newReservationRow = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { reservation_code: true, notes: true } });
    const newReservationCode = ensureString(newReservationRow?.reservation_code);
    if (ensureString(newReservationRow?.notes).toLowerCase().includes("overbooking")) reservationIsOverbooking = true;
    const cancelledAt = new Date().toISOString();
    await this.prisma.reservations.update({
      where: { id: oldReservationId },
      data: {
        cancellation_reason: `Reserva cancelada para reprocessar a versão atual.\nNova reserva: ${newReservationCode || reservationId}`,
        notes: `Reserva cancelada para reprocessar a versão atual.\nNova reserva: ${newReservationCode || reservationId}\nCancelada em: ${cancelledAt}`,
      },
    });
    await this.updateOtaRow(stay.channelId, stay.uniqueId, stay.bookingId, stay.existingOta, {
      reservation_id: reservationId,
      ota_guest_name: stay.guestName,
      ota_guest_email: stay.email,
      ota_guest_phone: stay.phone,
      ota_source_channel_name: stay.otaName,
      sync_status: "synced",
      synced_at: new Date(),
    });
    if (stay.paidByOta && stay.amount > 0) {
      const payErr = await this.insertChannelPrepaidPayment(stay, reservationId);
      if (payErr) this.logger.warn(`channex-reservations-sync modified(reprocess) prepaid payment warning: ${payErr}`);
    }
    try {
      await this.checkinCharge.run({
        reservation_id: reservationId,
        intent: reservationIsOverbooking ? "reservation_overbooking" : "reservation_modified",
      });
    } catch (error) {
      this.logger.warn(`channex-reservations-sync modified(reprocess) lifecycle template warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    await this.insertLog({
      otaChannelId: stay.channelId,
      establishmentId: stay.establishmentId,
      direction: "pull_booking",
      status: "success",
      endpoint: "channex-reservations-sync (modified_reprocess)",
      message: `Modificação aceita e reprocessada (${stay.revisionId})`,
      request: {
        revision_id: stay.revisionId,
        booking_id: stay.bookingId || null,
        unique_id: stay.uniqueId || null,
        old_reservation_id: oldReservationId,
        new_reservation_id: reservationId,
        new_reservation_code: newReservationCode || null,
      },
    });
    await this.notifyEstablishment({
      establishmentId: stay.establishmentId,
      type: "reservation_modified",
      title: "Reserva de Canal Reprocessada",
      message: `Reserva ${stay.uniqueId || stay.bookingId} reprocessada. Alterações: hóspede, período, valores e possível quarto/categoria.`,
      priority: "high",
      metadata: {
        source: "channex_channel",
        action: "modified_reprocess",
        previous_reservation: {
          id: previousReservation.id,
          checkin_date: dateOnlyString(previousReservation.checkin_date),
          checkout_date: dateOnlyString(previousReservation.checkout_date),
          guest_name: previousReservation.guest_name,
          total_amount: numberOf(previousReservation.total_amount),
          room_id: previousReservation.room_id,
          category_id: previousReservation.category_id,
          pricing_plan_id: previousReservation.pricing_plan_id,
          notes: previousReservation.notes,
        },
        current: {
          reservation_id: reservationId,
          checkin_date: stay.arrivalDate || null,
          checkout_date: stay.departureDate || null,
          guest_name: stay.guestName,
          total_amount: stay.amount > 0 ? stay.amount : 0,
        },
      },
    });
    return reservationId;
  }

  private async cancelChannelStay(stay: StayInput, reservationId: string): Promise<void> {
    await this.applyChannelCancellation(reservationId, `Cancelada via Channex · booking ${stay.uniqueId || stay.bookingId}`);
    await this.updateOtaRow(stay.channelId, stay.uniqueId, stay.bookingId, stay.existingOta, { sync_status: "cancelled", synced_at: new Date() });
    try {
      const reservationRow = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { reservation_code: true } });
      await this.notifyLifecycle(stay, reservationId, reservationRow?.reservation_code ?? null, "reservation_cancelled");
    } catch (error) {
      this.logger.warn(`channex-reservations-sync cancelled notification warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    await this.supersede(stay.channelId, stay.revisionId, stay.bookingId, stay.uniqueId, `Superseded by cancellation revision ${stay.revisionId}`, true);
    try {
      await this.checkinCharge.run({ reservation_id: reservationId, intent: "reservation_cancelled" });
    } catch (error) {
      this.logger.warn(`channex-reservations-sync cancelled lifecycle template warning: ${error instanceof Error ? error.message : "erro"}`);
    }
    await this.insertLog({
      otaChannelId: stay.channelId,
      establishmentId: stay.establishmentId,
      direction: "pull_booking",
      status: "success",
      endpoint: "channex-reservations-sync (cancelled)",
      message: `Cancelamento processado (${stay.revisionId})`,
      request: { revision_id: stay.revisionId, booking_id: stay.bookingId || null, unique_id: stay.uniqueId || null, reservation_id: reservationId },
    });
  }

  private async applyChannelCancellation(reservationId: string, reason: string): Promise<void> {
    const reservation = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { id: true, checkin_date: true, checkout_date: true, total_amount: true, pricing_plan_id: true, cancellation_policy_applied: true },
    });
    if (!reservation?.id) return;
    let policyId = ensureString(reservation.cancellation_policy_applied) || null;
    if (!policyId && reservation.pricing_plan_id) {
      const plan = await this.prisma.pricing_plans.findUnique({ where: { id: reservation.pricing_plan_id }, select: { cancellation_policy_id: true } });
      policyId = ensureString(plan?.cancellation_policy_id) || null;
    }
    let penalty = 0;
    let details: AnyObj | null = null;
    if (policyId) {
      const policy = await this.prisma.cancellation_policies.findFirst({ where: { id: policyId, is_active: true } });
      if (policy) {
        const totalAmount = Math.max(0, numberOf(reservation.total_amount));
        const checkin = parseDateOnly(reservation.checkin_date);
        const checkout = parseDateOnly(reservation.checkout_date);
        const today = parseDateOnly(new Date().toISOString()) ?? new Date();
        const nights = checkin && checkout ? Math.max(1, daysBetweenUtc(checkin, checkout)) : 1;
        const firstNight = totalAmount > 0 ? totalAmount / nights : 0;
        const daysBeforeCheckin = checkin ? daysBetweenUtc(today, checkin) : 0;
        const hasFree = Boolean(policy.has_free_cancellation);
        const freeDeadlineDays = parseDaysFromText(policy.free_cancellation_deadline);
        const insideFreeWindow = hasFree && freeDeadlineDays != null ? daysBeforeCheckin >= freeDeadlineDays : false;
        let feeType = ensureString(policy.cancellation_fee_type).toLowerCase();
        let feePct = Number(policy.cancellation_fee_percentage ?? 0);
        if (hasFree && !insideFreeWindow) {
          const afterType = ensureString(policy.cancellation_fee_after_deadline_type).toLowerCase();
          const afterPct = Number(policy.cancellation_fee_after_deadline_percentage ?? 0);
          if (afterType) feeType = afterType;
          if (afterPct > 0) feePct = afterPct;
        }
        if (insideFreeWindow) penalty = 0;
        else if (feeType === "percentage" && feePct > 0) penalty = (totalAmount * feePct) / 100;
        else if (feeType === "first_night") penalty = firstNight;
        else penalty = 0;
        penalty = Math.max(0, Math.min(totalAmount, Number(penalty.toFixed(2))));
        details = {
          source: "channex_channel",
          computed_at: new Date().toISOString(),
          has_free_cancellation: hasFree,
          free_deadline_days: freeDeadlineDays,
          days_before_checkin: daysBeforeCheckin,
          inside_free_window: insideFreeWindow,
          fee_type: feeType || null,
          fee_percentage: feeType === "percentage" ? feePct : null,
          first_night_amount: firstNight,
          total_amount: totalAmount,
          penalty,
        };
      }
    }
    const updated = await this.prisma.reservations.updateMany({
      where: { id: reservationId },
      data: {
        status: reservation_status.cancelled,
        cancelled_at: new Date(),
        cancellation_reason: reason,
        cancellation_penalty: penalty,
        cancellation_policy_applied: policyId,
        cancellation_calculation_details: details ? asJson(details) : Prisma.DbNull,
        notes: reason,
      },
    });
    if (updated.count === 0) {
      throw new Error("Nenhuma reserva foi atualizada (id inválido ou linha inexistente). Verifique o vínculo ota_reservations / revisão Channex.");
    }
  }

  private async createReservationWithLock(stay: StayInput, noteLines: string[]): Promise<{ reservationId: string | null; error: string }> {
    const paid = stay.paidByOta && stay.shouldApplyAutoPayment && stay.amount > 0;
    const data: AnyObj = {
      guest_name: stay.guestName,
      adults: stay.adults,
      children: stay.children,
      total_amount: stay.amount > 0 ? stay.amount : 0,
      paid_amount: paid ? stay.amount : 0,
      payment_status: paid ? "paid" : "pending",
      status: "pending",
      channel: "ota",
      notes: mergeReservationNotes(null, [
        ...noteLines,
        ...(stay.detectedOverbooking ? ["OVERBOOKING (detectado no feed/webhook)"] : []),
        ...(stay.childAgeLine ? [stay.childAgeLine] : []),
        ...stay.channexNotes.map((note) => `Notes (Channex): ${note}`),
      ]),
      client_id: stay.clientId,
      ...(stay.mappedPlanId ? { pricing_plan_id: stay.mappedPlanId } : {}),
    };
    const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
      SELECT public.create_reservation_with_lock(
        ${JSON.stringify(data)}::jsonb,
        ${stay.arrivalDate}::date,
        ${stay.departureDate}::date,
        ${stay.establishmentId}::uuid,
        ${null}::uuid,
        ${stay.categoryId}::uuid
      ) AS result
    `;
    const raw = rows[0]?.result;
    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as { success?: boolean; reservation_id?: string; error?: string } | null;
    if (!result?.success || !result.reservation_id) return { reservationId: null, error: ensureString(result?.error) };
    return { reservationId: String(result.reservation_id), error: "" };
  }

  private async createOverbookingFallback(stay: StayInput, _label: string): Promise<string> {
    const paid = stay.paidByOta && stay.shouldApplyAutoPayment && stay.amount > 0;
    const notes =
      `Channex ${stay.otaName} · booking ${stay.uniqueId || stay.bookingId} · OVERBOOKING (sem disponibilidade no lock)` +
      ` · criado para tratativa manual no PMS` +
      (stay.notesSuffix ? `\n${stay.notesSuffix}` : "");
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO public.reservations (
        establishment_id, category_id, room_id, client_id, guest_name, checkin_date, checkout_date,
        adults, children, total_amount, paid_amount, payment_status, status, channel, notes, pricing_plan_id
      ) VALUES (
        ${stay.establishmentId}::uuid,
        ${stay.categoryId}::uuid,
        NULL,
        ${stay.clientId}::uuid,
        ${stay.guestName},
        ${stay.arrivalDate}::date,
        ${stay.departureDate}::date,
        ${Math.max(0, Math.floor(Number(stay.adults || 0)))},
        ${Math.max(0, Math.floor(Number(stay.children || 0)))},
        ${stay.amount > 0 ? stay.amount : 0},
        ${paid ? stay.amount : 0},
        ${paid ? "paid" : "pending"}::public.payment_status,
        'pending'::public.reservation_status,
        'ota',
        ${notes},
        ${stay.mappedPlanId}::uuid
      )
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Falha ao criar fallback de overbooking no PMS");
    return id;
  }

  private async linkOtaOrCancelOrphan(stay: StayInput, reservationId: string): Promise<string> {
    const code = ensureString(stay.uniqueId || stay.bookingId);
    let linkData: unknown = null;
    let linkMessage = "";
    try {
      const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.ota_link_reservation_after_sync(
          ${reservationId}::uuid,
          ${stay.channelId}::uuid,
          ${code},
          ${JSON.stringify({
            ota_guest_name: stay.guestName,
            ota_guest_email: stay.email,
            ota_guest_phone: stay.phone,
            ota_source_channel_name: stay.otaName,
            sync_status: "synced",
            synced_at: new Date().toISOString(),
          })}::jsonb
        ) AS result
      `;
      linkData = rows[0]?.result ?? null;
    } catch (error) {
      linkMessage = error instanceof Error ? error.message : "erro";
    }
    if (linkMessage) {
      await this.cancelReservationOtaOrphan(reservationId, `Falha ao gravar vínculo OTA (Channex): ${linkMessage}`);
      throw new Error(`Falha ao vincular reserva OTA (Channex): ${linkMessage}`);
    }
    const linkParsed = parseOtaLinkRpcResult(linkData);
    if (!linkParsed.success || !linkParsed.reservation_id) {
      await this.cancelReservationOtaOrphan(reservationId, `Falha ao gravar vínculo OTA (Channex): ${linkParsed.error || "unknown"}`);
      throw new Error(linkParsed.error || "Falha ao vincular reserva OTA (Channex)");
    }
    if (linkParsed.kind === "duplicate_recovered") {
      this.logger.warn(`channex-reservations-sync: vínculo OTA duplicado — usando reserva canônica ${linkParsed.reservation_id}`);
    }
    return linkParsed.reservation_id;
  }

  private async cancelReservationOtaOrphan(reservationId: string, reason: string): Promise<void> {
    const row = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { notes: true } });
    const merged = [ensureString(row?.notes), `[OTA sync] ${reason}`].filter(Boolean).join("\n");
    await this.prisma.reservations.updateMany({
      where: {
        id: reservationId,
        status: { in: [reservation_status.pending, reservation_status.unpaid, reservation_status.confirmed, reservation_status.preregistration, reservation_status.blocked] },
      },
      data: { status: reservation_status.cancelled, cancelled_at: new Date(), cancellation_reason: "ota_sync_failed", notes: merged },
    });
  }

  private async resolveClient(guestName: string, email: string | null, phone: string | null, customer: AnyObj): Promise<string> {
    const wanted = guestName.toLowerCase().replace(/\s+/g, " ");
    if (email) {
      const found = await this.prisma.clients.findMany({ where: { email }, select: { id: true, full_name: true }, take: 2 });
      if (found.length === 1) {
        const existingNm = ensureString(found[0]?.full_name).toLowerCase().replace(/\s+/g, " ");
        if (existingNm && wanted && existingNm === wanted) return found[0].id;
      }
    }
    if (phone) {
      const found = await this.prisma.clients.findMany({ where: { phone }, select: { id: true, full_name: true }, take: 2 });
      if (found.length === 1) {
        const existingNm = ensureString(found[0]?.full_name).toLowerCase().replace(/\s+/g, " ");
        if (!wanted || !existingNm || existingNm === wanted) return found[0].id;
      }
    }
    const created = await this.prisma.clients.create({
      data: {
        full_name: guestName,
        email,
        phone,
        city: ensureString(customer.city) || null,
        country: ensureString(customer.country) || null,
        address: ensureString(customer.address) || null,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async shouldApplyChannelAutoPayment(establishmentId: string, partnerChannelName: string): Promise<boolean> {
    const hotelSettings = await this.prisma.hotel_settings.findFirst({
      where: { establishment_id: establishmentId },
      select: { auto_payment_ota: true, auto_payment_ota_channels: true },
    });
    if (hotelSettings?.auto_payment_ota !== true) return false;
    return partnerAllowed(hotelSettings.auto_payment_ota_channels, partnerChannelName);
  }

  private async insertChannelPrepaidPayment(stay: StayInput, reservationId: string): Promise<string | null> {
    if (stay.amount <= 0) return null;
    const hotelSettings = await this.prisma.hotel_settings.findFirst({
      where: { establishment_id: stay.establishmentId },
      select: { auto_payment_ota: true, auto_payment_carrier_id: true, auto_payment_channel_carrier_id: true, auto_payment_ota_channels: true },
    });
    if (hotelSettings?.auto_payment_ota !== true) return null;
    if (!partnerAllowed(hotelSettings.auto_payment_ota_channels, stay.otaName)) return null;
    const configuredCarrierId = hotelSettings.auto_payment_channel_carrier_id || hotelSettings.auto_payment_carrier_id || null;
    const marker = "Pré-pago via canal OTA (Channex)";
    const existing = await this.prisma.payments.findMany({
      where: { reservation_id: reservationId, notes: { contains: marker, mode: "insensitive" } },
      select: { id: true, carrier_id: true },
      take: 2,
    });
    if (existing.length === 1 && existing[0]) {
      if (!ensureString(existing[0].carrier_id) && configuredCarrierId) {
        try {
          await this.prisma.payments.update({ where: { id: existing[0].id }, data: { carrier_id: configuredCarrierId } });
        } catch (error) {
          return error instanceof Error ? error.message : "erro";
        }
      }
      return null;
    }
    const notes = [marker, `bookingId: ${stay.uniqueId || stay.bookingId}`, stay.otaName ? `canal parceiro: ${stay.otaName}` : null].filter(Boolean).join(" · ");
    try {
      await this.prisma.payments.create({
        data: {
          reservation_id: reservationId,
          establishment_id: stay.establishmentId,
          amount: stay.amount,
          payment_method: "deposit",
          payment_date: new Date(),
          carrier_id: configuredCarrierId,
          notes,
        },
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "erro";
    }
  }

  private async refundReservationPayments(reservationId: string): Promise<void> {
    let payments: Array<{ id: string }> = [];
    try {
      payments = await this.prisma.payments.findMany({ where: { reservation_id: reservationId }, select: { id: true } });
    } catch (error) {
      throw new Error(`Falha ao buscar pagamentos para estorno: ${error instanceof Error ? error.message : "erro"}`);
    }
    if (payments.length === 0) return;
    try {
      await this.prisma.payments.deleteMany({ where: { reservation_id: reservationId } });
    } catch (error) {
      throw new Error(`Falha ao estornar pagamentos da reserva antiga: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  private async queueChannelReservationEmail(args: {
    reservationId: string;
    establishmentId: string;
    guestName: string;
    guestEmail: string | null;
    totalAmount: number;
    paidAmount: number;
    checkinDate: string;
    checkoutDate: string;
    reservationCode: string;
  }): Promise<void> {
    if (!args.guestEmail) return;
    if (await this.shouldSkipGuestConfirmationEmail(args.reservationId)) {
      this.logger.warn("channex-reservations-sync: e-mail de confirmação omitido (overbooking/conflito)");
      return;
    }
    const eventType = args.paidAmount >= args.totalAmount && args.totalAmount > 0 ? "payment.confirmed" : "reservation.created";
    const template = await this.resolveEmailTemplate(eventType, args.establishmentId);
    if (!template?.id) return;
    const vars: Record<string, string> = {
      guest_name: args.guestName || "Hóspede",
      reservation_code: args.reservationCode || "",
      reservation_id: args.reservationId,
      checkin_date: args.checkinDate || "",
      checkout_date: args.checkoutDate || "",
      total_amount: String(args.totalAmount || 0),
      paid_amount: String(args.paidAmount || 0),
    };
    const subject = replaceVars(ensureString(template.subject), vars);
    const bodyHtml = replaceVars(ensureString(template.body_html), vars);
    const queueEvent = args.paidAmount >= args.totalAmount && args.totalAmount > 0 ? "payment.confirmed" : "reservation.created";
    await this.prisma.$queryRaw`
      SELECT public.insert_email_queue(
        ${String(template.id)}::uuid,
        ${queueEvent},
        ${args.guestEmail},
        ${args.guestName || "Hóspede"},
        ${subject},
        ${bodyHtml},
        ${args.reservationId}::uuid,
        ${JSON.stringify(vars)}::jsonb,
        ${1}::int,
        ${template.cc_emails ?? null},
        ${template.bcc_emails ?? null}
      )
    `;
  }

  private async resolveEmailTemplate(eventType: "payment.confirmed" | "reservation.created", establishmentId: string): Promise<AnyObj | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.get_resolved_email_template(${eventType}::public.email_event_type, ${establishmentId}::uuid) AS result
      `;
      // RPC ok: null = desativado — não cair no global
      const resolved = rows[0]?.result;
      if (resolved == null) return null;
      if (typeof resolved === "object") return resolved as AnyObj;
    } catch (error) {
      this.logger.warn(`get_resolved_email_template: ${error instanceof Error ? error.message : "erro"}`);
    }
    try {
      const override = await this.prisma.establishment_email_templates.findFirst({
        where: { establishment_id: establishmentId, event_type: eventType as never },
        select: { is_active: true },
      });
      if (override && override.is_active === false) return null;
    } catch {
      /* ignore */
    }
    const templates = await this.prisma.email_templates.findMany({
      where: { event_type: eventType === "payment.confirmed" ? email_event_type.payment_confirmed : email_event_type.reservation_created, is_active: true },
    });
    return pickEmailTemplateForEstablishment(templates as unknown as AnyObj[], establishmentId);
  }

  private async shouldSkipGuestConfirmationEmail(reservationId: string): Promise<boolean> {
    const reservation = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { id: true, notes: true, room_id: true, checkin_date: true, checkout_date: true, establishment_id: true, pending_resolved_at: true },
    });
    if (!reservation) return false;
    if (reservation.pending_resolved_at != null) return false;
    const notes = ensureString(reservation.notes).toLowerCase();
    if (notes.includes("overbooking") && !reservation.room_id) return true;
    if (!reservation.room_id || !reservation.establishment_id) return false;
    const others = await this.prisma.reservations.findMany({
      where: { establishment_id: reservation.establishment_id, room_id: reservation.room_id, id: { not: reservationId }, status: { in: OPEN_STAY } },
      select: { checkin_date: true, checkout_date: true },
    });
    const start = dateOnlyString(reservation.checkin_date);
    const end = dateOnlyString(reservation.checkout_date);
    return others.some((other) => overlapReservationStayDates(start, end, dateOnlyString(other.checkin_date), dateOnlyString(other.checkout_date)));
  }

  private async ensureWebCheckin(
    reservationId: string,
    establishmentId: string,
    code: string | null,
    checkinDate: Date | null,
    checkoutDate: Date | null
  ): Promise<void> {
    const existing = await this.prisma.web_checkin.findFirst({ where: { reservation_id: reservationId }, select: { id: true } });
    if (existing?.id || !code) return;
    const token = Buffer.from(`${reservationId}:${code}:${Date.now()}`, "utf8").toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, 64);
    const checkin = checkinDate ?? new Date();
    const expiresAt = computeWebCheckinExpiresAt(checkin, checkoutDate);
    await this.prisma.web_checkin.create({
      data: { reservation_id: reservationId, establishment_id: establishmentId, token, locator: code, expires_at: expiresAt, status: "pending" },
    });
  }

  private async maybeSendCheckinCharge(reservationId: string, establishmentId: string): Promise<void> {
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
    const status = ensureString(row.status);
    const isOta = ensureString(row.channel || "direct") !== "direct";
    const checkinEligibleStatus = status === "confirmed" || (isOta && (status === "pending" || status === "preregistration"));
    const total = numberOf(row.total_amount);
    const paid = numberOf(row.paid_amount);
    if (total > 0 && paid < total) {
      await this.checkinCharge.run({ reservation_id: reservationId, intent: "payment_pending" });
      return;
    }
    if (config.send_timing === "after_confirmation" && checkinEligibleStatus) {
      await this.checkinCharge.run({ reservation_id: reservationId, intent: "checkin_reminder" });
    }
    if (config.send_timing === "after_ota" && isOta && checkinEligibleStatus) {
      await this.checkinCharge.run({ reservation_id: reservationId, intent: "checkin_reminder" });
    }
  }

  private async notifyLifecycle(stay: StayInput, reservationId: string, reservationCode: string | null, type: "reservation_modified" | "reservation_cancelled"): Promise<void> {
    const code = ensureString(reservationCode);
    const guest = stay.guestName || "Hóspede";
    const partner = stay.otaName || "não informado";
    const isCancelled = type === "reservation_cancelled";
    await this.notifyEstablishment({
      establishmentId: stay.establishmentId,
      type,
      title: isCancelled ? "Reserva de Canal Cancelada" : "Reserva de Canal Alterada",
      message: `${code ? `Reserva ${code}` : "Reserva"} de ${guest} via Channex / ${partner} foi ${isCancelled ? "cancelada" : "alterada"}`,
      priority: "medium",
      metadata: {
        reservation_id: reservationId,
        reservation_code: code || null,
        channel_manager: "Channex",
        source_channel: partner,
        source: "channex_channel",
        action: isCancelled ? "cancelled" : "modified",
      },
    });
  }

  private async notifyEstablishment(args: {
    establishmentId: string;
    type: string;
    title: string;
    message: string;
    priority: string;
    metadata: AnyObj;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT public.create_notification_for_establishment(
        ${args.establishmentId}::uuid,
        ${args.type}::public.notification_type,
        ${args.title},
        ${args.message},
        ${args.priority}::public.notification_priority,
        ${JSON.stringify(args.metadata)}::jsonb
      )
    `;
  }

  private async modificationDetails(args: {
    channelId: string;
    reservationId: string;
    guestName: string;
    arrivalDate: string;
    departureDate: string;
    amount: number;
    roomTypeId: string;
    ratePlanId: string;
  }): Promise<AnyObj[]> {
    const previous = await this.prisma.reservations.findUnique({
      where: { id: args.reservationId },
      select: { guest_name: true, checkin_date: true, checkout_date: true, total_amount: true, category_id: true, room_id: true },
    });
    let incomingCategoryId = "";
    if (args.roomTypeId && args.ratePlanId) {
      const detail = await this.singlePricing(args.channelId, args.roomTypeId, args.ratePlanId);
      incomingCategoryId = ensureString(detail?.category_id);
    }
    if (!incomingCategoryId && args.roomTypeId) {
      const roomOnly = await this.prisma.channel_pricing.findFirst({
        where: { ota_channel_id: args.channelId, channel_room_code: args.roomTypeId },
        select: { category_id: true },
      });
      incomingCategoryId = ensureString(roomOnly?.category_id);
    }
    const changes: AnyObj[] = [];
    const prevGuest = ensureString(previous?.guest_name);
    if (args.guestName && prevGuest !== args.guestName) changes.push({ field: "guest_name", before: prevGuest || "-", after: args.guestName });
    const prevCheckin = dateOnlyString(previous?.checkin_date);
    const prevCheckout = dateOnlyString(previous?.checkout_date);
    if (args.arrivalDate && prevCheckin !== args.arrivalDate) changes.push({ field: "checkin_date", before: prevCheckin || "-", after: args.arrivalDate });
    if (args.departureDate && prevCheckout !== args.departureDate) changes.push({ field: "checkout_date", before: prevCheckout || "-", after: args.departureDate });
    const prevAmount = numberOf(previous?.total_amount ?? 0);
    if (Number.isFinite(prevAmount) && Number.isFinite(args.amount) && Math.abs(prevAmount - args.amount) > 0.009) {
      changes.push({ field: "total_amount", before: prevAmount, after: args.amount });
    }
    const prevCategoryId = ensureString(previous?.category_id);
    if (incomingCategoryId && prevCategoryId !== incomingCategoryId) {
      const categoryIds = [prevCategoryId, incomingCategoryId].filter(Boolean);
      const categories = await this.prisma.room_categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } });
      const names = new Map(categories.map((category) => [category.id, ensureString(category.name) || category.id]));
      changes.push({
        field: "category",
        before: prevCategoryId ? names.get(prevCategoryId) ?? prevCategoryId : "-",
        after: names.get(incomingCategoryId) ?? incomingCategoryId,
        before_id: prevCategoryId,
        after_id: incomingCategoryId,
      });
    }
    return changes;
  }

  private async categoryMapping(channelId: string, roomTypeId: string, ratePlanId: string): Promise<{ categoryId: string; pricingPlanId: string }> {
    const mapping = await this.singlePricing(channelId, roomTypeId, ratePlanId);
    return { categoryId: ensureString(mapping?.category_id), pricingPlanId: ensureString(mapping?.pricing_plan_id) };
  }

  private async singlePricing(channelId: string, roomTypeId: string, ratePlanId: string) {
    const rows = await this.prisma.channel_pricing.findMany({
      where: { ota_channel_id: channelId, channel_room_code: roomTypeId, channel_rate_plan_code: ratePlanId },
      select: { category_id: true, pricing_plan_id: true },
      take: 2,
    });
    return rows.length === 1 ? rows[0] : null;
  }

  private async latestLinkedReservationId(channelId: string, bookingId: string, uniqueId: string): Promise<string> {
    if (isUuid(bookingId)) {
      try {
        const byBook = await this.prisma.channex_booking_revisions.findFirst({
          where: { ota_channel_id: channelId, booking_id: bookingId, reservation_id: { not: null } },
          orderBy: { updated_at: "desc" },
          select: { reservation_id: true },
        });
        const id = ensureString(byBook?.reservation_id);
        if (id) return id;
      } catch (error) {
        this.logger.warn(`latest reservation by booking: ${error instanceof Error ? error.message : "erro"}`);
      }
    }
    if (uniqueId) {
      try {
        const byUnique = await this.prisma.channex_booking_revisions.findFirst({
          where: { ota_channel_id: channelId, unique_id: uniqueId, reservation_id: { not: null } },
          orderBy: { updated_at: "desc" },
          select: { reservation_id: true },
        });
        return ensureString(byUnique?.reservation_id);
      } catch (error) {
        this.logger.warn(`latest reservation by unique: ${error instanceof Error ? error.message : "erro"}`);
      }
    }
    return "";
  }

  private async findReservationByNotes(establishmentId: string, rawNeedles: string[], statuses: reservation_status[], newestFirst: boolean): Promise<string> {
    const needles = rawNeedles.map((needle) => ensureString(needle).replace(/[^a-zA-Z0-9-]/g, "").trim()).filter((token) => token.length >= 8);
    for (const token of needles) {
      const hits = await this.prisma.reservations.findMany({
        where: { establishment_id: establishmentId, notes: { contains: token, mode: "insensitive" }, status: { in: statuses } },
        select: { id: true },
        orderBy: newestFirst ? { created_at: "desc" } : undefined,
        take: 2,
      });
      if (hits.length === 1 && hits[0]) return hits[0].id;
    }
    return "";
  }

  private async findLocalCancelledReservation(establishmentId: string, channelId: string, uniqueId: string, bookingId: string): Promise<string | null> {
    const ota = await this.findOtaReservation(channelId, uniqueId, bookingId);
    const rid = ensureString(ota?.reservation_id);
    if (rid) {
      const reservation = await this.prisma.reservations.findUnique({ where: { id: rid }, select: { status: true } });
      if (ensureString(reservation?.status).toLowerCase() === "cancelled") return rid;
    }
    const byNotes = await this.findReservationByNotes(establishmentId, [uniqueId, bookingId], [reservation_status.cancelled], false);
    return byNotes || null;
  }

  private async findOtaReservation(channelId: string, uniqueId: string, bookingId: string): Promise<OtaRow | null> {
    const codes = otaReservationLookupCodes(uniqueId, bookingId);
    if (codes.length === 0) return null;
    try {
      const rows = await this.prisma.ota_reservations.findMany({
        where: { ota_channel_id: channelId, ota_reservation_code: { in: codes } },
        select: { id: true, reservation_id: true },
        take: 20,
      });
      return rows.find((row) => ensureString(row.reservation_id)) ?? rows[0] ?? null;
    } catch (error) {
      this.logger.warn(`findOtaReservationForChannel: ${error instanceof Error ? error.message : "erro"}`);
      return null;
    }
  }

  private async updateOtaRow(
    channelId: string,
    uniqueId: string,
    bookingId: string,
    existingOta: { id: string } | null,
    patch: Prisma.ota_reservationsUncheckedUpdateManyInput,
  ): Promise<void> {
    try {
      if (existingOta?.id) {
        await this.prisma.ota_reservations.updateMany({ where: { ota_channel_id: channelId, id: existingOta.id }, data: patch });
        return;
      }
      const codes = otaReservationLookupCodes(uniqueId, bookingId);
      if (codes.length === 0) {
        this.logger.warn("updateOtaReservationsRow: sem códigos OTA");
        return;
      }
      await this.prisma.ota_reservations.updateMany({
        where: { ota_channel_id: channelId, ota_reservation_code: codes.length > 1 ? { in: codes } : codes[0] },
        data: patch,
      });
    } catch (error) {
      this.logger.warn(`updateOtaReservationsRow: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  private async upsertRevision(args: {
    channelId: string;
    establishmentId: string;
    revisionId: string;
    bookingId: string;
    uniqueId: string;
    systemId: string | null;
    status: string;
    payload: AnyObj;
    reservationId: string | null;
    processStatus: string;
    errorMessage: string | null;
    setReservationId: boolean;
  }): Promise<void> {
    const bookingId = isUuid(args.bookingId) ? args.bookingId : null;
    const data = {
      booking_id: bookingId,
      unique_id: args.uniqueId || null,
      system_id: args.systemId,
      status: args.status,
      payload: asJson(args.payload),
      process_status: args.processStatus,
      processed_at: new Date(),
      error_message: args.errorMessage,
      updated_at: new Date(),
      ...(args.setReservationId ? { reservation_id: args.reservationId } : {}),
    };
    await this.prisma.channex_booking_revisions.upsert({
      where: { ota_channel_id_revision_id: { ota_channel_id: args.channelId, revision_id: args.revisionId } },
      create: { ota_channel_id: args.channelId, establishment_id: args.establishmentId, revision_id: args.revisionId, ...data },
      update: data,
    });
  }

  private async supersede(channelId: string, revisionId: string, bookingId: string, uniqueId: string, message: string, onlyModified: boolean): Promise<void> {
    const data = { process_status: "processed", error_message: message, updated_at: new Date() };
    if (isUuid(bookingId)) {
      await this.prisma.channex_booking_revisions.updateMany({
        where: {
          ota_channel_id: channelId,
          booking_id: bookingId,
          ...(onlyModified ? { status: "modified" } : {}),
          process_status: { in: ["pending", "failed"] },
          revision_id: { not: revisionId },
        },
        data,
      });
    }
    if (uniqueId) {
      await this.prisma.channex_booking_revisions.updateMany({
        where: {
          ota_channel_id: channelId,
          unique_id: uniqueId,
          ...(onlyModified ? { status: "modified" } : {}),
          process_status: { in: ["pending", "failed"] },
          revision_id: { not: revisionId },
        },
        data,
      });
    }
  }

  private async enqueueAck(channelId: string, establishmentId: string, revisionId: string): Promise<void> {
    if (!isUuid(revisionId)) return;
    const now = new Date();
    await this.prisma.channex_ack_queue.upsert({
      where: { ota_channel_id_revision_id: { ota_channel_id: channelId, revision_id: revisionId } },
      create: { ota_channel_id: channelId, establishment_id: establishmentId, revision_id: revisionId, status: "pending", next_attempt_at: now, updated_at: now },
      update: { establishment_id: establishmentId, status: "pending", next_attempt_at: now, updated_at: now },
    });
  }

  private async runAck(channelId: string, establishmentId: string): Promise<void> {
    try {
      await this.channexOta.ack(this.serviceAuthorization(), { channel_id: channelId, establishment_id: establishmentId });
    } catch {
      // fila permanece pendente
    }
  }

  private async findChannexChannelByPropertyId(propertyRaw: string): Promise<{ row: ChannelRow | null; matchValues: string[] }> {
    const matchValues = channexPropertyIdForQuery(propertyRaw);
    if (matchValues.length === 0) return { row: null, matchValues: [] };
    try {
      const rows = await this.prisma.ota_channels.findMany({
        where: { channel_manager_type: "channex", channex_property_id: { in: matchValues } },
        take: 2,
      });
      if (rows[0]?.id) return { row: rows[0], matchValues };
    } catch (error) {
      this.logger.warn(`channex-reservation-webhook find channel by property_id: ${error instanceof Error ? error.message : "erro"}`);
    }
    for (const value of matchValues) {
      try {
        const one = await this.prisma.ota_channels.findFirst({ where: { channel_manager_type: "channex", channex_property_id: value } });
        if (one) return { row: one, matchValues };
      } catch (error) {
        this.logger.warn(`channex-reservation-webhook find channel eq fallback: ${error instanceof Error ? error.message : "erro"}`);
      }
    }
    return { row: null, matchValues };
  }

  private async resolveCancelledRevision(
    channel: ChannelRow,
    propertyId: string,
    webhookTimestampMs: number | null,
  ): Promise<{ revisionId: string; bookingId: string | null; uniqueId: string | null } | null> {
    const apiKey = ensureString(channel.channex_api_key);
    const baseUrl = ensureString(channel.channex_base_url || "https://staging.channex.io");
    const chProp = ensureString(channel.channex_property_id || propertyId);
    if (!apiKey || !chProp) return null;
    return resolveCancelledRevisionFromChannexApi(baseUrl, apiKey, chProp, webhookTimestampMs);
  }

  private async insertLog(args: {
    otaChannelId: string;
    establishmentId: string;
    direction: string;
    status: string;
    endpoint?: string | null;
    httpStatus?: number | null;
    message?: string | null;
    request?: unknown;
    response?: unknown;
  }): Promise<void> {
    if (!args.establishmentId) throw new Error("establishment_id é obrigatório em channex_sync_logs");
    await this.prisma.channex_sync_logs.create({
      data: {
        ota_channel_id: args.otaChannelId,
        establishment_id: args.establishmentId,
        direction: args.direction,
        status: args.status,
        endpoint: args.endpoint ?? null,
        http_status: args.httpStatus ?? null,
        message: args.message ?? null,
        ...(args.request !== undefined ? { request_payload: asJson(args.request) } : {}),
        ...(args.response !== undefined ? { response_payload: asJson(args.response) } : {}),
      },
    });
  }

  private serviceAuthorization(): string | undefined {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const internal = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    const token = serviceRole || internal;
    return token ? `Bearer ${token}` : undefined;
  }

  private internal(authorization: string | undefined): boolean {
    const bearer = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return false;
    const internal = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return (internal.length > 0 && bearer === internal) || (serviceRole.length > 0 && bearer === serviceRole);
  }
}

type ChannelRow = {
  id: string;
  establishment_id: string | null;
  channex_api_key: string | null;
  channex_base_url: string | null;
  channex_property_id: string | null;
  channex_use_webhook: boolean | null;
  channex_webhook_verify_user_api_key: boolean | null;
};

type ProcessingMeta = {
  used_category_mapping_fallback: boolean;
  fallback_reservation_id: string | null;
  modification_details: AnyObj[];
};

type Counters = {
  processed: number;
  created: number;
  modified: number;
  cancelled: number;
  failed: number;
  skippedMissingIds: number;
  skippedBySourceEvent: number;
  skippedAlreadyProcessed: number;
};

type StayInput = {
  channelId: string;
  establishmentId: string;
  revisionId: string;
  bookingId: string;
  uniqueId: string;
  guestName: string;
  email: string | null;
  phone: string | null;
  clientId: string;
  arrivalDate: string;
  departureDate: string;
  amount: number;
  paidByOta: boolean;
  shouldApplyAutoPayment: boolean;
  adults: number;
  children: number;
  notesSuffix: string;
  childAgeLine: string;
  channexNotes: string[];
  otaName: string;
  detectedOverbooking: boolean;
  categoryId: string;
  mappedPlanId: string | null;
  existingOta: { id: string } | null;
  roomTypeId: string;
  ratePlanId: string;
};

function emptyCounters(): Counters {
  return { processed: 0, created: 0, modified: 0, cancelled: 0, failed: 0, skippedMissingIds: 0, skippedBySourceEvent: 0, skippedAlreadyProcessed: 0 };
}

function ok(body: Record<string, unknown>): Result {
  return { status: 200, body };
}

function fail(status: number, error: string): Result {
  return { status, body: { success: false, error } };
}

function ensureString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberOf(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asObject(value: unknown): AnyObj | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyObj;
  return null;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
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
  if (!raw || !(raw.startsWith("{") || raw.startsWith("["))) return value;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return value;
  }
}

function normalizeEvent(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function nestedPickString(root: AnyObj | null | undefined, path: string): string | null {
  const value = nestedValue(root, path);
  const text = String(value ?? "").trim();
  return text || null;
}

function nestedValue(obj: AnyObj | null | undefined, path: string): unknown {
  if (!obj) return undefined;
  let cursor: unknown = obj;
  for (const part of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as AnyObj)[part];
  }
  return cursor;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function deepFindStringByKeys(input: unknown, possibleKeys: string[], maxDepth = 3): string | null {
  const targets = new Set(possibleKeys.map((key) => normalizeKey(key)));
  const queue: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth || current.value == null) continue;
    if (visited.has(current.value)) continue;
    if (typeof current.value === "object") visited.add(current.value);
    if (typeof current.value === "string") {
      const maybeObj = parseIfJsonString(current.value);
      if (maybeObj !== current.value) queue.push({ value: maybeObj, depth: current.depth + 1 });
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const item of current.value) queue.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (typeof current.value === "object") {
      for (const [key, value] of Object.entries(current.value as AnyObj)) {
        if (targets.has(normalizeKey(key))) {
          const text = String(value ?? "").trim();
          if (text) return text;
        }
        queue.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function incomingUserApiKey(headers: Record<string, string | undefined>): string {
  const entries = Object.entries(headers);
  for (const name of ["user-api-key", "x-user-api-key"]) {
    const found = entries.find(([key]) => key.toLowerCase() === name);
    if (found) return String(found[1] ?? "").trim();
  }
  return "";
}

function toCanonicalUuidLoose(raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase().replace(/^urn:uuid:/i, "");
  if (!text) return null;
  const hex = text.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function channexPropertyIdForQuery(raw: string): string[] {
  const canon = toCanonicalUuidLoose(raw);
  if (canon) return [canon];
  const trimmed = raw.trim();
  return trimmed ? [trimmed] : [];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseIsoMs(value: unknown): number | null {
  const raw = ensureString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function parseDateOnly(value: unknown): Date | null {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : ensureString(value).slice(0, 10);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnlyString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return ensureString(value).slice(0, 10);
}

function daysBetweenUtc(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function parseDaysFromText(raw: unknown): number | null {
  const text = ensureString(raw).toLowerCase();
  if (!text) return null;
  const match = text.match(/(\d+)\s*dias?/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeRevisionStatus(raw: unknown): RevisionKind | "" {
  const text = ensureString(raw).toLowerCase();
  if (!text) return "";
  if (text === "new" || text === "booked" || text === "created") return "new";
  if (text === "modified" || text === "modify" || text === "updated" || text === "update") return "modified";
  if (text === "cancelled" || text === "canceled" || text === "cancel") return "cancelled";
  return "";
}

function isRoomCancelled(room: AnyObj): boolean {
  const value = room.is_cancelled;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  if (typeof value === "number") return value === 1;
  return false;
}

function deriveRevisionStatus(attrs: AnyObj, hasExistingReservation: boolean): RevisionKind {
  const direct = normalizeRevisionStatus(attrs.status);
  if (direct) return direct;
  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  if (rooms.length > 0 && rooms.every((room) => isRoomCancelled(asObject(room) ?? {}))) return "cancelled";
  return hasExistingReservation ? "modified" : "new";
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = renderEmailTemplate(template || "", vars);
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "gi"), value ?? "");
  }
  return out;
}

function overlapReservationStayDates(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(bStart).getTime() < new Date(aEnd).getTime() && new Date(bEnd).getTime() > new Date(aStart).getTime();
}

function parseOtaLinkRpcResult(data: unknown): { success: boolean; reservation_id?: string; kind?: string; error?: string } {
  if (data == null) return { success: false, error: "empty" };
  let row: Record<string, unknown>;
  if (typeof data === "string") {
    try {
      row = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return { success: false, error: "invalid_json" };
    }
  } else {
    row = data as Record<string, unknown>;
  }
  if (!row || typeof row !== "object") return { success: false, error: "invalid" };
  return {
    success: Boolean(row.success),
    reservation_id: row.reservation_id != null ? String(row.reservation_id) : undefined,
    kind: row.kind != null ? String(row.kind) : undefined,
    error: row.error != null ? String(row.error) : undefined,
  };
}

function normalizePartnerKey(raw: string | null | undefined): string {
  return String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isKnownOtaPartner(key: string): boolean {
  return ["booking", "bookingcom", "airbnb", "expedia", "decolar", "despegar", "hoteiscom", "hotelbeds", "tripcom", "agoda", "hostelworld"].includes(key);
}

function partnerAllowed(allowedRaw: unknown, partnerName: string | null | undefined): boolean {
  const allowed = Array.isArray(allowedRaw) ? allowedRaw.map((value) => normalizePartnerKey(String(value))).filter(Boolean) : [];
  if (allowed.length === 0) return true;
  const partnerKey = normalizePartnerKey(partnerName ?? "");
  const allowsOthers = allowed.includes("outros") || allowed.includes("others");
  return (!!partnerKey && allowed.includes(partnerKey)) || (allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey));
}

function pickEmailTemplateForEstablishment(allTemplates: AnyObj[] | null, establishmentId: string): AnyObj | null {
  if (!allTemplates?.length) return null;
  for (const template of allTemplates) {
    const establishmentIds = template.establishment_ids;
    if (establishmentIds === null || establishmentIds === undefined) return template;
    if (Array.isArray(establishmentIds) && establishmentIds.length === 0) continue;
    if (Array.isArray(establishmentIds) && establishmentIds.includes(establishmentId)) return template;
    try {
      const parsed = typeof establishmentIds === "string" ? JSON.parse(establishmentIds) : establishmentIds;
      if (Array.isArray(parsed) && parsed.includes(establishmentId)) return template;
    } catch {
      return template;
    }
  }
  return null;
}

function isAvailabilityErrorMessage(raw: unknown): boolean {
  const msg = ensureString(raw).toLowerCase();
  if (!msg) return false;
  return msg.includes("nenhum quarto disponível") || msg.includes("quarto não está disponível") || msg.includes("nao está disponível") || msg.includes("não está disponível") || msg.includes("available_rooms");
}

function isTruthyLike(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const text = ensureString(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "y";
}

function hasNegativeModifierSignal(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasNegativeModifierSignal(item));
  const obj = value as Record<string, unknown>;
  const modifier = Number(obj.modifier);
  if (Number.isFinite(modifier) && modifier < 0) return true;
  return Object.values(obj).some((nested) => hasNegativeModifierSignal(nested));
}

function detectChannexOverbooking(attrs: AnyObj, sourceEvent: string): boolean {
  if (sourceEvent === "booking_unmapped_room" || sourceEvent === "booking_unmapped_rate") return true;
  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  if (isTruthyLike(attrs.overbooking) || isTruthyLike(attrs.is_overbooking) || isTruthyLike(attrs.overbooked) || isTruthyLike(attrs.overbook)) return true;
  if (rooms.some((room) => isTruthyLike(room.overbooking) || isTruthyLike(room.is_overbooking) || isTruthyLike(room.overbooked))) return true;
  const statusHint = ensureString(attrs.availability_status || attrs.booking_status || attrs.type || attrs.inventory_status || attrs.availability).toLowerCase();
  if (["overbook", "unavailable", "no_availability", "soldout", "sold_out"].some((hint) => statusHint.includes(hint))) return true;
  return hasNegativeModifierSignal(attrs.values) || hasNegativeModifierSignal(attrs.availability_changes);
}

function isPmsOverbookingRelocationRevision(attrs: AnyObj): boolean {
  const bookingMeta = asObject(attrs.meta) ?? {};
  if (bookingMeta.pms_overbooking_reallocation === true) return true;
  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  return rooms.some((room) => (asObject(asObject(room)?.meta) ?? {}).pms_overbooking_reallocation === true);
}

function extractOccupancyInfo(attrs: AnyObj, firstRoom: AnyObj): { adults: number; children: number; ages: number[] } {
  const occ = asObject(attrs.occupancy) ?? asObject(firstRoom.occupancy) ?? {};
  const adultsRaw = Number(occ.adults ?? 2);
  const childrenRaw = Number(occ.children ?? 0);
  const ages = Array.isArray(occ.ages) ? occ.ages.map((value) => Number(value)).filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.floor(n)) : [];
  return {
    adults: Number.isFinite(adultsRaw) && adultsRaw >= 0 ? Math.floor(adultsRaw) : 2,
    children: Number.isFinite(childrenRaw) && childrenRaw >= 0 ? Math.floor(childrenRaw) : 0,
    ages,
  };
}

function extractChannexNotes(attrs: AnyObj, firstRoom: AnyObj): string[] {
  return [attrs.notes, attrs.note, attrs.comments, attrs.comment, attrs.remarks, attrs.message, firstRoom.notes, firstRoom.comment, firstRoom.remarks]
    .map((value) => ensureString(value))
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function mergeReservationNotes(existing: unknown, managedLines: string[]): string {
  const rawExisting = ensureString(existing);
  const startMarker = "[CHANNEX_SYNC]";
  const endMarker = "[/CHANNEX_SYNC]";
  const normalizedManagedLines = managedLines.filter(Boolean);
  const managedBlock = normalizedManagedLines.join("\n");
  if (!rawExisting) return managedBlock;
  const start = rawExisting.indexOf(startMarker);
  const end = rawExisting.indexOf(endMarker);
  if (start >= 0 && end > start) {
    const before = rawExisting.slice(0, start).trim();
    const after = rawExisting.slice(end + endMarker.length).trim();
    return [before, managedBlock, after].filter(Boolean).join("\n\n");
  }
  const existingLines = rawExisting.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !normalizedManagedLines.includes(line));
  return [...existingLines, ...normalizedManagedLines].filter(Boolean).join("\n");
}

function isTransientChannexHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseFeedList(feedData: unknown): AnyObj[] {
  const root = asObject(feedData) ?? {};
  if (Array.isArray(root.data)) return root.data as AnyObj[];
  if (root.data && typeof root.data === "object") return [root.data as AnyObj];
  return [];
}

function otaReservationLookupCodes(uniqueId: string, bookingId: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    out.push(trimmed);
    const low = trimmed.toLowerCase();
    if (low !== trimmed) out.push(low);
  };
  push(ensureString(uniqueId));
  push(ensureString(bookingId));
  const match = ensureString(uniqueId).match(/^([A-Za-z]{2,10})-(.+)$/);
  if (match?.[2]) push(match[2].trim());
  const seen = new Set<string>();
  return out.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function channexWebhookSummaryMatchesItem(
  summary: AnyObj,
  ctx: { revisionId: string; bookingId: string; uniqueId: string; revisionFilter: string; bookingIdFilter: string; bookingUniqueIdFilter: string },
): boolean {
  const wsRev = ensureString(summary.booking_revision_id ?? summary.revision_id);
  const wsBook = ensureString(summary.booking_id);
  const wsUnique = ensureString(summary.booking_unique_id ?? summary.unique_id);
  if (ctx.revisionFilter && wsRev && wsRev === ctx.revisionFilter) return true;
  if (ctx.bookingIdFilter && wsBook && wsBook === ctx.bookingIdFilter) return true;
  if (ctx.bookingUniqueIdFilter && wsUnique && wsUnique === ctx.bookingUniqueIdFilter) return true;
  if (wsRev && wsRev === ctx.revisionId) return true;
  if (wsBook && wsBook === ctx.bookingId) return true;
  if (wsUnique && wsUnique === ctx.uniqueId) return true;
  return false;
}

function mergeChannexWebhookSummaryIntoAttrs(attrs: AnyObj, summary: AnyObj): AnyObj {
  const out = { ...attrs };
  const customer = ensureString(summary.customer_name);
  if (customer) out.customer_name = customer;
  const arrival = ensureString(summary.arrival_date);
  if (arrival) out.arrival_date = arrival;
  const departure = ensureString(summary.departure_date);
  if (departure) out.departure_date = departure;
  if (summary.amount != null && String(summary.amount).trim() !== "") {
    const amount = Number(summary.amount);
    if (!Number.isNaN(amount)) out.amount = amount;
  }
  const currency = ensureString(summary.currency);
  if (currency) out.currency = currency;
  return out;
}

function filterRevisionsByRecentWindow(entries: AnyObj[], recentWindowSeconds: number, sourceEvent: string): AnyObj[] {
  const minMs = Date.now() - recentWindowSeconds * 1000;
  return entries.filter((entry) => {
    const attrs = asObject(entry.attributes) ?? {};
    const insertedAtMs = parseIsoMs(attrs.inserted_at) ?? parseIsoMs(entry.inserted_at) ?? parseIsoMs(attrs.created_at) ?? parseIsoMs(entry.created_at);
    if (insertedAtMs == null) return sourceEvent === "booking_cancellation";
    return insertedAtMs >= minMs;
  });
}

function payloadDebug(rawPayload: unknown, payload: AnyObj, payloadData: AnyObj | null): AnyObj {
  return {
    payload_type: Array.isArray(rawPayload) ? "array" : typeof rawPayload,
    payload_root_keys: Object.keys(payload),
    payload_data_type: payloadData === null ? "null" : typeof payloadData,
    parsed_data_keys: payloadData ? Object.keys(payloadData) : [],
  };
}

function processedCount(body: unknown): number {
  const record = asObject(body);
  return Number(record?.processed ?? 0);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChannex(baseUrl: string, apiKey: string, path: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: { "Content-Type": "application/json", "user-api-key": apiKey },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function normalizeRevisionStatusForCancel(raw: unknown): boolean {
  const text = ensureString(raw).trim().toLowerCase();
  return text === "cancelled" || text === "canceled" || text === "cancel";
}

function extractRevisionEntryIds(entry: AnyObj): { revisionId: string; bookingId: string | null; uniqueId: string | null } {
  const attrs = asObject(entry.attributes) ?? {};
  return {
    revisionId: ensureString(attrs.id ?? attrs.revision_id ?? entry.id),
    bookingId: pickString(attrs.booking_id, attrs.bookingId, nestedPickString(entry, "relationships.booking.data.id")),
    uniqueId: pickString(attrs.unique_id, attrs.ota_reservation_code, attrs.booking_unique_id),
  };
}

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
    const response = await fetch(`${root}${path}`, { headers: { Accept: "application/json", "user-api-key": apiKey } });
    if (!response.ok) continue;
    const data = (await response.json().catch(() => ({}))) as AnyObj;
    const arr = Array.isArray(data.data) ? (data.data as AnyObj[]) : [];
    const candidates: { entry: AnyObj; insertedMs: number }[] = [];
    for (const entry of arr) {
      const attrs = asObject(entry.attributes) ?? {};
      if (!normalizeRevisionStatusForCancel(attrs.status ?? attrs.revision_status)) continue;
      const rid = ensureString(attrs.id ?? attrs.revision_id ?? entry.id);
      if (!rid) continue;
      const insertedMs = parseIsoMs(attrs.inserted_at) ?? parseIsoMs(entry.inserted_at) ?? parseIsoMs(attrs.created_at) ?? 0;
      candidates.push({ entry, insertedMs });
    }
    if (candidates.length === 0) continue;
    let winner: AnyObj;
    if (webhookTimestampMs != null) {
      const near = candidates.filter((candidate) => candidate.insertedMs > 0 && Math.abs(candidate.insertedMs - webhookTimestampMs) <= 12 * 60 * 1000);
      if (near.length > 0) {
        near.sort((a, b) => Math.abs(a.insertedMs - webhookTimestampMs) - Math.abs(b.insertedMs - webhookTimestampMs));
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
