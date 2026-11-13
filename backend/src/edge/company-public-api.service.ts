import { createHash, randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type ApiResult = { status: number; body: unknown };
type Query = Record<string, string | undefined>;
type HeaderMap = Map<string, string>;

const DATE_ONLY = new Set(["checkin_date", "checkout_date", "birth_date"]);
const TIME_ONLY = new Set(["checkin_time", "checkout_time"]);

const RESERVATION_LIST_SELECT = {
  id: true,
  reservation_code: true,
  checkin_date: true,
  checkout_date: true,
  adults: true,
  children: true,
  status: true,
  payment_status: true,
  total_amount: true,
  paid_amount: true,
  notes: true,
  channel: true,
  created_at: true,
  updated_at: true,
  room_id: true,
  category_id: true,
  client_id: true,
  guest_id: true,
} satisfies Prisma.reservationsSelect;

const RESERVATION_DETAIL_SELECT = {
  id: true,
  reservation_code: true,
  establishment_id: true,
  checkin_date: true,
  checkout_date: true,
  checkin_time: true,
  checkout_time: true,
  adults: true,
  children: true,
  status: true,
  payment_status: true,
  total_amount: true,
  paid_amount: true,
  notes: true,
  channel: true,
  pricing_plan_id: true,
  category_id: true,
  room_id: true,
  client_id: true,
  guest_id: true,
  guest_name: true,
  identification_number: true,
  expiration_date: true,
  coupon_id: true,
  pending_resolved_at: true,
  pending_resolved_by: true,
  cancelled_at: true,
  cancelled_by: true,
  cancellation_penalty: true,
  cancellation_policy_applied: true,
  cancellation_reason: true,
  cancellation_calculation_details: true,
  no_show_at: true,
  created_by: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.reservationsSelect;

const CLIENT_SELECT = {
  id: true,
  full_name: true,
  email: true,
  phone: true,
  document_type: true,
  document_number: true,
  birth_date: true,
  nationality: true,
  address: true,
  city: true,
  state: true,
  postal_code: true,
  country: true,
} satisfies Prisma.clientsSelect;

const SUPPORTED_ACTIONS = [
  "me",
  "establishments",
  "list-reservations",
  "create-reservation",
  "get-reservation-by-id",
  "web-checkin",
  "room-clean-status",
  "list-maintenance",
  "list-clients",
  "occupancy-map",
  "list-stay-reviews",
  "stay-review-link",
];

@Injectable()
export class CompanyPublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  async run(input: {
    method: string;
    action: string | undefined;
    query: Query;
    body: unknown;
    headers: Record<string, string | undefined>;
  }): Promise<ApiResult> {
    const method = String(input.method || "").toUpperCase();
    const query = input.query ?? {};
    const headers = headerMap(input.headers);
    const action = (input.action || query.action || "me").trim().toLowerCase();
    const ip = clientIp(headers);

    if (method === "OPTIONS") return { status: 200, body: "ok" };
    if (method !== "GET" && method !== "POST") {
      return { status: 405, body: { success: false, error: "Method not allowed" } };
    }

    const respond = async (
      companyId: string | null,
      status: number,
      body: Record<string, unknown>,
      logAction: string | null = action,
    ): Promise<ApiResult> => {
      if (companyId) await this.logRequest(companyId, method, logAction, status, body, ip);
      return { status, body };
    };

    const clientId = headerGet(headers, ["ClientId", "clientid", "X-Client-Id", "x-client-id"]);
    const clientSecret = headerGet(headers, ["ClientSecret", "clientsecret", "X-Client-Secret", "x-client-secret"]);
    if (!clientId || !clientSecret) {
      return respond(null, 401, {
        success: false,
        error: "Credenciais ausentes. Envie ClientId e ClientSecret nos headers.",
      });
    }

    const cred = await this.findCredentials(clientId);
    if (!cred) return respond(null, 401, { success: false, error: "Credenciais inválidas" });

    const companyId = String(cred.company_id);
    if (cred.is_active !== true) return respond(companyId, 401, { success: false, error: "Credenciais inválidas" });

    const incomingHash = sha256Hex(clientSecret);
    if (!constantTimeEqual(incomingHash, String(cred.client_secret_hash ?? ""))) {
      return respond(companyId, 401, { success: false, error: "Credenciais inválidas" });
    }

    const featureEnabled = await this.companyHasFeature(companyId, "api_integrations");
    if (featureEnabled !== true) {
      return respond(companyId, 403, {
        success: false,
        error: "Funcionalidade api_integrations desativada para esta empresa",
      });
    }

    try {
      await this.prisma.company_api_credentials.update({
        where: { company_id: companyId },
        data: { last_used_at: new Date() },
      });
    } catch (error) {
      console.error("company_api_credentials last_used_at", error instanceof Error ? error.message : "update failed");
    }

    const userAgent = headerGet(headers, ["user-agent"]);

    if (action === "list-reservations") return this.listReservations(companyId, query, respond);
    if (action === "create-reservation") return this.createReservation(companyId, query, input.body, respond);
    if (action === "get-reservation-by-id") return this.getReservationById(companyId, method, query, input.body, respond);
    if (action === "web-checkin") return this.webCheckin(companyId, input.body, ip, userAgent, respond);
    if (action === "room-clean-status") return this.roomCleanStatus(companyId, query, respond);
    if (action === "list-maintenance") return this.listMaintenance(companyId, query, respond);
    if (action === "list-clients") return this.listClients(companyId, query, respond);
    if (action === "occupancy-map") return this.occupancyMap(companyId, method, query, input.body, respond);
    if (action === "list-stay-reviews") return this.listStayReviews(companyId, query, respond);
    if (action === "stay-review-link") return this.stayReviewLink(companyId, method, query, input.body, respond);
    if (action === "me" || action === "establishments") return this.companyProfile(companyId, action, respond);

    return respond(companyId, 400, {
      success: false,
      error: `Ação não suportada: ${action}`,
      supported_actions: SUPPORTED_ACTIONS,
    });
  }

  private async listReservations(
    companyId: string,
    query: Query,
    respond: Respond,
  ): Promise<ApiResult> {
    const paging = pageParams(query, 20);
    let establishmentId = text(query.establishment_id);
    if (!establishmentId) establishmentId = await this.firstActiveEstablishment(companyId);
    if (!establishmentId) {
      return respond(companyId, 400, { success: false, error: "Nenhum estabelecimento ativo encontrado para esta empresa." });
    }
    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) {
      return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });
    }

    const bookingId = text(query.booking_id);
    const where: Prisma.reservationsWhereInput = { establishment_id: establishmentId };
    const and: Prisma.reservationsWhereInput[] = [];
    if (bookingId) {
      if (!isUuid(bookingId)) {
        console.error("list-reservations failed", "booking_id is not a uuid");
        return respond(companyId, 500, { success: false, error: "Erro ao listar reservas" });
      }
      and.push({ OR: [{ id: bookingId }, { reservation_code: bookingId }] });
    }
    const statusFilter = text(query.status);
    if (statusFilter) {
      if (!isReservationStatus(statusFilter)) {
        console.error("list-reservations failed", "invalid status");
        return respond(companyId, 500, { success: false, error: "Erro ao listar reservas" });
      }
      and.push({ status: statusFilter });
    }
    const checkin = text(query.checkin);
    if (checkin) {
      const parsed = parseInstant(`${checkin}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-reservations", respond);
      and.push({ checkin_date: { gte: parsed } });
    }
    const checkout = text(query.checkout);
    if (checkout) {
      const parsed = parseInstant(`${checkout}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-reservations", respond);
      and.push({ checkout_date: { lte: parsed } });
    }
    const created = text(query.created);
    if (created) {
      const parsed = parseInstant(`${created}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-reservations", respond);
      and.push({ created_at: { gte: parsed } });
    }
    const periodOne = text(query.period_one);
    if (periodOne) {
      const parsed = parseInstant(`${periodOne}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-reservations", respond);
      and.push({ checkin_date: { gte: parsed } });
    }
    const periodTwo = text(query.period_two);
    if (periodTwo) {
      const parsed = parseInstant(`${periodTwo}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-reservations", respond);
      and.push({ checkout_date: { lte: parsed } });
    }
    if (and.length) where.AND = and;

    try {
      const [total, data] = await Promise.all([
        this.prisma.reservations.count({ where }),
        this.prisma.reservations.findMany({
          where,
          select: RESERVATION_LIST_SELECT,
          orderBy: { created_at: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      return respond(companyId, 200, {
        success: true,
        action: "list-reservations",
        establishment_id: establishmentId,
        current_page: paging.page,
        per_page: paging.perPage,
        total_pages: total > 0 ? Math.ceil(total / paging.perPage) : 0,
        total_bookings: total,
        bookings: jsonSafe(data),
      });
    } catch (error) {
      console.error("list-reservations failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao listar reservas" });
    }
  }

  private async createReservation(companyId: string, query: Query, rawBody: unknown, respond: Respond): Promise<ApiResult> {
    const body = parseBody(rawBody);
    const establishmentId = String(body.establishment_id || query.establishment_id || "").trim();
    const checkinDate = String(body.arrival_date || body.checkin_date || "").trim();
    const checkoutDate = String(body.departure_date || body.checkout_date || "").trim();
    const rateplanId = String(body.rateplan_id || body.pricing_plan_id || "").trim();
    const adults = Number(body.adults ?? 1);
    const children = Number(body.children ?? 0);
    const totalAmount = Number(body.total_amount ?? body.price_total ?? 0);
    const notes = String(body.comment || body.notes || "").trim() || null;
    const channel = String(body.channel || "api_public").trim() || "api_public";
    const guestRaw = body.guest && typeof body.guest === "object" ? (body.guest as Record<string, unknown>) : {};
    const roomUnits = Array.isArray(body.room_units) ? (body.room_units as Array<Record<string, unknown>>) : [];

    if (!establishmentId || !checkinDate || !checkoutDate || !rateplanId || !guestRaw.first_name) {
      return respond(companyId, 400, {
        success: false,
        error: "Parâmetros obrigatórios: establishment_id, arrival_date, departure_date, rateplan_id e guest.first_name",
      });
    }
    if (!Number.isFinite(adults) || adults < 1 || !Number.isFinite(children) || children < 0) {
      return respond(companyId, 400, { success: false, error: "adults/children inválidos" });
    }

    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });

    const pricingPlan = await this.findPricingPlan(rateplanId, establishmentId);
    if (!pricingPlan) return respond(companyId, 400, { success: false, error: "rateplan_id inválido para o estabelecimento." });

    const reservationCode = await this.generateReservationCode();
    if (!reservationCode) return respond(companyId, 500, { success: false, error: "Falha ao gerar código de reserva." });

    const guestFullName = `${String(guestRaw.first_name || "").trim()} ${String(guestRaw.last_name || "").trim()}`.trim();
    const guestEmail = String(guestRaw.email || "").trim() || null;
    const guestPhone = String(guestRaw.phone || "").trim() || null;
    const guestDocumentType = String(guestRaw.document_type || "").trim() || null;
    const guestDocument = String(guestRaw.document || "").trim() || null;

    let clientInserted: { id: string } | null = null;
    try {
      clientInserted = await this.prisma.clients.create({
        data: {
          establishment_id: establishmentId,
          full_name: guestFullName || "Hóspede API",
          email: guestEmail,
          phone: guestPhone,
          document_type: guestDocumentType,
          document_number: guestDocument,
        },
        select: { id: true, full_name: true, email: true, phone: true, document_type: true, document_number: true },
      });
    } catch (error) {
      console.error("create-reservation client insert failed", error instanceof Error ? error.message : "failed");
      clientInserted = null;
    }
    if (!clientInserted) return respond(companyId, 500, { success: false, error: "Erro ao criar hóspede da reserva." });

    const roomUnit = roomUnits[0] || {};
    const computedTotal = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : Number(roomUnit.price ?? 0);
    const checkin = parseInstant(`${checkinDate}T00:00:00.000Z`);
    const checkout = parseInstant(`${checkoutDate}T00:00:00.000Z`);
    if (!pricingPlan.category_id || !checkin || !checkout) {
      console.error("create-reservation insert failed", "missing category or dates");
      return respond(companyId, 500, { success: false, error: "Erro ao criar reserva." });
    }

    try {
      const reservationInserted = await this.prisma.reservations.create({
        data: {
          reservation_code: reservationCode,
          establishment_id: establishmentId,
          client_id: clientInserted.id,
          guest_id: clientInserted.id,
          category_id: pricingPlan.category_id,
          pricing_plan_id: pricingPlan.id,
          checkin_date: checkin,
          checkout_date: checkout,
          adults,
          children,
          total_amount: Number.isFinite(computedTotal) ? computedTotal : 0,
          paid_amount: 0,
          notes,
          channel,
          status: "pending",
        },
        select: {
          id: true,
          reservation_code: true,
          checkin_date: true,
          checkout_date: true,
          adults: true,
          children: true,
          status: true,
          payment_status: true,
          total_amount: true,
          paid_amount: true,
          notes: true,
          channel: true,
        },
      });
      const booking = jsonSafe(reservationInserted);
      return respond(companyId, 201, {
        success: true,
        action: "create-reservation",
        reservation_id: reservationInserted.id,
        reservation_code: reservationInserted.reservation_code,
        message: "Reserva criada com sucesso.",
        booking,
      });
    } catch (error) {
      console.error("create-reservation insert failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao criar reserva." });
    }
  }

  private async getReservationById(
    companyId: string,
    method: string,
    query: Query,
    rawBody: unknown,
    respond: Respond,
  ): Promise<ApiResult> {
    let bookingId = text(query.booking_id);
    if (!bookingId && method === "POST") {
      const body = parseBody(rawBody);
      bookingId = String(body.booking_id || "").trim();
    }
    if (!bookingId) return respond(companyId, 400, { success: false, error: "Parâmetro obrigatório ausente: booking_id" });

    const found = await this.findReservation(bookingId, RESERVATION_DETAIL_SELECT);
    if (found.error) {
      console.error("get-reservation-by-id reservation query failed", found.message ?? "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao consultar reserva" });
    }
    const reservation = found.row;
    if (!reservation || !reservation.establishment_id) {
      return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const establishment = await this.establishmentById(String(reservation.establishment_id));
    if (!establishment || String(establishment.company_id) !== companyId) {
      return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const guestClientId = reservation.guest_id || reservation.client_id;
    const [pricingPlan, category, room, responsible, guest, payments, otaReservation, serviceFees, coupon, webCheckin] = await Promise.all([
      reservation.pricing_plan_id
        ? this.optional(this.prisma.pricing_plans.findUnique({ where: { id: reservation.pricing_plan_id }, select: { id: true, name: true } }))
        : Promise.resolve(null),
      reservation.category_id
        ? this.optional(this.prisma.room_categories.findUnique({ where: { id: reservation.category_id }, select: { id: true, name: true } }))
        : Promise.resolve(null),
      reservation.room_id
        ? this.optional(this.prisma.rooms.findUnique({ where: { id: reservation.room_id }, select: { id: true, room_number: true, floor: true, status: true } }))
        : Promise.resolve(null),
      reservation.client_id
        ? this.optional(this.prisma.clients.findUnique({ where: { id: reservation.client_id }, select: CLIENT_SELECT }))
        : Promise.resolve(null),
      guestClientId
        ? this.optional(this.prisma.clients.findUnique({ where: { id: guestClientId }, select: CLIENT_SELECT }))
        : Promise.resolve(null),
      this.optional(this.prisma.payments.findMany({
        where: { reservation_id: reservation.id },
        select: { id: true, amount: true, payment_method: true, payment_date: true, notes: true },
        orderBy: { payment_date: "desc" },
      })),
      this.findSingleOta(reservation.id),
      this.optional(this.prisma.reservation_service_fees.findMany({
        where: { reservation_id: reservation.id },
        select: {
          id: true,
          amount: true,
          quantity: true,
          notes: true,
          service_fee_id: true,
          service_fees: { select: { id: true, name: true, description: true } },
        },
      })),
      reservation.coupon_id
        ? this.optional(this.prisma.discount_coupons.findUnique({
            where: { id: reservation.coupon_id },
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              discount_type: true,
              discount_value: true,
              apply_to: true,
              status: true,
              valid_from: true,
              valid_until: true,
            },
          }))
        : Promise.resolve(null),
      this.optional(this.prisma.web_checkin.findUnique({
        where: { reservation_id: reservation.id },
        select: {
          id: true,
          status: true,
          locator: true,
          started_at: true,
          completed_at: true,
          expires_at: true,
          terms_accepted: true,
          terms_accepted_at: true,
        },
      })),
    ]);

    const totalAmount = Number(reservation.total_amount ?? 0);
    const paidAmount = Number(reservation.paid_amount ?? 0);
    const otaPlain = otaReservation ? (jsonSafe(otaReservation) as Record<string, unknown>) : null;
    const fallbackGuestName = String(otaReservation?.ota_guest_name || "").trim() || null;
    const fallbackGuestEmail = String(otaReservation?.ota_guest_email || "").trim() || null;
    const fallbackGuestPhone = String(otaReservation?.ota_guest_phone || "").trim() || null;
    const otaAddrNorm = normalizeOtaGuestAddress(otaReservation?.ota_guest_address);
    const otaGuestProfile = fallbackGuestName
      ? {
          source: "ota_reservations",
          has_client_record: false,
          profile_reference: otaReservation?.id ? `ota_reservations:${String(otaReservation.id)}` : `reservation:${String(reservation.id)}`,
          full_name: fallbackGuestName,
          email: fallbackGuestEmail,
          phone: fallbackGuestPhone,
          document_type: null as string | null,
          document_number: null as string | null,
          address: otaAddrNorm,
        }
      : null;

    const guestFromClient = guest ? { ...(jsonSafe(guest) as Record<string, unknown>), source: "clients", has_client_record: true } : null;
    const guestData = guestFromClient ?? otaGuestProfile;
    const responsibleFromClient = responsible
      ? { ...(jsonSafe(responsible) as Record<string, unknown>), source: "clients", has_client_record: true }
      : null;
    const financialResponsibleData = responsibleFromClient ?? (otaGuestProfile ? { ...otaGuestProfile } : null);
    const guestDisplayName =
      (guestData && typeof guestData === "object" && "full_name" in guestData && String((guestData as { full_name?: string }).full_name || "").trim()) ||
      String(reservation.guest_name || "").trim() ||
      fallbackGuestName ||
      null;
    const plainReservation = jsonSafe(reservation) as Record<string, unknown>;
    const nights = nightsBetween(String(plainReservation.checkin_date || ""), String(plainReservation.checkout_date || ""));
    const hasClientRows = Boolean(reservation.client_id || reservation.guest_id);
    const guestProfileSource = guestFromClient
      ? "clients"
      : otaGuestProfile
        ? "ota_reservations"
        : String(reservation.guest_name || "").trim()
          ? "reservation_guest_name"
          : "unknown";
    const otaChannel = otaPlain?.ota_channels as { name?: string | null } | null | undefined;

    return respond(companyId, 200, {
      success: true,
      action: "get-reservation-by-id",
      booking: {
        ...plainReservation,
        establishment: jsonSafe(establishment),
        pricing_plan: jsonSafe(pricingPlan),
        category: jsonSafe(category),
        room: jsonSafe(room),
        financial_responsible: financialResponsibleData,
        guest: guestData,
        guest_profile: {
          source: guestProfileSource,
          has_client_record: hasClientRows,
          client_id: reservation.client_id ?? null,
          guest_id: reservation.guest_id ?? null,
          reservation_guest_name: String(reservation.guest_name || "").trim() || null,
          financial_same_as_guest:
            Boolean(otaGuestProfile && !responsibleFromClient) ||
            Boolean(reservation.client_id && reservation.guest_id && String(reservation.client_id) === String(reservation.guest_id)),
        },
        guest_display_name: guestDisplayName,
        nights,
        coupon: jsonSafe(coupon),
        service_fees: jsonSafe(serviceFees ?? []),
        web_checkin: jsonSafe(webCheckin),
        ota: otaReservation
          ? {
              ota_channel_id: otaReservation.ota_channel_id,
              ota_channel_name: otaChannel?.name ?? otaReservation.ota_source_channel_name ?? null,
              partner_channel_name: otaReservation.ota_source_channel_name ?? null,
              ota_reservation_code: otaReservation.ota_reservation_code,
              cm_booking_id: otaReservation.ota_cm_booking_id ?? null,
              segment: otaReservation.ota_segment ?? null,
              special_requests: otaReservation.ota_special_requests ?? null,
              guest_address: otaReservation.ota_guest_address ?? null,
              sync_status: otaReservation.sync_status ?? null,
              synced_at: otaPlain?.synced_at ?? null,
            }
          : null,
        payments: jsonSafe(payments ?? []),
        balance_due: Math.max(totalAmount - paidAmount, 0),
      },
    });
  }

  private async webCheckin(
    companyId: string,
    rawBody: unknown,
    ip: string | null,
    userAgent: string | null,
    respond: Respond,
  ): Promise<ApiResult> {
    const body = parseBody(rawBody);
    const bookingId = String(body.booking_id || "").trim();
    if (!bookingId) return respond(companyId, 400, { success: false, error: "Parâmetro obrigatório ausente: booking_id" });

    const found = await this.findReservation(bookingId, { id: true, reservation_code: true, establishment_id: true });
    const reservation = found.row;
    if (found.error || !reservation?.establishment_id) {
      return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }
    const establishment = await this.establishmentForCompany(companyId, String(reservation.establishment_id));
    if (!establishment) return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });

    const guestData = {
      main_guest: body.main_guest ?? null,
      companions: Array.isArray(body.companions) ? body.companions : [],
      vehicle: body.vehicle ?? null,
      notes: body.notes ?? null,
      arrival_time: body.arrival_time ?? null,
      origin_country: body.origin_country ?? null,
      transportation_mode: body.transportation_mode ?? null,
      consents: body.consents ?? null,
    };
    const documents = Array.isArray(body.attachments) ? body.attachments : [];
    const termsAccepted = Boolean((body.consents as Record<string, unknown> | null | undefined)?.accept_terms);
    const existing = await this.optional(this.prisma.web_checkin.findUnique({
      where: { reservation_id: reservation.id },
      select: { id: true },
    }));
    const now = new Date();
    const payload = {
      reservation_id: reservation.id,
      establishment_id: reservation.establishment_id,
      status: "completed",
      started_at: now,
      completed_at: new Date(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
      guest_data: toJson(guestData),
      documents: toJson(documents),
      preferences: { source: "company-public-api" },
      terms_accepted: termsAccepted,
      terms_accepted_at: termsAccepted ? new Date() : null,
      ip_address: ip,
      user_agent: userAgent,
    };

    try {
      if (existing?.id) {
        await this.prisma.web_checkin.update({ where: { id: existing.id }, data: payload });
      } else {
        await this.prisma.web_checkin.create({
          data: {
            ...payload,
            token: randomUUID(),
            locator: String(reservation.reservation_code || reservation.id),
          },
        });
      }
    } catch (error) {
      console.error("web-checkin upsert failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao processar web check-in" });
    }

    return respond(companyId, 200, {
      success: true,
      action: "web-checkin",
      booking_id: reservation.id,
      reservation_code: reservation.reservation_code,
      checkin_status: "completed",
      message: "Web check-in realizado.",
    });
  }

  private async roomCleanStatus(companyId: string, query: Query, respond: Respond): Promise<ApiResult> {
    const roomId = text(query.room_id);
    if (!roomId) return respond(companyId, 400, { success: false, error: "Parâmetro obrigatório ausente: room_id" });
    const room = await this.optional(this.prisma.rooms.findUnique({
      where: { id: roomId },
      select: { id: true, room_number: true, floor: true, status: true, establishment_id: true },
    }));
    if (!room?.establishment_id) return respond(companyId, 404, { success: false, error: "Quarto não encontrado" });
    const establishment = await this.establishmentForCompany(companyId, String(room.establishment_id));
    if (!establishment) return respond(companyId, 404, { success: false, error: "Quarto não encontrado" });
    const cleanStatus = room.status === "cleaning" || room.status === "maintenance" ? "dirty" : "clean";
    return respond(companyId, 200, {
      success: true,
      action: "room-clean-status",
      room_id: room.id,
      room_number: room.room_number,
      floor: room.floor,
      room_status: room.status,
      clean_status: cleanStatus,
    });
  }

  private async listMaintenance(companyId: string, query: Query, respond: Respond): Promise<ApiResult> {
    const paging = pageParams(query, 50);
    let establishmentId = text(query.establishment_id);
    const statusFilter = text(query.status);
    if (!establishmentId) establishmentId = await this.firstActiveEstablishment(companyId);
    if (!establishmentId) {
      return respond(companyId, 400, { success: false, error: "Nenhum estabelecimento ativo encontrado para esta empresa." });
    }
    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });
    if (statusFilter && !isMaintenanceStatus(statusFilter)) return this.listFailure(companyId, "list-maintenance", respond, "Erro ao listar manutenção");

    try {
      const where: Prisma.maintenance_ticketsWhereInput = {
        establishment_id: establishmentId,
        ...(statusFilter ? { status: statusFilter as Prisma.maintenance_ticketsWhereInput["status"] } : {}),
      };
      const [total, data] = await Promise.all([
        this.prisma.maintenance_tickets.count({ where }),
        this.prisma.maintenance_tickets.findMany({
          where,
          include: { rooms: { select: { id: true, room_number: true, floor: true, status: true } } },
          orderBy: { created_at: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      return respond(companyId, 200, {
        success: true,
        action: "list-maintenance",
        establishment_id: establishmentId,
        current_page: paging.page,
        per_page: paging.perPage,
        total_pages: total > 0 ? Math.ceil(total / paging.perPage) : 0,
        total_tickets: total,
        tickets: jsonSafe(data),
      });
    } catch (error) {
      console.error("list-maintenance failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao listar manutenção" });
    }
  }

  private async listClients(companyId: string, query: Query, respond: Respond): Promise<ApiResult> {
    const paging = pageParams(query, 50);
    let establishmentId = text(query.establishment_id);
    const search = text(query.search);
    if (!establishmentId) establishmentId = await this.firstActiveEstablishment(companyId);
    if (!establishmentId) {
      return respond(companyId, 400, { success: false, error: "Nenhum estabelecimento ativo encontrado para esta empresa." });
    }
    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });

    const where: Prisma.clientsWhereInput = {
      establishment_id: establishmentId,
      ...(search
        ? {
            OR: [
              { full_name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    try {
      const [total, data] = await Promise.all([
        this.prisma.clients.count({ where }),
        this.prisma.clients.findMany({
          where,
          select: {
            id: true,
            establishment_id: true,
            full_name: true,
            email: true,
            phone: true,
            document_type: true,
            document_number: true,
            birth_date: true,
            nationality: true,
            address: true,
            city: true,
            state: true,
            postal_code: true,
            country: true,
            notes: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { full_name: "asc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      return respond(companyId, 200, {
        success: true,
        action: "list-clients",
        establishment_id: establishmentId,
        current_page: paging.page,
        per_page: paging.perPage,
        total_pages: total > 0 ? Math.ceil(total / paging.perPage) : 0,
        total_clients: total,
        clients: jsonSafe(data),
      });
    } catch (error) {
      console.error("list-clients failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao listar clientes" });
    }
  }

  private async occupancyMap(companyId: string, method: string, query: Query, rawBody: unknown, respond: Respond): Promise<ApiResult> {
    let establishmentId = text(query.establishment_id);
    let dateStr = text(query.date);
    if (method === "POST") {
      const body = parseBody(rawBody);
      if (!establishmentId) establishmentId = String(body.establishment_id || "").trim();
      if (!dateStr) dateStr = String(body.date || "").trim();
    }
    if (!dateStr) dateStr = todayUtcYmd();
    if (!establishmentId) establishmentId = await this.firstActiveEstablishment(companyId);
    if (!establishmentId) {
      return respond(companyId, 400, { success: false, error: "Nenhum estabelecimento ativo encontrado para esta empresa." });
    }
    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });

    let roomsData: Array<{
      id: string;
      room_number: string;
      floor: number | null;
      status: string;
      category_id: string;
      room_categories: { id: string; name: string; building_id: string | null; buildings: { id: string; name: string } | null } | null;
    }> = [];
    try {
      roomsData = await this.prisma.rooms.findMany({
        where: { establishment_id: establishmentId },
        select: {
          id: true,
          room_number: true,
          floor: true,
          status: true,
          category_id: true,
          room_categories: { select: { id: true, name: true, building_id: true, buildings: { select: { id: true, name: true } } } },
        },
        orderBy: { room_number: "asc" },
      });
    } catch (error) {
      console.error("occupancy-map rooms failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao carregar quartos" });
    }

    let reservationsData: Array<{
      id: string;
      reservation_code: string;
      room_id: string | null;
      checkin_date: Date;
      checkout_date: Date;
      status: string;
      guest_name: string | null;
      adults: number;
      children: number;
    }> = [];
    try {
      reservationsData = await this.prisma.reservations.findMany({
        where: { establishment_id: establishmentId, status: { not: "cancelled" }, room_id: { not: null } },
        select: {
          id: true,
          reservation_code: true,
          room_id: true,
          checkin_date: true,
          checkout_date: true,
          status: true,
          guest_name: true,
          adults: true,
          children: true,
        },
      });
    } catch (error) {
      console.error("occupancy-map reservations failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao carregar reservas" });
    }

    const byRoom: Record<string, (typeof reservationsData)[number]> = {};
    for (const reservation of reservationsData) {
      const roomId = reservation.room_id;
      if (!roomId) continue;
      if (String(reservation.status) === "noshow") continue;
      const checkin = ymd(reservation.checkin_date);
      const checkout = ymd(reservation.checkout_date);
      if (!reservationCoversNight(checkin, checkout, dateStr)) continue;
      const previous = byRoom[roomId];
      if (!previous) {
        byRoom[roomId] = reservation;
        continue;
      }
      const priority: Record<string, number> = {
        checkedin: 4,
        confirmed: 3,
        pending: 2,
        unpaid: 2,
        preregistration: 2,
        blocked: 1,
        checkedout: 1,
        noshow: 0,
      };
      const nextPriority = priority[String(reservation.status)] ?? 0;
      const previousPriority = priority[String(previous.status)] ?? 0;
      if (nextPriority > previousPriority) byRoom[roomId] = reservation;
    }

    const rooms = roomsData.map((room) => {
      const category = room.room_categories;
      const building = category?.buildings;
      const buildingId = building && typeof building === "object" && "id" in building ? String(building.id ?? "") : null;
      const buildingName = building && typeof building === "object" && "name" in building ? String(building.name ?? "") : null;
      const stay = byRoom[String(room.id)] ?? null;
      return {
        room_id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        room_status: room.status,
        category_id: category?.id ?? room.category_id ?? null,
        category_name: category?.name ?? null,
        building_id: buildingId,
        building_name: buildingName,
        reservation: stay
          ? {
              id: stay.id,
              reservation_code: stay.reservation_code,
              checkin_date: ymd(stay.checkin_date),
              checkout_date: ymd(stay.checkout_date),
              status: stay.status,
              guest_name: stay.guest_name ?? null,
              adults: stay.adults ?? null,
              children: stay.children ?? null,
            }
          : null,
        occupied: Boolean(stay),
      };
    });
    const occupiedCount = rooms.filter((room) => room.occupied).length;
    return respond(companyId, 200, {
      success: true,
      action: "occupancy-map",
      establishment_id: establishmentId,
      date: dateStr,
      summary: { total_rooms: rooms.length, occupied_rooms: occupiedCount, available_rooms: rooms.length - occupiedCount },
      rooms,
    });
  }

  private async listStayReviews(companyId: string, query: Query, respond: Respond): Promise<ApiResult> {
    const paging = pageParams(query, 50);
    let establishmentId = text(query.establishment_id);
    const publishedOnly = query.is_published;
    const submittedFrom = text(query.submitted_from);
    const submittedTo = text(query.submitted_to);
    if (!establishmentId) establishmentId = await this.firstActiveEstablishment(companyId);
    if (!establishmentId) {
      return respond(companyId, 400, { success: false, error: "Nenhum estabelecimento ativo encontrado para esta empresa." });
    }
    const establishment = await this.establishmentForCompany(companyId, establishmentId);
    if (!establishment) return respond(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });

    const where: Prisma.stay_reviewsWhereInput = { establishment_id: establishmentId };
    if (publishedOnly === "true") where.is_published = true;
    if (publishedOnly === "false") where.is_published = false;
    if (submittedFrom) {
      const parsed = parseInstant(`${submittedFrom}T00:00:00.000Z`);
      if (!parsed) return this.listFailure(companyId, "list-stay-reviews", respond, "Erro ao listar avaliações da estadia");
      where.submitted_at = { ...(where.submitted_at as object), gte: parsed };
    }
    if (submittedTo) {
      const parsed = parseInstant(`${submittedTo}T23:59:59.999Z`);
      if (!parsed) return this.listFailure(companyId, "list-stay-reviews", respond, "Erro ao listar avaliações da estadia");
      where.submitted_at = { ...(typeof where.submitted_at === "object" && where.submitted_at ? where.submitted_at : {}), lte: parsed };
    }

    try {
      const [total, rows] = await Promise.all([
        this.prisma.stay_reviews.count({ where }),
        this.prisma.stay_reviews.findMany({
          where,
          select: {
            id: true,
            reservation_id: true,
            establishment_id: true,
            guest_account_id: true,
            room_rating: true,
            comfort_rating: true,
            service_rating: true,
            cleanliness_rating: true,
            comment: true,
            is_published: true,
            is_anonymous: true,
            review_type: true,
            submitted_at: true,
            created_at: true,
            updated_at: true,
            reservations: {
              select: { id: true, reservation_code: true, checkin_date: true, checkout_date: true, guest_name: true, status: true },
            },
          },
          orderBy: { submitted_at: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      const reviews = rows.map((row) => {
        const plain = jsonSafe(row) as Record<string, unknown>;
        const reservation = plain.reservations;
        delete plain.reservations;
        return { ...plain, reservation };
      });
      return respond(companyId, 200, {
        success: true,
        action: "list-stay-reviews",
        establishment_id: establishmentId,
        current_page: paging.page,
        per_page: paging.perPage,
        total_pages: total > 0 ? Math.ceil(total / paging.perPage) : 0,
        total_reviews: total,
        reviews,
      });
    } catch (error) {
      console.error("list-stay-reviews failed", error instanceof Error ? error.message : "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao listar avaliações da estadia" });
    }
  }

  private async stayReviewLink(companyId: string, method: string, query: Query, rawBody: unknown, respond: Respond): Promise<ApiResult> {
    let bookingId = text(query.booking_id);
    let baseUrlOverride = normalizeOptionalPublicBaseUrl(query.base_url);
    if (method === "POST") {
      const body = parseBody(rawBody);
      if (!bookingId) bookingId = String(body.booking_id || "").trim();
      if (!baseUrlOverride) baseUrlOverride = normalizeOptionalPublicBaseUrl(String(body.base_url || "").trim() || null);
    }
    if (!bookingId) {
      return respond(companyId, 400, {
        success: false,
        error: "Parâmetro obrigatório: booking_id (UUID da reserva ou reservation_code).",
      });
    }

    const found = await this.findReservation(bookingId, {
      id: true,
      reservation_code: true,
      establishment_id: true,
      identification_number: true,
    });
    if (found.error) {
      console.error("stay-review-link reservation query failed", found.message ?? "failed");
      return respond(companyId, 500, { success: false, error: "Erro ao consultar reserva" });
    }
    const reservation = found.row;
    if (!reservation?.establishment_id) return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });
    const establishment = await this.establishmentForCompany(companyId, String(reservation.establishment_id));
    if (!establishment) return respond(companyId, 404, { success: false, error: "Reserva não encontrada" });

    const locatorRaw = String(reservation.identification_number ?? "").trim() || String(reservation.reservation_code || "").trim();
    if (!locatorRaw) {
      return respond(companyId, 400, { success: false, error: "Reserva sem código/locator para montar o link de avaliação." });
    }
    const base = baseUrlOverride || publicAppBaseUrlFromEnv();
    if (!base) {
      return respond(companyId, 400, {
        success: false,
        error: "URL base do aplicativo não configurada. Defina VITE_APP_URL, SITE_URL ou PUBLIC_APP_URL no ambiente da função, ou envie base_url (https://seu-dominio) na requisição.",
      });
    }
    return respond(companyId, 200, {
      success: true,
      action: "stay-review-link",
      establishment_id: reservation.establishment_id,
      reservation_id: reservation.id,
      reservation_code: reservation.reservation_code ?? null,
      locator: locatorRaw,
      review_url: buildStayReviewPublicUrl(base, locatorRaw),
    });
  }

  private async companyProfile(companyId: string, action: string, respond: Respond): Promise<ApiResult> {
    const company = await this.optional(this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, email: true, phone: true },
    }));
    const establishments = (await this.optional(this.prisma.establishments.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true, type: true, is_active: true, created_at: true, updated_at: true },
      orderBy: { name: "asc" },
    }))) ?? [];
    const establishmentIds = establishments.map((row) => String(row.id));
    const buildings = establishmentIds.length
      ? (await this.optional(this.prisma.buildings.findMany({
          where: { establishment_id: { in: establishmentIds } },
          select: {
            id: true,
            establishment_id: true,
            name: true,
            description: true,
            is_active: true,
            street: true,
            number: true,
            neighborhood: true,
            city: true,
            state: true,
            country: true,
            zip_code: true,
            reception_email: true,
            booking_engine_link: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { name: "asc" },
        }))) ?? []
      : [];
    const buildingsByEstablishment = new Map<string, typeof buildings>();
    for (const building of buildings) {
      const establishmentId = String(building.establishment_id ?? "");
      if (!establishmentId) continue;
      const bucket = buildingsByEstablishment.get(establishmentId) ?? [];
      bucket.push(building);
      buildingsByEstablishment.set(establishmentId, bucket);
    }
    const buildingIds = buildings.map((building) => String(building.id));
    const categories = buildingIds.length
      ? (await this.optional(this.prisma.room_categories.findMany({
          where: { building_id: { in: buildingIds } },
          select: { id: true, establishment_id: true, building_id: true, name: true, abbreviation: true },
          orderBy: { name: "asc" },
        }))) ?? []
      : [];
    const categoriesByBuilding = new Map<string, typeof categories>();
    for (const category of categories) {
      const buildingId = String(category.building_id ?? "");
      if (!buildingId) continue;
      const bucket = categoriesByBuilding.get(buildingId) ?? [];
      bucket.push(category);
      categoriesByBuilding.set(buildingId, bucket);
    }
    const categoryIds = categories.map((category) => String(category.id));
    const rooms = categoryIds.length
      ? (await this.optional(this.prisma.rooms.findMany({
          where: { category_id: { in: categoryIds } },
          select: { id: true, category_id: true, room_number: true, floor: true, status: true, notes: true, created_at: true, updated_at: true },
          orderBy: { room_number: "asc" },
        }))) ?? []
      : [];
    const roomsByCategory = new Map<string, typeof rooms>();
    for (const room of rooms) {
      const categoryId = String(room.category_id ?? "");
      if (!categoryId) continue;
      const bucket = roomsByCategory.get(categoryId) ?? [];
      bucket.push(room);
      roomsByCategory.set(categoryId, bucket);
    }

    const establishmentsWithUnits = establishments.map((establishment) => {
      const buildingsForEstablishment = buildingsByEstablishment.get(String(establishment.id)) ?? [];
      const hasBuildings = buildingsForEstablishment.length > 0;
      const buildingsPayload = hasBuildings
        ? buildingsForEstablishment.map((building) => {
            const cats = categoriesByBuilding.get(String(building.id)) ?? [];
            return {
              ...(jsonSafe(building) as Record<string, unknown>),
              categories: cats.map((category) => ({
                ...(jsonSafe(category) as Record<string, unknown>),
                rooms: jsonSafe(roomsByCategory.get(String(category.id)) ?? []),
              })),
            };
          })
        : [];
      return { ...(jsonSafe(establishment) as Record<string, unknown>), units: { has_buildings: hasBuildings, buildings: buildingsPayload } };
    });

    return respond(companyId, 200, {
      success: true,
      action,
      company: jsonSafe(company),
      establishments: establishmentsWithUnits,
    });
  }

  private async listFailure(companyId: string, label: string, respond: Respond, error = "Erro ao listar reservas"): Promise<ApiResult> {
    console.error(`${label} failed`, "invalid filter");
    return respond(companyId, 500, { success: false, error });
  }

  private async logRequest(
    companyId: string,
    method: string,
    action: string | null,
    status: number,
    body: Record<string, unknown>,
    ip: string | null,
  ): Promise<void> {
    try {
      await this.prisma.company_api_request_logs.create({
        data: {
          company_id: companyId,
          http_method: method,
          action,
          status_code: status,
          response_snippet: JSON.stringify(body).slice(0, 480),
          client_ip: ip,
        },
      });
    } catch (error) {
      console.error("company_api_request_logs insert failed", error instanceof Error ? error.message : "insert failed");
    }
  }

  private async findCredentials(clientId: string) {
    try {
      return await this.prisma.company_api_credentials.findUnique({
        where: { client_id: clientId },
        select: { company_id: true, client_secret_hash: true, is_active: true },
      });
    } catch (error) {
      console.error("company_api_credentials lookup failed", error instanceof Error ? error.message : "failed");
      return null;
    }
  }

  private async companyHasFeature(companyId: string, featureKey: string): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ enabled: boolean | null }>>`
        SELECT public.company_has_feature_access(${featureKey}::text, ${companyId}::uuid) AS enabled
      `;
      return rows[0]?.enabled === true;
    } catch (error) {
      console.error("company_has_feature_access failed", error instanceof Error ? error.message : "failed");
      return false;
    }
  }

  private async firstActiveEstablishment(companyId: string): Promise<string> {
    try {
      const row = await this.prisma.establishments.findFirst({
        where: { company_id: companyId, is_active: true },
        select: { id: true },
        orderBy: { created_at: "asc" },
      });
      return String(row?.id || "");
    } catch (error) {
      console.error("first establishment lookup failed", error instanceof Error ? error.message : "failed");
      return "";
    }
  }

  private async establishmentForCompany(companyId: string, establishmentId: string) {
    const establishment = await this.establishmentById(establishmentId);
    if (!establishment) return null;
    return String(establishment.company_id) === companyId ? establishment : null;
  }

  private async establishmentById(establishmentId: string) {
    return this.optional(this.prisma.establishments.findUnique({
      where: { id: establishmentId },
      select: { id: true, company_id: true, name: true },
    }));
  }

  private async findPricingPlan(rateplanId: string, establishmentId: string): Promise<{ id: string; category_id: string | null } | null> {
    try {
      const plan = await this.prisma.pricing_plans.findFirst({
        where: { id: rateplanId, establishment_id: establishmentId },
        select: { id: true },
      });
      if (!plan) return null;
      const link = await this.prisma.pricing_plan_categories.findFirst({
        where: { pricing_plan_id: plan.id },
        orderBy: { created_at: "asc" },
        select: { category_id: true },
      });
      return { id: plan.id, category_id: link?.category_id ?? null };
    } catch (error) {
      console.error("pricing plan lookup failed", error instanceof Error ? error.message : "failed");
      return null;
    }
  }

  private async generateReservationCode(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ code: string | null }>>`
        SELECT public.generate_reservation_code() AS code
      `;
      return rows[0]?.code ? String(rows[0].code) : null;
    } catch (error) {
      console.error("generate_reservation_code failed", error instanceof Error ? error.message : "failed");
      return null;
    }
  }

  private async findReservation<T extends Prisma.reservationsSelect>(
    bookingId: string,
    select: T,
  ): Promise<{ row: Prisma.reservationsGetPayload<{ select: T }> | null; error: boolean; message?: string }> {
    try {
      const where: Prisma.reservationsWhereInput = isUuid(bookingId)
        ? { OR: [{ id: bookingId }, { reservation_code: bookingId }] }
        : { reservation_code: bookingId };
      const rows = await this.prisma.reservations.findMany({ where, select, take: 2 });
      if (rows.length > 1) return { row: null, error: true, message: "multiple rows" };
      return { row: rows[0] ?? null, error: false };
    } catch (error) {
      return { row: null, error: true, message: error instanceof Error ? error.message : "failed" };
    }
  }

  private async findSingleOta(reservationId: string) {
    try {
      const rows = await this.prisma.ota_reservations.findMany({
        where: { reservation_id: reservationId },
        take: 2,
        include: { ota_channels: { select: { id: true, name: true } } },
      });
      if (rows.length !== 1) return null;
      return rows[0];
    } catch (error) {
      console.error("ota reservation lookup failed", error instanceof Error ? error.message : "failed");
      return null;
    }
  }

  private async optional<T>(query: Promise<T>): Promise<T | null> {
    try {
      return await query;
    } catch (error) {
      console.error("optional query failed", error instanceof Error ? error.message : "failed");
      return null;
    }
  }
}

type Respond = (
  companyId: string | null,
  status: number,
  body: Record<string, unknown>,
  logAction?: string | null,
) => Promise<ApiResult>;

function headerMap(headers: Record<string, string | undefined> | undefined): HeaderMap {
  const map: HeaderMap = new Map();
  for (const [key, value] of Object.entries(headers ?? {})) {
    const raw = Array.isArray(value) ? (value as string[]).join(",") : value;
    if (typeof raw === "string" && raw.trim()) map.set(key.toLowerCase(), raw.trim());
  }
  return map;
}

function headerGet(headers: HeaderMap, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name.toLowerCase());
    if (value) return value;
  }
  return null;
}

function clientIp(headers: HeaderMap): string | null {
  const direct = headerGet(headers, ["CF-Connecting-IP", "cf-connecting-ip", "X-Real-IP", "x-real-ip"]);
  if (direct) return direct;
  const forwarded = headerGet(headers, ["X-Forwarded-For", "x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i += 1) out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return out === 0;
}

function toNumberOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nightsBetween(checkinDate: string, checkoutDate: string): number | null {
  const start = Date.parse(`${checkinDate}T12:00:00Z`);
  const end = Date.parse(`${checkoutDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86400000);
}

function reservationCoversNight(checkinDate: string, checkoutDate: string, dateStr: string): boolean {
  return checkinDate <= dateStr && checkoutDate > dateStr;
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function publicAppBaseUrlFromEnv(): string {
  const raw = process.env.VITE_APP_URL || process.env.SITE_URL || process.env.PUBLIC_APP_URL || "";
  return String(raw).trim().replace(/\/$/, "");
}

function normalizeOptionalPublicBaseUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 512) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildStayReviewPublicUrl(base: string, locator: string): string {
  return `${base.replace(/\/$/, "")}/review/${encodeURIComponent(String(locator).trim())}`;
}

function normalizeOtaGuestAddress(addr: unknown): Record<string, unknown> | null {
  if (!addr || typeof addr !== "object") return null;
  const address = addr as Record<string, unknown>;
  return {
    street: address.line1 ?? address.street ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postal_code: address.zipCode ?? address.postal_code ?? null,
    country: address.country ?? null,
    raw: addr,
  };
}

function text(value: string | undefined): string {
  return (value || "").trim();
}

function pageParams(query: Query, defaultPerPage: number) {
  const page = Math.max(toNumberOrNull(query.page) ?? 1, 1);
  const perPage = Math.min(Math.max(toNumberOrNull(query.per_page) ?? defaultPerPage, 1), 200);
  const from = (page - 1) * perPage;
  return { page, perPage, skip: Math.max(0, Math.trunc(from)), take: Math.max(1, Math.trunc(perPage)) };
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function parseInstant(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isReservationStatus(value: string): value is Exclude<Prisma.reservationsCreateInput["status"], undefined> {
  return [
    "pending",
    "unpaid",
    "confirmed",
    "checkedin",
    "checkedout",
    "checked_in",
    "checked_out",
    "cancelled",
    "noshow",
    "no_show",
    "blocked",
    "preregistration",
  ].includes(value);
}

function isMaintenanceStatus(value: string): boolean {
  return ["open", "in_progress", "completed", "cancelled"].includes(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function jsonSafe(value: unknown, key?: string): unknown {
  if (value == null) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    if (key && DATE_ONLY.has(key)) return value.toISOString().slice(0, 10);
    if (key && TIME_ONLY.has(key)) return value.toISOString().slice(11, 19);
    return value.toISOString();
  }
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) out[childKey] = jsonSafe(child, childKey);
    return out;
  }
  return value;
}
