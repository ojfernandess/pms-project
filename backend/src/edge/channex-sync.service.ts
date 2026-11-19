import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  baseSellableRoomsByCategory,
  bookedCountFromOccupiedMap,
  buildOccupiedRoomsByCategoryDate,
  categoryDateKey,
} from "./channel-availability-blocks";
import {
  appendParkingMappedCalendarRows,
  parkingCategoryIdSet,
} from "./channel-parking-inventory";

const RATE_CALENDAR_PAGE_SIZE = 1000;
const DYNAMIC_PAGE_SIZE = 1000;
const RPC_BATCH = 50;
const SUPPORTED_CODES = ["RATE", "AVL", "CTA", "CTD", "SS", "MSA", "MST", "MXS"];
const READ_ONLY_CODES = ["AVO", "MAL"];

type AnyObj = Record<string, unknown>;

type CalRow = {
  date: string;
  category_id: string;
  pricing_plan_id: string;
  base_price: number;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean | null;
  closed_to_departure: boolean | null;
  stop_sell_ota: boolean | null;
  stop_sell_booking_engine: boolean | null;
};

type RestrictionFields = {
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
  min_stay_arrival?: number;
  min_stay_through?: number;
  max_stay?: number;
};

type AvailabilityValue = {
  property_id: string;
  room_type_id: string;
  date: string;
  availability: number;
};

type ChannexCall = { status: number; ok: boolean; json: unknown };

