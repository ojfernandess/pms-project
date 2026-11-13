import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";

type Result = { status: number; body: Record<string, unknown> };

@Injectable()
export class ChannexOtaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  async ack(authorization: string | undefined, body: { channel_id?: string; establishment_id?: string }): Promise<Result> {
    if (!this.internal(authorization)) return { status: 401, body: { success: false, error: "Não autorizado" } };
    const channelId = text(body.channel_id);
    const establishmentId = text(body.establishment_id);
    const channels = await this.prisma.ota_channels.findMany({
      where: {
        channel_manager_type: "channex",
        ...(channelId ? { id: channelId } : {}),
        ...(establishmentId ? { establishment_id: establishmentId } : {}),
      },
    });
    let acked = 0;
    let failed = 0;
    for (const channel of channels) {
      const apiKey = text(channel.channex_api_key);
      const baseUrl = (text(channel.channex_base_url) || "https://staging.channex.io").replace(/\/$/, "");
      if (!apiKey) continue;
      const queue = await this.prisma.channex_ack_queue.findMany({
        where: { ota_channel_id: channel.id, status: "pending", next_attempt_at: { lte: new Date() } },
        orderBy: { created_at: "asc" },
        take: 50,
      });
      for (const row of queue) {
        const revisionId = text(row.revision_id);
        if (!revisionId) continue;
        try {
          const response = await fetch(`${baseUrl}/api/v1/booking_revisions/${revisionId}/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "user-api-key": apiKey },
          });
          if (!response.ok) throw new Error(`ACK HTTP ${response.status}`);
          acked += 1;
          const now = new Date();
          await this.prisma.channex_ack_queue.update({
            where: { id: row.id },
            data: { status: "acked", attempts: row.attempts + 1, updated_at: now },
          });
          await this.prisma.channex_booking_revisions.updateMany({
            where: { ota_channel_id: channel.id, revision_id: revisionId },
            data: { process_status: "acked", acked_at: now, updated_at: now },
          });
        } catch (error) {
          failed += 1;
          const attempts = row.attempts + 1;
          const waitMinutes = Math.min(60, 2 ** Math.min(6, attempts));
          await this.prisma.channex_ack_queue.update({
            where: { id: row.id },
            data: {
              attempts,
              status: attempts >= 10 ? "failed" : "pending",
              next_attempt_at: new Date(Date.now() + waitMinutes * 60 * 1000),
              last_error: error instanceof Error ? error.message : "Falha no ACK",
              updated_at: new Date(),
            },
          });
        }
      }
    }
    return { status: 200, body: { success: true, acked, failed } };
  }

  async bookingCrsUpdate(body: { reservation_id?: string; category_id?: string; overbooking_context?: boolean }): Promise<Result> {
    const reservationId = text(body.reservation_id);
    const categoryId = text(body.category_id);
    if (!reservationId || !categoryId) return { status: 400, body: { success: false, error: "reservation_id e category_id são obrigatórios" } };
    const ota = await this.prisma.ota_reservations.findFirst({ where: { reservation_id: reservationId }, select: { ota_channel_id: true } });
    const channelId = text(ota?.ota_channel_id);
    if (!channelId) return { status: 200, body: { success: true, skipped: true, reason: "Reserva sem vínculo OTA" } };
    const channel = await this.prisma.ota_channels.findUnique({
      where: { id: channelId },
      select: { id: true, channel_manager_type: true, channex_api_key: true, channex_property_id: true, channex_base_url: true },
    });
    if (text(channel?.channel_manager_type) !== "channex") return { status: 200, body: { success: true, skipped: true, reason: "Canal não é Channex" } };
    const apiKey = text(channel?.channex_api_key);
    const propertyId = text(channel?.channex_property_id);
    const baseUrl = text(channel?.channex_base_url) || "https://staging.channex.io";
    if (!apiKey || !propertyId) return { status: 200, body: { success: true, skipped: true, reason: "Canal sem API key/property id Channex" } };
    const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { establishment_id: true, pricing_plan_id: true } });
    const pricingPlanId = text(reservation?.pricing_plan_id);
    const latest = await this.prisma.channex_booking_revisions.findFirst({
      where: { ota_channel_id: channelId, reservation_id: reservationId },
      orderBy: { updated_at: "desc" },
      select: { booking_id: true, payload: true },
    });
    const bookingId = text(latest?.booking_id);
    if (!bookingId) return { status: 200, body: { success: true, skipped: true, reason: "Booking id Channex não encontrado" } };
    const basePayload = (latest?.payload && typeof latest.payload === "object" ? latest.payload : {}) as Record<string, unknown>;
    const rooms = Array.isArray(basePayload.rooms) ? basePayload.rooms as Record<string, unknown>[] : [];
    const firstRoom = rooms[0] ?? {};
    let mapping = await this.prisma.channel_pricing.findFirst({
      where: { ota_channel_id: channelId, category_id: categoryId, is_active: true, ...(pricingPlanId ? { pricing_plan_id: pricingPlanId } : {}) },
      select: { channel_room_code: true, channel_rate_plan_code: true },
    });
    if (!mapping) {
      mapping = await this.prisma.channel_pricing.findFirst({
        where: { ota_channel_id: channelId, category_id: categoryId, is_active: true },
        select: { channel_room_code: true, channel_rate_plan_code: true },
      });
    }
    const mappedRoomType = text(mapping?.channel_room_code);
    const mappedRatePlan = text(mapping?.channel_rate_plan_code);
    if (!mappedRoomType || !mappedRatePlan) return { status: 200, body: { success: true, skipped: true, reason: "Mapeamento Channex da categoria não encontrado" } };
    const overbooking = body.overbooking_context === true;
    const bookingPayload = {
      ...basePayload,
      status: "modified",
      property_id: propertyId,
      meta: {
        ...((basePayload.meta as Record<string, unknown> | undefined) ?? {}),
        ...(overbooking ? { pms_overbooking_reallocation: true, pms_overbooking_reallocation_at: new Date().toISOString(), pms_source: "pms_project_main" } : {}),
      },
      rooms: [{
        ...firstRoom,
        meta: { ...((firstRoom.meta as Record<string, unknown> | undefined) ?? {}), ...(overbooking ? { pms_overbooking_reallocation: true } : {}) },
        room_type_id: mappedRoomType,
        room_type_code: mappedRoomType,
        rate_plan_id: mappedRatePlan,
        rate_plan_code: mappedRatePlan,
      }],
    };
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/bookings/${bookingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "user-api-key": apiKey, "x-api-key": apiKey },
      body: JSON.stringify({ booking: bookingPayload }),
    });
    const respJson = await response.json().catch(() => ({}));
    const establishmentId = text(reservation?.establishment_id);
    if (!response.ok) {
      if (establishmentId) {
        await this.prisma.channex_sync_logs.create({
          data: {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            direction: "push_booking",
            status: "error",
            endpoint: "/api/v1/bookings/:booking_id",
            request_payload: { reservation_id: reservationId, category_id: categoryId, booking_id: bookingId },
            response_payload: respJson as Prisma.InputJsonValue,
            message: `Falha ao atualizar categoria da reserva no Channex (HTTP ${response.status})`,
          },
        });
      }
      return { status: 502, body: { success: false, error: `HTTP ${response.status}`, response: respJson } };
    }
    if (establishmentId) {
      await this.prisma.channex_sync_logs.create({
        data: {
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          direction: "push_booking",
          status: "success",
          endpoint: "/api/v1/bookings/:booking_id",
          request_payload: { reservation_id: reservationId, category_id: categoryId, booking_id: bookingId },
          response_payload: respJson as Prisma.InputJsonValue,
          message: "Categoria da reserva atualizada no Channex via CRS API",
        },
      });
    }
    return { status: 200, body: { success: true, booking_id: bookingId, response: respJson } };
  }

  async mappingOptions(authorization: string | undefined, body: { channel_id?: string; establishment_id?: string }): Promise<Result> {
    if (!authorization) return { status: 401, body: { success: false, error: "Não autorizado" } };
    const internal = this.internal(authorization);
    if (!internal) {
      const userId = await this.identity.resolve(authorization);
      if (!userId) return { status: 401, body: { success: false, error: "Sessão inválida ou expirada" } };
      const establishmentId = text(body.establishment_id);
      if (establishmentId) {
        try {
          await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
        } catch {
          return { status: 403, body: { success: false, error: "Sem permissão para este estabelecimento" } };
        }
      }
    }
    const channelId = text(body.channel_id);
    const establishmentId = text(body.establishment_id);
    if (!channelId || !establishmentId) return { status: 400, body: { success: false, error: "channel_id e establishment_id são obrigatórios" } };
    const channel = await this.prisma.ota_channels.findUnique({
      where: { id: channelId },
      select: { id: true, establishment_id: true, channex_base_url: true, channex_api_key: true, channex_property_id: true, channel_manager_type: true },
    });
    if (!channel?.id) return { status: 404, body: { success: false, error: "Canal não encontrado" } };
    if (channel.channel_manager_type !== "channex") return { status: 400, body: { success: false, error: "Canal informado não é do tipo Channex" } };
    if (String(channel.establishment_id) !== establishmentId) return { status: 403, body: { success: false, error: "Canal não pertence ao estabelecimento selecionado" } };
    const apiKey = text(channel.channex_api_key);
    const propertyId = text(channel.channex_property_id);
    const baseUrl = text(channel.channex_base_url) || "https://staging.channex.io";
    if (!apiKey || !propertyId) return { status: 400, body: { success: false, error: "Canal sem API Key/Property ID do Channex" } };
    const roomTypesReq = `/api/v1/room_types/options?filter[property_id]=${encodeURIComponent(propertyId)}`;
    const ratePlansReq = `/api/v1/rate_plans/options?filter[property_id]=${encodeURIComponent(propertyId)}`;
    const [room, rate] = await Promise.all([
      fetchChannex(baseUrl, apiKey, roomTypesReq),
      fetchChannex(baseUrl, apiKey, ratePlansReq),
    ]);
    if (!room.ok || !rate.ok) {
      return { status: 502, body: { success: false, error: `Falha ao buscar opções no Channex (room_types=${room.status}, rate_plans=${rate.status})`, roomData: room.data, rateData: rate.data } };
    }
    const roomTypes = asList(room.data).map((item) => ({
      id: text(item.id ?? (item.attributes as Record<string, unknown> | undefined)?.id),
      title: text((item.attributes as Record<string, unknown> | undefined)?.title),
      property_id: text((item.attributes as Record<string, unknown> | undefined)?.property_id),
    })).filter((item) => item.id);
    const ratePlans = asList(rate.data).map((item) => ({
      id: text(item.id ?? (item.attributes as Record<string, unknown> | undefined)?.id),
      title: text((item.attributes as Record<string, unknown> | undefined)?.title),
      room_type_id: text((item.attributes as Record<string, unknown> | undefined)?.room_type_id),
      property_id: text((item.attributes as Record<string, unknown> | undefined)?.property_id),
    })).filter((item) => item.id);
    return { status: 200, body: { success: true, room_types: roomTypes, rate_plans: ratePlans } };
  }

  private internal(authorization: string | undefined): boolean {
    const bearer = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return false;
    const internal = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return (internal.length > 0 && bearer === internal) || (serviceRole.length > 0 && bearer === serviceRole);
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

async function fetchChannex(baseUrl: string, apiKey: string, path: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: { "Content-Type": "application/json", "user-api-key": apiKey, "x-api-key": apiKey },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data as Record<string, unknown> };
}

function asList(data: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(data.data) ? data.data as Record<string, unknown>[] : [];
}