@Injectable()
export class ChannexSyncService {
  private readonly logger = new Logger(ChannexSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  async run(authorization: string | undefined, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    try {
      if (!authorization) {
        return { status: 401, body: { success: false, error: "Não autorizado" } };
      }

      const internal = this.internal(authorization);
      let userId: string | null = null;
      if (!internal) {
        userId = await this.identity.resolve(authorization);
        if (!userId) {
          return { status: 401, body: { success: false, error: "Sessão inválida ou expirada" } };
        }
      }

      const payload = asBody(body);
      const channelId = text(payload.channel_id);
      const establishmentId = text(payload.establishment_id);
      if (!channelId || !establishmentId) {
        return { status: 400, body: { success: false, error: "channel_id e establishment_id são obrigatórios" } };
      }

      let channel: Awaited<ReturnType<PrismaService["ota_channels"]["findUnique"]>>;
      try {
        channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
      } catch {
        channel = null;
      }
      if (!channel) {
        return { status: 404, body: { success: false, error: "Canal não encontrado" } };
      }

      if (text(channel.establishment_id) !== establishmentId) {
        return { status: 403, body: { success: false, error: "Canal não pertence ao estabelecimento informado" } };
      }

      if (!internal && userId) {
        try {
          await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
        } catch {
          return { status: 403, body: { success: false, error: "Sem permissão para este estabelecimento" } };
        }
      }

      if (String(channel.channel_manager_type ?? "") !== "channex") {
        return { status: 400, body: { success: false, error: "Canal informado não é do tipo Channex" } };
      }

      const apiKey = text(channel.channex_api_key);
      const propertyId = text(channel.channex_property_id);
      const baseUrl = String(channel.channex_base_url ?? "https://staging.channex.io").trim();
      if (!apiKey || !propertyId) {
        return { status: 400, body: { success: false, error: "Canal sem channex_api_key/channex_property_id configurados" } };
      }

      await this.touchChannel(channelId, {
        channex_sync_status: "syncing",
        channex_last_sync_at: new Date(),
      });

      // Recua 1 dia para cobrir timezones UTC- (ex.: Brasil UTC-3): evita excluir "hoje local"
      // quando o UTC já virou para o dia seguinte.
      const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const future = new Date();
      future.setDate(future.getDate() + 365);
      const futureDate = future.toISOString().slice(0, 10);

      const rateCalendar = await this.fetchAllRateCalendar(establishmentId, today, futureDate);
      const [mappingRows, rooms, roomCategories, reservations, maintenanceTickets, hotelSettings] = await Promise.all([
        this.prisma.channel_pricing.findMany({
          where: { ota_channel_id: channelId, is_active: true },
          select: {
            category_id: true,
            pricing_plan_id: true,
            channel_room_code: true,
            channel_rate_plan_code: true,
            price_multiplier: true,
            fixed_price: true,
          },
        }),
        this.prisma.rooms.findMany({
          where: { establishment_id: establishmentId },
          select: { id: true, category_id: true, status: true, is_blocked: true },
        }),
        this.prisma.room_categories.findMany({
          where: { establishment_id: establishmentId },
          select: { id: true, base_price: true, category_kind: true },
        }),
        this.prisma.reservations.findMany({
          where: {
            establishment_id: establishmentId,
            checkout_date: { gte: utcDay(today) },
            checkin_date: { lte: utcDay(futureDate) },
          },
          select: {
            id: true,
            category_id: true,
            room_id: true,
            checkin_date: true,
            checkout_date: true,
            status: true,
            channel: true,
          },
        }),
        this.prisma.maintenance_tickets.findMany({
          where: {
            establishment_id: establishmentId,
            status: { in: ["open", "in_progress"] },
          },
          select: {
            room_id: true,
            maintenance_start_date: true,
            maintenance_end_date: true,
            opened_at: true,
            status: true,
          },
        }),
        this.prisma.hotel_settings
          .findFirst({
            where: { establishment_id: establishmentId },
            select: { rate_system_settings: true },
          })
          .catch((error: unknown) => {
            this.logger.warn(`[channex-sync] hotel_settings: ${errorMessage(error)}`);
            return null;
          }),
      ]);

      const tariffCategoryDateKeys = new Set<string>();
      for (const row of rateCalendar) {
        const categoryId = row.category_id.trim();
        const date = row.date.slice(0, 10);
        if (categoryId && date) tariffCategoryDateKeys.add(`${categoryId}::${date}`);
      }

      const roomAvailabilityByCategory = baseSellableRoomsByCategory(
        rooms.map((room) => ({
          id: String(room.id),
          category_id: room.category_id ? String(room.category_id) : null,
          is_blocked: room.is_blocked,
        })),
      );

      const occupiedByCategoryDate = buildOccupiedRoomsByCategoryDate({
        rooms: rooms.map((room) => ({
          id: String(room.id),
          category_id: room.category_id ? String(room.category_id) : null,
          is_blocked: room.is_blocked,
        })),
        reservations: reservations.map((reservation) => ({
          id: reservation.id,
          category_id: reservation.category_id ? String(reservation.category_id) : null,
          room_id: reservation.room_id ? String(reservation.room_id) : null,
          checkin_date: reservation.checkin_date,
          checkout_date: reservation.checkout_date,
          status: reservation.status,
        })),
        maintenanceTickets: maintenanceTickets.map((ticket) => ({
          room_id: String(ticket.room_id),
          maintenance_start_date: ticket.maintenance_start_date,
          maintenance_end_date: ticket.maintenance_end_date,
          opened_at: ticket.opened_at,
          status: ticket.status,
        })),
        windowStart: today,
        windowEndInclusive: futureDate,
        keySeparator: "::",
      });

      const bookedByCategoryDate = new Map<string, number>();
      for (const [key, set] of occupiedByCategoryDate) {
        bookedByCategoryDate.set(key, set.size);
      }

      const roomCategoryByRoomId = new Map<string, string>();
      for (const room of rooms) {
        const roomId = String(room.id ?? "").trim();
        const categoryId = String(room.category_id ?? "").trim();
        if (!roomId || !categoryId) continue;
        roomCategoryByRoomId.set(roomId, categoryId);
      }

      const inactiveReservationStatuses = new Set(["cancelled", "canceled", "checkedout", "checked_out"]);
      for (const reservation of reservations) {
        const status = String(reservation.status ?? "").toLowerCase();
        const channelName = String(reservation.channel ?? "").toLowerCase();
        if (inactiveReservationStatuses.has(status)) continue;
        const isChannelReservation =
          channelName === "ota" || channelName === "channel_manager" || channelName === "channel manager";
        const roomId = String(reservation.room_id ?? "").trim();
        const fallbackCategoryId = String(reservation.category_id ?? "").trim();
        const effectiveCategoryId = roomId
          ? String(roomCategoryByRoomId.get(roomId) ?? fallbackCategoryId).trim()
          : fallbackCategoryId;
        const hasCrossCategoryRelocation =
          Boolean(fallbackCategoryId) && Boolean(effectiveCategoryId) && fallbackCategoryId !== effectiveCategoryId;
        if (!isChannelReservation || !hasCrossCategoryRelocation) continue;

        const checkin = ymd(reservation.checkin_date);
        const checkout = ymd(reservation.checkout_date);
        if (!checkin || !checkout) continue;

        let cursor = new Date(`${checkin}T00:00:00.000Z`);
        const end = new Date(`${checkout}T00:00:00.000Z`);
        const min = new Date(`${today}T00:00:00.000Z`);
        const maxExclusive = addDays(new Date(`${futureDate}T00:00:00.000Z`), 1);
        if (cursor < min) cursor = min;
        const loopEnd = end < maxExclusive ? end : maxExclusive;
        const roomKey = roomId || `res:${reservation.id}`;
        while (cursor < loopEnd) {
          const date = toIsoDate(cursor);
          const originalKey = categoryDateKey(fallbackCategoryId, date, "::");
          if (!occupiedByCategoryDate.has(originalKey)) occupiedByCategoryDate.set(originalKey, new Set());
          occupiedByCategoryDate.get(originalKey)!.add(roomKey);
          cursor = addDays(cursor, 1);
        }
      }

      bookedByCategoryDate.clear();
      for (const [key, set] of occupiedByCategoryDate) {
        bookedByCategoryDate.set(key, set.size);
      }

      const diagCategories: Record<string, { base: number; topBooked: number }> = {};
      for (const [categoryId, base] of roomAvailabilityByCategory.entries()) {
        diagCategories[categoryId] = { base, topBooked: 0 };
      }
      for (const [key, count] of bookedByCategoryDate.entries()) {
        const categoryId = key.split("::")[0];
        if (diagCategories[categoryId]) {
          diagCategories[categoryId].topBooked = Math.max(diagCategories[categoryId].topBooked, count);
        }
      }
      this.logger.log(
        `[channex-sync] availability_debug ${JSON.stringify({
          categories: Object.entries(diagCategories).map(([id, value]) => ({
            category_id: id,
            base_inventory: value.base,
            peak_booked: value.topBooked,
            min_net_availability: Math.max(0, value.base - value.topBooked),
          })),
        })}`,
      );

      const useRateCalendar = rateCalendar.length > 0;
      const allowBasePriceFallback = envFlagTrue("CHANNEX_ALLOW_BASE_PRICE_FALLBACK");
      if (!useRateCalendar && !allowBasePriceFallback) {
        const message =
          "Sem linhas no tarifário (rate_calendar) para o período. Crie o tarifário no calendário antes de sincronizar com o Channex. (Opcional: CHANNEX_ALLOW_BASE_PRICE_FALLBACK=true só em migração controlada.)";
        await this.writeLog({
          otaChannelId: channelId,
          establishmentId,
          status: "warning",
          endpoint: "early_exit",
          message,
        });
        await this.touchChannel(channelId, {
          channex_sync_status: "error",
          sync_status: "error",
          sync_error: message,
          channex_last_sync_at: new Date(),
          last_sync_at: new Date(),
        });
        return { status: 400, body: { success: false, error: message } };
      }

      const categoryBasePriceMap = new Map<string, number>();
      for (const category of roomCategories) {
        const categoryId = String(category.id ?? "");
        if (!categoryId) continue;
        categoryBasePriceMap.set(categoryId, Number(category.base_price ?? 0));
      }

      const calendarLikeRows: CalRow[] = [];
      if (useRateCalendar) {
        calendarLikeRows.push(...rateCalendar);
      } else {
        for (const mapping of mappingRows) {
          const categoryId = String(mapping.category_id ?? "").trim();
          if (!categoryId) continue;
          for (let offset = 0; offset <= 365; offset += 1) {
            const day = new Date();
            day.setDate(day.getDate() + offset);
            calendarLikeRows.push({
              date: day.toISOString().slice(0, 10),
              category_id: categoryId,
              pricing_plan_id: String(mapping.pricing_plan_id ?? ""),
              base_price: categoryBasePriceMap.get(categoryId) ?? 0,
              min_stay: null,
              max_stay: null,
              closed_to_arrival: null,
              closed_to_departure: null,
              stop_sell_ota: null,
              stop_sell_booking_engine: null,
            });
          }
        }
      }

      const parkingCategoryIds = parkingCategoryIdSet(
        roomCategories.map((c) => ({ id: String(c.id), category_kind: c.category_kind })),
      );
      if (parkingCategoryIds.size > 0) {
        appendParkingMappedCalendarRows({
          calendarLikeRows,
          mappingRows,
          parkingCategoryIds,
          categoryBasePriceById: categoryBasePriceMap,
          windowStartYmd: today,
          windowEndInclusiveYmd: futureDate,
        });
        const mappedParking = [...parkingCategoryIds].filter((id) =>
          mappingRows.some(
            (m) =>
              String(m.category_id ?? "") === id &&
              String(m.channel_room_code ?? "").trim() &&
              String(m.channel_rate_plan_code ?? "").trim(),
          ),
        );
        if (mappedParking.length > 0) {
          this.logger.log(
            `[channex-sync] parking_inventory ${JSON.stringify({ mapped_parking_categories: mappedParking })}`,
          );
        }
      }

      const rawSettings = asBody(hotelSettings?.rate_system_settings);
      const autoApplyDynamicRules = flagTrue(rawSettings.auto_apply_dynamic_rules);
      const persistDynamicRates = flagTrue(rawSettings.persist_dynamic_rates);

      const dynamicPriceByKey = new Map<string, number>();
      let dynamicPersistRowsLoaded = 0;
      let dynamicRpcPrefetched = 0;

      if (autoApplyDynamicRules) {
        if (persistDynamicRates) {
          const loaded = await this.loadPersistedDynamicPrices(establishmentId, today, futureDate);
          if (loaded) {
            for (const [key, price] of loaded) dynamicPriceByKey.set(key, price);
            dynamicPersistRowsLoaded = dynamicPriceByKey.size;
          }
        } else {
          dynamicRpcPrefetched = await this.prefetchDynamicPrices(establishmentId, calendarLikeRows, dynamicPriceByKey);
        }
      }

      if (autoApplyDynamicRules) {
        this.logger.log(
          `[channex-sync] dynamic_pricing ${JSON.stringify({
            persist_dynamic_rates: persistDynamicRates,
            map_size: dynamicPriceByKey.size,
            persist_rows_loaded: dynamicPersistRowsLoaded,
            rpc_keys_prefetched: dynamicRpcPrefetched,
          })}`,
        );
      }

      const availabilityMap = new Map<string, AvailabilityValue>();
      const restrictionValues: Array<RestrictionFields & { property_id: string; rate_plan_id: string; date: string; rate: number }> = [];
      const missingMappings: Array<{ category_id: string; pricing_plan_id: string }> = [];
      const missingMappingsSet = new Set<string>();

      for (const row of calendarLikeRows) {
        const categoryId = String(row.category_id ?? "");
        const pricingPlanId = String(row.pricing_plan_id ?? "");
        const candidates = mappingRows.filter((mapping) => String(mapping.category_id ?? "") === categoryId);
        const mappingExact = candidates.find((mapping) => String(mapping.pricing_plan_id ?? "").trim() === pricingPlanId);
        const mappingGeneric = candidates.find((mapping) => !String(mapping.pricing_plan_id ?? "").trim());
        const mapping = mappingExact ?? mappingGeneric ?? candidates[0];
        if (!mapping) {
          const key = `${categoryId}::${pricingPlanId}`;
          if (!missingMappingsSet.has(key)) {
            missingMappingsSet.add(key);
            missingMappings.push({ category_id: categoryId, pricing_plan_id: pricingPlanId });
          }
          continue;
        }

        const roomTypeId = String(mapping.channel_room_code ?? "").trim();
        const ratePlanId = String(mapping.channel_rate_plan_code ?? "").trim();
        if (!roomTypeId || !ratePlanId) continue;

        let basePrice = Number(row.base_price ?? 0);
        const planForDynamic = String(row.pricing_plan_id ?? "").trim();
        if (autoApplyDynamicRules && planForDynamic) {
          const dynamicKey = dynamicPricingKey(categoryId, row.date, planForDynamic);
          const dynamicBar = dynamicPriceByKey.get(dynamicKey);
          if (dynamicBar != null && dynamicBar > 0) basePrice = dynamicBar;
        }
        const multiplier = Number(mapping.price_multiplier ?? 1);
        const fixedPrice = mapping.fixed_price != null ? Number(mapping.fixed_price) : null;
        const finalPrice = fixedPrice != null && !Number.isNaN(fixedPrice) ? fixedPrice : basePrice * multiplier;
        const cents = Math.max(0, Math.round(finalPrice * 100));
        const date = String(row.date ?? "");
        if (date) {
          const availabilityKey = `${roomTypeId}::${date}`;
          if (!availabilityMap.has(availabilityKey)) {
            const totalInventory = Math.max(0, roomAvailabilityByCategory.get(categoryId) ?? 0);
            const booked =
              bookedByCategoryDate.get(`${categoryId}::${date}`) ??
              bookedCountFromOccupiedMap(occupiedByCategoryDate, categoryId, date, "::");
            availabilityMap.set(availabilityKey, {
              property_id: propertyId,
              room_type_id: roomTypeId,
              date,
              availability: Math.max(0, totalInventory - booked),
            });
          }
        }
        restrictionValues.push({
          ...rowToChannexRestrictionFields(row),
          property_id: propertyId,
          rate_plan_id: ratePlanId,
          date,
          rate: cents,
        });
      }

      if (useRateCalendar) {
        const mappedCategoryRoomTypes = new Map<string, string>();
        for (const mapping of mappingRows) {
          const categoryId = String(mapping.category_id ?? "").trim();
          const roomTypeId = String(mapping.channel_room_code ?? "").trim();
          if (!categoryId || !roomTypeId) continue;
          if (!mappedCategoryRoomTypes.has(categoryId)) mappedCategoryRoomTypes.set(categoryId, roomTypeId);
        }
        for (const [categoryId, roomTypeId] of mappedCategoryRoomTypes) {
          for (const date of eachDateStringInRangeInclusive(today, futureDate)) {
            if (tariffCategoryDateKeys.has(`${categoryId}::${date}`)) continue;
            const availabilityKey = `${roomTypeId}::${date}`;
            if (!availabilityMap.has(availabilityKey)) {
              availabilityMap.set(availabilityKey, {
                property_id: propertyId,
                room_type_id: roomTypeId,
                date,
                availability: 0,
              });
            }
          }
        }
      }

      const availabilityValues = [...availabilityMap.values()];
      const dynamicPricing = dynamicPricingPayload(autoApplyDynamicRules, persistDynamicRates, dynamicPersistRowsLoaded, dynamicRpcPrefetched);

      if (availabilityValues.length === 0 || restrictionValues.length === 0) {
        const hint =
          "Sem payload ARI para envio. Verifique mapeamentos ativos em Tarifas por Canal e IDs Channex (room_type_id/rate_plan_id).";
        await this.writeLog({
          otaChannelId: channelId,
          establishmentId,
          status: "warning",
          endpoint: "/api/v1/availability + /api/v1/restrictions",
          message: hint,
          requestPayload: {
            source: useRateCalendar ? "rate_calendar" : "fallback_channel_pricing",
            dynamic_pricing: dynamicPricing,
            supportedCodes: SUPPORTED_CODES,
            readOnlyCodesIgnored: READ_ONLY_CODES,
            availabilityCount: availabilityValues.length,
            restrictionsCount: restrictionValues.length,
            missingMappings: missingMappings.slice(0, 20),
          },
        });
        await this.touchChannel(channelId, {
          channex_sync_status: "error",
          sync_status: "error",
          sync_error: hint,
          channex_last_sync_at: new Date(),
          last_sync_at: new Date(),
        });
        return {
          status: 400,
          body: {
            success: false,
            error: hint,
            availabilityValues: availabilityValues.length,
            restrictionValues: restrictionValues.length,
            missingMappings: missingMappings.slice(0, 20),
          },
        };
      }

      const availabilityResp = await postChannexWithRetry(baseUrl, apiKey, "/api/v1/availability", { values: availabilityValues });
      const restrictionsResp = await postChannexWithRetry(baseUrl, apiKey, "/api/v1/restrictions", { values: restrictionValues });

      if (!availabilityResp.ok || !restrictionsResp.ok) {
        const errMessage = `Erro no envio ARI (availability=${availabilityResp.status}, restrictions=${restrictionsResp.status})`;
        await this.writeLog({
          otaChannelId: channelId,
          establishmentId,
          status: "error",
          endpoint: "/api/v1/availability + /api/v1/restrictions",
          message: errMessage,
          requestPayload: { availabilityCount: availabilityValues.length, restrictionsCount: restrictionValues.length },
          responsePayload: { availabilityJson: availabilityResp.json, restrictionsJson: restrictionsResp.json },
        });
        await this.touchChannel(channelId, {
          channex_sync_status: "error",
          sync_status: "error",
          sync_error: errMessage,
          channex_last_sync_at: new Date(),
          last_sync_at: new Date(),
        });
        return {
          status: 502,
          body: {
            success: false,
            error: errMessage,
            availabilityJson: availabilityResp.json,
            restrictionsJson: restrictionsResp.json,
          },
        };
      }

      const availabilityTasks = taskIds(availabilityResp.json);
      const restrictionTasks = taskIds(restrictionsResp.json);
      await this.writeLog({
        otaChannelId: channelId,
        establishmentId,
        status: "success",
        endpoint: "/api/v1/availability + /api/v1/restrictions",
        message: "ARI push concluído",
        requestPayload: {
          availabilityCount: availabilityValues.length,
          restrictionsCount: restrictionValues.length,
          dynamic_pricing: dynamicPricing,
        },
        responsePayload: {
          availabilityStatus: availabilityResp.status ?? null,
          restrictionsStatus: restrictionsResp.status ?? null,
          supportedCodes: SUPPORTED_CODES,
          readOnlyCodesIgnored: READ_ONLY_CODES,
          availabilityWarnings: metaOf(availabilityResp.json),
          restrictionsWarnings: metaOf(restrictionsResp.json),
        },
        taskId: [...availabilityTasks, ...restrictionTasks].join(","),
      });
      await this.touchChannel(channelId, {
        channex_sync_status: "success",
        channex_last_sync_at: new Date(),
        sync_status: "success",
        sync_error: null,
        last_sync_at: new Date(),
      });

      return {
        status: 200,
        body: {
          success: true,
          availabilityTasks,
          restrictionTasks,
          message: "ARI enviado para o Channex",
        },
      };
    } catch (error) {
      this.logger.error(`channex-sync error ${errorMessage(error)}`);
      return { status: 500, body: { success: false, error: error instanceof Error ? error.message : "Erro interno" } };
    }
  }

  private internal(authorization: string | undefined): boolean {
    const bearer = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return false;
    const internal = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return (internal.length > 0 && bearer === internal) || (serviceRole.length > 0 && bearer === serviceRole);
  }

  private async fetchAllRateCalendar(establishmentId: string, today: string, futureDate: string): Promise<CalRow[]> {
    const all: CalRow[] = [];
    let offset = 0;
    for (;;) {
      const batch = await this.prisma.rate_calendar.findMany({
        where: {
          establishment_id: establishmentId,
          date: { gte: utcDay(today), lte: utcDay(futureDate) },
        },
        select: {
          date: true,
          category_id: true,
          pricing_plan_id: true,
          base_price: true,
          adult_price: true,
          child_price: true,
          min_stay: true,
          max_stay: true,
          closed_to_arrival: true,
          closed_to_departure: true,
          stop_sell_ota: true,
          stop_sell_booking_engine: true,
          min_advance_days: true,
          max_advance_days: true,
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        skip: offset,
        take: RATE_CALENDAR_PAGE_SIZE,
      });
      for (const row of batch) {
        all.push({
          date: ymd(row.date),
          category_id: row.category_id,
          pricing_plan_id: row.pricing_plan_id,
          base_price: Number(row.base_price ?? 0),
          min_stay: row.min_stay,
          max_stay: row.max_stay,
          closed_to_arrival: row.closed_to_arrival,
          closed_to_departure: row.closed_to_departure,
          stop_sell_ota: row.stop_sell_ota,
          stop_sell_booking_engine: row.stop_sell_booking_engine,
        });
      }
      if (batch.length < RATE_CALENDAR_PAGE_SIZE) break;
      offset += RATE_CALENDAR_PAGE_SIZE;
    }
    return all;
  }

  private async loadPersistedDynamicPrices(establishmentId: string, today: string, futureDate: string): Promise<Map<string, number> | null> {
    const loaded = new Map<string, number>();
    try {
      let offset = 0;
      for (;;) {
        const batch = await this.prisma.dynamic_pricing_results.findMany({
          where: {
            establishment_id: establishmentId,
            date: { gte: utcDay(today), lte: utcDay(futureDate) },
          },
          select: { category_id: true, rate_plan_id: true, date: true, final_price: true },
          orderBy: { id: "asc" },
          skip: offset,
          take: DYNAMIC_PAGE_SIZE,
        });
        for (const row of batch) {
          const price = Number(row.final_price);
          if (!Number.isFinite(price) || price <= 0) continue;
          loaded.set(dynamicPricingKey(row.category_id, row.date, row.rate_plan_id), price);
        }
        if (batch.length < DYNAMIC_PAGE_SIZE) break;
        offset += DYNAMIC_PAGE_SIZE;
      }
      return loaded;
    } catch (error) {
      this.logger.warn(`[channex-sync] dynamic_pricing_results: ${errorMessage(error)}`);
      return null;
    }
  }

  private async prefetchDynamicPrices(establishmentId: string, rows: CalRow[], target: Map<string, number>): Promise<number> {
    const uniqueKeys = new Set<string>();
    for (const row of rows) {
      const planId = String(row.pricing_plan_id ?? "").trim();
      if (!planId) continue;
      uniqueKeys.add(dynamicPricingKey(String(row.category_id), row.date, planId));
    }
    const rawMax = (process.env.CHANNEX_DYNAMIC_RPC_MAX_KEYS ?? "").trim();
    const parsedMax = parseInt(rawMax, 10);
    const maxKeys = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.min(20_000, parsedMax) : 12_000;
    const keys = [...uniqueKeys];
    const limited = keys.length > maxKeys ? keys.slice(0, maxKeys) : keys;
    if (keys.length > maxKeys) {
      this.logger.warn(
        `[channex-sync] dynamic_pricing_rpc_cap ${JSON.stringify({
          keys_total: keys.length,
          keys_prefetched: maxKeys,
          hint: "Ative «Persistir preços dinâmicos» e cron recalc-rates para usar dynamic_pricing_results, ou aumente CHANNEX_DYNAMIC_RPC_MAX_KEYS.",
        })}`,
      );
    }
    for (let index = 0; index < limited.length; index += RPC_BATCH) {
      const batch = limited.slice(index, index + RPC_BATCH);
      const results = await Promise.all(
        batch.map(async (key) => {
          const parts = key.split("\0");
          const categoryId = parts[0];
          const date = parts[1];
          const planId = parts[2];
          if (!planId) return null;
          try {
            const price = await this.calculateRatePrice(establishmentId, categoryId, planId, date);
            if (!Number.isFinite(price) || price <= 0) return null;
            return { key, price };
          } catch (error) {
            this.logger.warn(`[channex-sync] calculate_rate_price: ${errorMessage(error)} ${key}`);
            return null;
          }
        }),
      );
      for (const result of results) {
        if (result) target.set(result.key, result.price);
      }
    }
    return target.size;
  }

  private async calculateRatePrice(establishmentId: string, categoryId: string, planId: string, date: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ price: unknown }>>`
      SELECT public.calculate_rate_price(${establishmentId}::uuid, ${categoryId}::uuid, ${planId}::uuid, ${date}::date, 2::int, 0::int) AS price
    `;
    return rows[0]?.price == null ? 0 : Number(rows[0].price);
  }

  private async writeLog(entry: {
    otaChannelId: string;
    establishmentId: string;
    status: string;
    endpoint: string;
    message: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    taskId?: string;
  }): Promise<void> {
    try {
      await this.prisma.channex_sync_logs.create({
        data: {
          ota_channel_id: entry.otaChannelId,
          establishment_id: entry.establishmentId,
          direction: "push_ari",
          status: entry.status,
          endpoint: entry.endpoint,
          message: entry.message,
          ...(entry.requestPayload !== undefined ? { request_payload: toJson(entry.requestPayload) } : {}),
          ...(entry.responsePayload !== undefined ? { response_payload: toJson(entry.responsePayload) } : {}),
          ...(entry.taskId !== undefined ? { task_id: entry.taskId } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(`channex_sync_logs: ${errorMessage(error)}`);
    }
  }

  private async touchChannel(channelId: string, data: Prisma.ota_channelsUpdateInput): Promise<void> {
    try {
      await this.prisma.ota_channels.update({ where: { id: channelId }, data });
    } catch (error) {
      this.logger.warn(`ota_channels: ${errorMessage(error)}`);
    }
  }
}

function asBody(body: unknown): AnyObj {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body as AnyObj;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erro";
}

function envFlagTrue(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function flagTrue(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function utcDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ymd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function eachDateStringInRangeInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

function toPositiveIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : null;
}

function toNonNegativeIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const floored = Math.floor(parsed);
  return floored >= 0 ? floored : null;
}

function rowToChannexRestrictionFields(row: CalRow): RestrictionFields {
  const minStayRaw = row.min_stay;
  const maxStayRaw = row.max_stay;
  const minStay = toPositiveIntOrNull(minStayRaw);
  const maxStay = toNonNegativeIntOrNull(maxStayRaw);
  const payload: RestrictionFields = {
    closed_to_arrival: Boolean(row.closed_to_arrival),
    closed_to_departure: Boolean(row.closed_to_departure),
    // stop_sell_booking_engine fecha só o motor próprio; o canal usa stop_sell_ota.
    stop_sell: Boolean(row.stop_sell_ota),
  };
  if (minStay != null) {
    payload.min_stay_arrival = minStay;
    payload.min_stay_through = minStay;
  }
  if (maxStay != null) payload.max_stay = maxStay;
  return payload;
}

function dynamicPricingKey(categoryId: string, dateRaw: unknown, planId: unknown): string {
  const date = ymd(dateRaw);
  const plan = planId == null || planId === "" ? "" : String(planId);
  return `${String(categoryId).trim()}\0${date}\0${plan}`;
}

function dynamicPricingPayload(autoApply: boolean, persist: boolean, persistRows: number, rpcKeys: number): AnyObj {
  if (!autoApply) return { mode: "off" };
  if (persist) return { mode: "dynamic_pricing_results", rows_loaded: persistRows };
  return { mode: "calculate_rate_price", keys_prefetched: rpcKeys };
}

function taskIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const data = (payload as AnyObj).data;
  if (!Array.isArray(data)) return [];
  return data.map((item) => String((item as AnyObj).id ?? "")).filter(Boolean);
}

function metaOf(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  return (payload as AnyObj).meta ?? null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function postChannex(baseUrl: string, apiKey: string, path: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "user-api-key": apiKey,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
}

async function postChannexWithRetry(baseUrl: string, apiKey: string, path: string, payload: unknown): Promise<ChannexCall> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await postChannex(baseUrl, apiKey, path, payload);
    last = response;
    if (response.status !== 429) {
      return { status: response.status, ok: response.ok, json: await response.json().catch(() => ({})) };
    }
    const waitMs = Math.min(60000, 1000 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const json = last ? await last.json().catch(() => ({})) : {};
  return { status: last?.status ?? 0, ok: last?.ok ?? false, json };
}
