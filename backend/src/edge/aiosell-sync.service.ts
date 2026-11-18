import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, reservation_status } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  baseSellableRoomsByCategory,
  bookedCountFromOccupiedMap,
  buildOccupiedRoomsByCategoryDate,
} from "./channel-availability-blocks";

type Result = { status: number; body: Record<string, unknown> };
type Occ = 1 | 2 | 3 | 4;

const SYNC_DAYS_AHEAD = 365;
const RATE_CALENDAR_PAGE_SIZE_AI = 1000;
const THROTTLE_MS = 45_000;
const RPC_BATCH = 50;

type DerivedBaseResolve = {
  effectiveBase: number;
  source: "stored" | "recomputed_from_base_plan";
  storedBase: number;
  basePlanBase: number | null;
  basePlanId: string | null;
  trustCalendarOverRecompute?: boolean;
};

type InvDayCombined = {
  date: string;
  available: number;
  restrictions: Record<string, unknown> | null;
};

type AiosellRateLine = {
  roomCode: string;
  rateplanCode: string;
  rate: number;
  restrictions: Record<string, unknown>;
};

/**
 * StayOS PMS → Aiosell Channel Manager (API v2).
 * Port of supabase/functions/aiosell-sync/index.ts.
 * Prices and restrictions share one rates[] POST so the CM does not overwrite the first request.
 */
@Injectable()
export class AiosellSyncService {
  private readonly logger = new Logger(AiosellSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  async run(authorization: string | undefined, body: unknown): Promise<Result> {
    if (!authorization) return fail(401, "Não autorizado");

    const internal = this.internalBearer(authorization);
    let authUserId: string | null = null;
    if (!internal) {
      authUserId = await this.identity.resolve(authorization);
      if (!authUserId) return fail(401, "Sessão inválida ou expirada");
    }

    if (Array.isArray(body)) return fail(400, "channel_id obrigatório");
    if (!body || typeof body !== "object") return fail(400, "JSON inválido");
    const payload = body as Record<string, unknown>;

    const channelId = payload.channel_id;
    if (!channelId || typeof channelId !== "string") return fail(400, "channel_id obrigatório");

    const todayUtcMinus1 = new Date(Date.now() - 86_400_000);
    const today = todayUtcMinus1.toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + SYNC_DAYS_AHEAD);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    let channel: Awaited<ReturnType<PrismaService["ota_channels"]["findUnique"]>>;
    try {
      channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
    } catch {
      return fail(404, "Canal não encontrado");
    }
    if (!channel) return fail(404, "Canal não encontrado");
    if (channel.channel_manager_type !== "aiosell") return fail(400, "Canal não é Aiosell");

    const isSyncing = String(channel.sync_status ?? "").toLowerCase() === "syncing";
    const lastSyncMs = channel.last_sync_at ? channel.last_sync_at.getTime() : NaN;
    const recentlyStarted = Number.isFinite(lastSyncMs) && Date.now() - lastSyncMs < THROTTLE_MS;
    if (isSyncing && recentlyStarted) {
      return {
        status: 200,
        body: {
          success: true,
          skipped: true,
          reason:
            "Sincronização já em andamento para este canal. Ignorado para evitar concorrência e processamento fora de ordem no Aiosell.",
        },
      };
    }

    const fromChannel = channel.establishment_id;
    const fromBody = payload.establishment_id == null ? null : String(payload.establishment_id);
    const establishmentId = (fromChannel || fromBody) as string | null;
    if (!establishmentId) {
      return fail(
        400,
        "O canal OTA não tem estabelecimento definido. Edite o canal e associe o estabelecimento ou sincronize com um estabelecimento selecionado na app.",
      );
    }
    if (fromChannel && fromBody && fromChannel !== fromBody) {
      return fail(400, "establishment_id enviado não coincide com o estabelecimento do canal.");
    }

    if (!internal && authUserId) {
      try {
        await this.auth.assertEstablishment(await this.auth.me(authUserId), establishmentId);
      } catch {
        return fail(403, "Sem permissão para este estabelecimento");
      }
    }

    let rateCalendarRowsAll: Record<string, unknown>[];
    try {
      rateCalendarRowsAll = await this.loadRateCalendar(establishmentId, today, futureDateStr);
    } catch (error) {
      return fail(500, errorMessage(error));
    }

    let rateSalesStatusRows: Array<{ category_id: string; date: Date; status: string }> = [];
    try {
      rateSalesStatusRows = await this.prisma.rate_sales_status.findMany({
        where: { establishment_id: establishmentId, date: { gte: utcDate(today), lte: utcDate(futureDateStr) } },
        select: { category_id: true, date: true, status: true },
      });
    } catch (error) {
      this.logger.warn(`[aiosell-sync] rate_sales_status (ARI): ${errorMessage(error)}`);
    }

    const salesStatusByCategoryDate = new Map<string, string>();
    for (const row of rateSalesStatusRows) {
      const d = dateOnly(row.date);
      if (!d) continue;
      salesStatusByCategoryDate.set(`${row.category_id}|${d}`, String(row.status ?? ""));
    }

    let rooms: Array<{ id: string; category_id: string; is_blocked: boolean | null }>;
    let maintenanceTickets: Array<{
      room_id: string;
      maintenance_start_date: Date | null;
      maintenance_end_date: Date | null;
      opened_at: Date | null;
      status: string | null;
    }> = [];
    try {
      rooms = await this.prisma.rooms.findMany({
        where: { establishment_id: establishmentId },
        select: { id: true, category_id: true, is_blocked: true },
      });
    } catch (error) {
      return fail(500, errorMessage(error));
    }

    let reservations: Array<{
      id: string;
      category_id: string;
      checkin_date: string;
      checkout_date: string;
      room_id: string | null;
      status: string;
    }>;
    try {
      const reservationRows = await this.prisma.reservations.findMany({
        where: {
          establishment_id: establishmentId,
          status: {
            in: [
              reservation_status.pending,
              reservation_status.confirmed,
              reservation_status.checkedin,
              reservation_status.blocked,
              reservation_status.noshow,
              reservation_status.preregistration,
            ],
          },
        },
        select: {
          id: true,
          category_id: true,
          checkin_date: true,
          checkout_date: true,
          room_id: true,
          status: true,
        },
      });
      reservations = reservationRows.map((row) => ({
        id: row.id,
        category_id: row.category_id,
        checkin_date: dateOnly(row.checkin_date),
        checkout_date: dateOnly(row.checkout_date),
        room_id: row.room_id,
        status: String(row.status),
      }));
    } catch (error) {
      return fail(500, errorMessage(error));
    }

    try {
      maintenanceTickets = await this.prisma.maintenance_tickets.findMany({
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
      });
    } catch (error) {
      this.logger.warn(`[aiosell-sync] maintenance_tickets: ${errorMessage(error)}`);
    }

    const roomRows = rooms.map((room) => ({
      id: String(room.id),
      category_id: String(room.category_id),
      is_blocked: room.is_blocked,
    }));

    const sellableByCategory = baseSellableRoomsByCategory(roomRows);

    const occupiedByCategoryDate = buildOccupiedRoomsByCategoryDate({
      rooms: roomRows,
      reservations: reservations.map((reservation) => ({
        id: reservation.id,
        category_id: reservation.category_id,
        room_id: reservation.room_id,
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
      windowEndInclusive: futureDateStr,
      keySeparator: "|",
    });

    let channelPricingConfig: Record<string, unknown>[] = [];
    try {
      const pricingRows = await this.prisma.channel_pricing.findMany({
        where: { ota_channel_id: channelId, is_active: true },
      });
      channelPricingConfig = pricingRows.map((row) => toPlain(row) as Record<string, unknown>);
    } catch (error) {
      this.logger.warn(`[aiosell-sync] channel_pricing: ${errorMessage(error)}`);
    }

    const apiUser = channel.api_key;
    const apiPass = channel.api_secret;
    const hotelCodeRaw = channel.aiosell_hotel_code?.trim() || null;
    const hotelCode = hotelCodeRaw ? normalizeChannelCodeInput(hotelCodeRaw) : null;
    if (!apiUser || !apiPass || !hotelCode) {
      return fail(400, "Configure usuário, senha (Basic Auth) e código do hotel Aiosell");
    }

    const baseUrl = channel.aiosell_base_url || "https://live.aiosell.com";
    const inventoryPath = channel.aiosell_inventory_path || "/api/v2/cm/update/sample-pms";
    const ratesPath = channel.aiosell_rates_path || "/api/v2/cm/update-rates/sample-pms";
    const inventoryUrl = joinBaseUrlAndPath(baseUrl, inventoryPath);
    const ratesUrl = joinBaseUrlAndPath(baseUrl, ratesPath);
    const authHeader = basicAuthHeader(apiUser, apiPass);

    const normPlanId = (value: unknown) => (value == null || value === "" ? null : String(value));
    const configHasCompleteAiosellMapping = (cfg: Record<string, unknown> | undefined): boolean => {
      if (!cfg) return false;
      const room = normalizeChannelCodeInput(cfg.channel_room_code);
      const plans = splitAiosellRatePlanCodes(cfg.channel_rate_plan_code).filter((code) => sanitizeAiosellCode(code));
      return !!(room && plans.length > 0);
    };
    const findPricingConfig = (categoryId: string, planId: string | null) => {
      const want = normPlanId(planId);
      const exact = channelPricingConfig.find(
        (row) => row.category_id === categoryId && normPlanId(row.pricing_plan_id) === want,
      );
      const categoryFallback = channelPricingConfig.find(
        (row) => row.category_id === categoryId && normPlanId(row.pricing_plan_id) === null,
      );
      if (exact && configHasCompleteAiosellMapping(exact)) return exact;
      if (categoryFallback && configHasCompleteAiosellMapping(categoryFallback)) return categoryFallback;
      return exact ?? categoryFallback;
    };
    const rowHasCompleteMapping = (rate: Record<string, unknown>): boolean => {
      const cfg = findPricingConfig(rate.category_id as string, (rate.pricing_plan_id as string | null) ?? null);
      const room = normalizeChannelCodeInput(cfg?.channel_room_code);
      const plans = splitAiosellRatePlanCodes(cfg?.channel_rate_plan_code).filter((code) => sanitizeAiosellCode(code));
      return !!(cfg && room && plans.length > 0);
    };

    const skippedUnmappedPairs: string[] = [];
    {
      const seenPair = new Set<string>();
      for (const rate of rateCalendarRowsAll) {
        const categoryId = rate.category_id as string;
        const planId = (rate.pricing_plan_id as string | null) ?? null;
        const key = `${categoryId}\0${planId ?? ""}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        if (rowHasCompleteMapping(rate)) continue;
        const roomCategory = rate.room_categories as Record<string, unknown> | null | undefined;
        const plan = pickPricingPlanRow(rate);
        const catName = (typeof roomCategory?.name === "string" ? roomCategory.name.trim() : "") || categoryId;
        const planLabel = planId
          ? String((plan?.code as string) || (plan?.name as string) || planId).trim() || planId
          : "sem plano";
        skippedUnmappedPairs.push(
          `"${catName}" + plano "${planLabel}" — ignorado (sem mapeamento Aiosell completo em Tarifas por canal).`,
        );
      }
    }

    const rows = rateCalendarRowsAll.filter(rowHasCompleteMapping);
    const tariffCategoryDateKeysAiosell = new Set<string>();
    for (const rate of rateCalendarRowsAll) {
      const categoryId = String(rate.category_id ?? "").trim();
      const date = normalizeCalendarDate(rate.date) ?? String(rate.date).slice(0, 10);
      if (categoryId && date) tariffCategoryDateKeysAiosell.add(`${categoryId}|${date}`);
    }

    if (rateCalendarRowsAll.length > 0 && rows.length === 0) {
      return {
        status: 400,
        body: {
          success: false,
          error:
            "Nenhum par (categoria + plano de tarifa) no intervalo do calendário tem mapeamento Aiosell completo. Preencha Room Code e Rate Plan Code em Tarifas por canal, ou remova essas combinações do calendário tarifário.",
          details: skippedUnmappedPairs.slice(0, 40),
        },
      };
    }

    if (skippedUnmappedPairs.length > 0) {
      this.logWarn("[aiosell-sync] sync_skipped_unmapped_pairs", {
        skipped_pair_count: skippedUnmappedPairs.length,
        samples: skippedUnmappedPairs.slice(0, 15),
        rate_calendar_rows_all: rateCalendarRowsAll.length,
        rate_calendar_rows_synced: rows.length,
      });
    }

    const aiosellListRateOccupancy = clampAiosellListOccupancy(channel.aiosell_list_rate_occupancy);
    const rawOccMode = (process.env.AIOSELL_RATE_OCCUPANCY_MODE ?? "").trim().toLowerCase();
    const aiosellRateOccupancyMode: "list" | "infer" =
      rawOccMode === "infer" || rawOccMode === "infer_from_rateplan" || rawOccMode === "rateplan" ? "infer" : "list";

    let hotelRateSettings: { rate_system_settings: unknown } | null = null;
    try {
      hotelRateSettings = await this.prisma.hotel_settings.findUnique({
        where: { establishment_id: establishmentId },
        select: { rate_system_settings: true },
      });
    } catch (error) {
      this.logger.warn(`[aiosell-sync] hotel_settings: ${errorMessage(error)}`);
    }

    const rawRs =
      hotelRateSettings?.rate_system_settings && typeof hotelRateSettings.rate_system_settings === "object"
        ? (hotelRateSettings.rate_system_settings as Record<string, unknown>)
        : undefined;
    const autoApplyDynamicRules =
      rawRs?.auto_apply_dynamic_rules === true || String(rawRs?.auto_apply_dynamic_rules ?? "").toLowerCase() === "true";
    const persistDynamicRates =
      rawRs?.persist_dynamic_rates === true || String(rawRs?.persist_dynamic_rates ?? "").toLowerCase() === "true";

    const dynamicBarOcc2ByKey = new Map<string, number>();
    let dynamicPersistRowsLoaded = 0;
    let dynamicRpcPrefetchKeys = 0;

    if (autoApplyDynamicRules) {
      if (persistDynamicRates) {
        try {
          const dynRows = await this.prisma.dynamic_pricing_results.findMany({
            where: {
              establishment_id: establishmentId,
              date: { gte: utcDate(today), lte: utcDate(futureDateStr) },
            },
            select: { category_id: true, rate_plan_id: true, date: true, final_price: true },
          });
          for (const row of dynRows) {
            const price = Number(row.final_price);
            if (!Number.isFinite(price) || price <= 0) continue;
            dynamicBarOcc2ByKey.set(dynamicPricingKey(row.category_id, dateOnly(row.date), row.rate_plan_id), price);
          }
          dynamicPersistRowsLoaded = dynamicBarOcc2ByKey.size;
        } catch (error) {
          this.logger.warn(`[aiosell-sync] dynamic_pricing_results (fallback tarifário): ${errorMessage(error)}`);
        }
      } else {
        const uniqueKeys = new Set<string>();
        for (const rate of rows) {
          const planId = rate.pricing_plan_id;
          if (planId == null || planId === "") continue;
          uniqueKeys.add(dynamicPricingKey(rate.category_id as string, rate.date, planId));
        }
        dynamicRpcPrefetchKeys = uniqueKeys.size;
        const keysArr = [...uniqueKeys];
        const rawMax = (process.env.AIOSELL_DYNAMIC_RPC_MAX_KEYS ?? "").trim();
        const parsedMax = parseInt(rawMax, 10);
        const maxKeys = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.min(20_000, parsedMax) : 12_000;
        const limited = keysArr.length > maxKeys ? keysArr.slice(0, maxKeys) : keysArr;
        if (keysArr.length > maxKeys) {
          this.logWarn("[aiosell-sync] dynamic_pricing_rpc_cap", {
            keys_total: keysArr.length,
            keys_prefetched: maxKeys,
            hint:
              "Limite de chamadas calculate_rate_price no sync; ative «Persistir preços dinâmicos» e recalc-rates para usar tabela dynamic_pricing_results (mais rápido) ou aumente AIOSELL_DYNAMIC_RPC_MAX_KEYS.",
          });
        }
        for (let index = 0; index < limited.length; index += RPC_BATCH) {
          const batch = limited.slice(index, index + RPC_BATCH);
          const results = await Promise.all(
            batch.map(async (key) => {
              const [catId, dateStr, planId] = key.split("\0");
              if (!planId) return null;
              const price = await this.calculateRatePrice(establishmentId, catId, planId, dateStr, key);
              return price == null ? null : { key, price };
            }),
          );
          for (const item of results) {
            if (item) dynamicBarOcc2ByKey.set(item.key, item.price);
          }
        }
      }
    }

    this.logInfo("[aiosell-sync] sync_start", {
      ota_channel_id: channelId,
      establishment_id: establishmentId,
      rate_calendar_rows_all: rateCalendarRowsAll.length,
      rate_calendar_rows_synced: rows.length,
      skipped_unmapped_pairs: skippedUnmappedPairs.length,
      aiosell_list_rate_occupancy: aiosellListRateOccupancy,
      aiosell_rate_occupancy_mode: aiosellRateOccupancyMode,
      window_from: today,
      window_to: futureDateStr,
      auto_apply_dynamic_rules: autoApplyDynamicRules,
      persist_dynamic_rates: persistDynamicRates,
      dynamic_pricing_keys_loaded:
        autoApplyDynamicRules && persistDynamicRates
          ? dynamicPersistRowsLoaded
          : autoApplyDynamicRules
            ? dynamicRpcPrefetchKeys
            : 0,
    });

    const resolveRoomAndRateplanCodes = (rate: Record<string, unknown>) => {
      const cfg = findPricingConfig(rate.category_id as string, (rate.pricing_plan_id as string | null) ?? null);
      const roomCode = normalizeChannelCodeInput(cfg?.channel_room_code);
      const rateplanCodes = splitAiosellRatePlanCodes(cfg?.channel_rate_plan_code)
        .map((code) => sanitizeAiosellCode(code))
        .filter(Boolean);
      return { roomCode, rateplanCodes, cfg };
    };

    const rowsByCategoryDate = new Map<string, Record<string, unknown>[]>();
    for (const rate of rows) {
      const key = `${rate.category_id as string}|${String(rate.date)}`;
      const list = rowsByCategoryDate.get(key) ?? [];
      list.push(rate);
      rowsByCategoryDate.set(key, list);
    }

    const categoryDates = new Map<string, Set<string>>();
    for (const rate of rows) {
      const categoryId = rate.category_id as string;
      const dates = categoryDates.get(categoryId) ?? new Set<string>();
      dates.add(rate.date as string);
      categoryDates.set(categoryId, dates);
    }

    const invCombinedByCategory = new Map<string, InvDayCombined[]>();
    categoryDates.forEach((dates, categoryId) => {
      const totalRooms = sellableByCategory.get(categoryId) ?? 0;
      dates.forEach((date) => {
        const occupiedRooms = bookedCountFromOccupiedMap(occupiedByCategoryDate, categoryId, date, "|");
        let available = Math.max(0, totalRooms - occupiedRooms);
        const salesStatus = salesStatusByCategoryDate.get(`${categoryId}|${date}`) ?? null;
        if (isCategoryClosedForOtaChannel(salesStatus)) available = 0;

        const rowGroup = rowsByCategoryDate.get(`${categoryId}|${date}`) ?? [];
        let agg = aggregateRowsToAiosellInvRestrictions(rowGroup);
        if (isCategoryClosedForOtaChannel(salesStatus)) {
          const forced = aiosellRestrictionShape(null, null, false, false, true, null, null);
          agg = agg ? mergeTwoInvRestrictions(agg, forced) : forced;
        }
        const list = invCombinedByCategory.get(categoryId) ?? [];
        list.push({ date, available, restrictions: agg });
        invCombinedByCategory.set(categoryId, list);
      });
    });

    if (tariffCategoryDateKeysAiosell.size > 0) {
      const mappedCategoryIdsForInventory = new Set<string>();
      for (const cfg of channelPricingConfig) {
        if (configHasCompleteAiosellMapping(cfg)) mappedCategoryIdsForInventory.add(cfg.category_id as string);
      }
      const datesInWindow = eachDateInRangeInclusiveAiosell(today, futureDateStr);
      for (const categoryId of mappedCategoryIdsForInventory) {
        for (const date of datesInWindow) {
          if (tariffCategoryDateKeysAiosell.has(`${categoryId}|${date}`)) continue;
          const salesStatus = salesStatusByCategoryDate.get(`${categoryId}|${date}`) ?? null;
          let agg: Record<string, unknown> | null = aiosellRestrictionShape(null, null, false, false, true, null, null);
          if (isCategoryClosedForOtaChannel(salesStatus)) {
            const forced = aiosellRestrictionShape(null, null, false, false, true, null, null);
            agg = agg ? mergeTwoInvRestrictions(agg, forced) : forced;
          }
          const list = invCombinedByCategory.get(categoryId) ?? [];
          list.push({ date, available: 0, restrictions: agg });
          invCombinedByCategory.set(categoryId, list);
        }
      }
    }

    invCombinedByCategory.forEach((days) => {
      days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    });

    const buildInventoryCombinedUpdates = (days: InvDayCombined[], roomCode: string): Record<string, unknown>[] => {
      const code = sanitizeAiosellCode(roomCode);
      if (!code) return [];
      const ranges = buildMergedDateRanges(days, (day) => JSON.stringify({ a: day.available, r: day.restrictions }));
      return ranges.map(({ startDate, endDate, slice }) => {
        const first = slice[0];
        const room: Record<string, unknown> = { available: safeIntNonNegative(first.available), roomCode: code };
        if (first.restrictions) room.restrictions = first.restrictions;
        return { startDate, endDate, rooms: [room] };
      });
    };

    const inventoryCombinedUpdates: Record<string, unknown>[] = [];
    invCombinedByCategory.forEach((days, categoryId) => {
      const sampleRate = rows.find((rate) => rate.category_id === categoryId);
      const rateLike = (sampleRate ?? { category_id: categoryId, pricing_plan_id: null }) as Record<string, unknown>;
      const { roomCode } = resolveRoomAndRateplanCodes(rateLike);
      if (!sanitizeAiosellCode(roomCode)) return;
      inventoryCombinedUpdates.push(...buildInventoryCombinedUpdates(days, roomCode));
    });

    const inventoryCombinedPayload = dedupeInventoryCombinedUpdates(
      mergeAiosellUpdatesByDateRange(inventoryCombinedUpdates, "rooms"),
    );

    const ratesByDate = new Map<string, AiosellRateLine[]>();
    const priceIndex = buildRateCalendarPriceIndex(rateCalendarRowsAll);
    const logAllRates = envFlagTrue("AIOSELL_LOG_RATE_DEBUG");
    let logAllEmitted = 0;
    let suspectPriceEmitted = 0;
    let derivedRecomputedCount = 0;
    let derivedTrustCalendarRows = 0;
    let sentRateEqOneCount = 0;
    const sentRateOneSamples: Record<string, unknown>[] = [];
    let channelPricingFixedPriceLines = 0;
    let channelPricingMultiplierLines = 0;
    let dynamicPricingRowsApplied = 0;
    const MAX_LOG_ALL_RATES = 200;
    const MAX_SUSPECT_PRICE_LOGS = 150;

    for (const rate of rows) {
      const { roomCode, rateplanCodes, cfg } = resolveRoomAndRateplanCodes(rate);
      const planId = (rate.pricing_plan_id as string | null) ?? null;
      if (!roomCode || rateplanCodes.length === 0) continue;

      const derived = resolveEffectiveBasePriceForSync(rate, priceIndex);
      if (derived.trustCalendarOverRecompute) derivedTrustCalendarRows++;
      if (derived.source === "recomputed_from_base_plan") {
        derivedRecomputedCount++;
        if (
          Math.abs(derived.storedBase - derived.effectiveBase) > 0.01 &&
          derived.storedBase <= 2 &&
          derived.basePlanBase != null &&
          derived.basePlanBase > 2
        ) {
          this.logWarn(
            "[aiosell-sync][rate] preço derivado corrigido (DB tinha valor baixo; recalculado a partir do plano base)",
            {
              date: normalizeCalendarDate(rate.date) ?? String(rate.date),
              category_id: rate.category_id,
              pricing_plan_id: planId,
              stored_base_in_db: derived.storedBase,
              base_plan_base: derived.basePlanBase,
              effective_base_used: derived.effectiveBase,
              base_plan_id: derived.basePlanId,
            },
          );
        }
      }

      let effectiveBarOcc2 = derived.effectiveBase;
      let dynamicApplied = false;
      if (autoApplyDynamicRules && planId) {
        const dynBar = dynamicBarOcc2ByKey.get(dynamicPricingKey(rate.category_id as string, rate.date, planId));
        if (dynBar != null && dynBar > 0) {
          effectiveBarOcc2 = dynBar;
          dynamicApplied = true;
        }
      }
      if (dynamicApplied) dynamicPricingRowsApplied++;

      const pricingKind = channelPricingRowKind(cfg ?? null, planId);
      const dateStr = String(rate.date);
      const plan = pickPricingPlanRow(rate);
      const roomCategory = rate.room_categories as Record<string, unknown> | null | undefined;
      const roomCodeClean = sanitizeAiosellCode(roomCode);

      for (let rpcIdx = 0; rpcIdx < rateplanCodes.length; rpcIdx++) {
        const rateplanCode = rateplanCodes[rpcIdx];
        const inferredOcc = inferOccupancyFromAiosellRateplanCode(rateplanCode);
        const occForLine = aiosellRateOccupancyMode === "infer" ? inferredOcc ?? aiosellListRateOccupancy : aiosellListRateOccupancy;
        const pmsListBeforeChannel = pmsListPriceForAiosellOccupancy(rate, effectiveBarOcc2, occForLine);
        const { rounded, breakdown } = computeAiosellRateFromRowAndChannelPricing(
          { ...rate, base_price: pmsListBeforeChannel },
          cfg,
        );
        if (rpcIdx === 0) {
          if (breakdown.step === "fixed_override") channelPricingFixedPriceLines++;
          else if (breakdown.step === "multiplier") channelPricingMultiplierLines++;
        }

        const line: AiosellRateLine = {
          roomCode: roomCodeClean,
          rateplanCode,
          rate: rounded,
          restrictions: effectiveRateRestrictionsForRow(rate),
        };
        if (!line.roomCode || !line.rateplanCode) continue;

        const suspectPrice = rounded <= 0 || Math.abs(rounded - 1) < 0.005;
        if (suspectPrice) {
          sentRateEqOneCount++;
          if (sentRateOneSamples.length < 10) {
            sentRateOneSamples.push({
              date: normalizeCalendarDate(rate.date) ?? dateStr,
              category_id: rate.category_id,
              pricing_plan_id: planId,
              plan_label: plan ? String((plan.code as string) || (plan.name as string) || planId || "") : undefined,
              sent_rate: line.rate,
              trust_calendar_over_recompute: derived.trustCalendarOverRecompute === true,
              derived_base_source: derived.source,
              stored_base_in_db: derived.storedBase,
              pricing_step: breakdown.step,
            });
          }
        }

        const logPayload = {
          tag: "rate_price_line",
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          date: dateStr,
          category_id: rate.category_id,
          pricing_plan_id: planId,
          category_name: typeof roomCategory?.name === "string" ? roomCategory.name : undefined,
          plan_label: plan ? String((plan.code as string) || (plan.name as string) || planId || "") : undefined,
          trust_calendar_over_recompute: derived.trustCalendarOverRecompute === true,
          roomCode: line.roomCode,
          rateplanCode: line.rateplanCode,
          sent_rate: line.rate,
          aiosell_rate_occupancy_mode: aiosellRateOccupancyMode,
          list_occupancy: occForLine,
          list_occupancy_fallback_from_channel: aiosellRateOccupancyMode === "infer" && inferredOcc == null,
          pms_price_after_occupancy_before_channel: pmsListBeforeChannel,
          derived_base_source: derived.source,
          stored_base_in_db: derived.storedBase,
          base_plan_base: derived.basePlanBase,
          effective_base_occ2: effectiveBarOcc2,
          dynamic_pricing_applied: dynamicApplied,
          tariff_bar_occ2_before_dynamic: derived.effectiveBase,
          channel_pricing_match: pricingKind,
          channel_pricing_id: cfg?.id != null ? String(cfg.id) : undefined,
          pricing_step: breakdown.step,
          base_price_raw: breakdown.base_price_raw,
          base_num: breakdown.base_num,
          channel_pricing_fixed_price: breakdown.fixed_price,
          channel_pricing_multiplier: breakdown.price_multiplier,
          computed_before_round: breakdown.computed_before_round,
          reason_if_suspect: suspectPrice ? summarizeRateOneReason(rounded, breakdown, pricingKind) : undefined,
        };
        if (logAllRates && logAllEmitted < MAX_LOG_ALL_RATES) {
          logAllEmitted++;
          this.logInfo("[aiosell-sync][rate]", { ...logPayload, mode: "debug_all" });
        } else if (!logAllRates && suspectPrice && suspectPriceEmitted < MAX_SUSPECT_PRICE_LOGS) {
          suspectPriceEmitted++;
          this.logWarn("[aiosell-sync][rate]", {
            ...logPayload,
            mode: "suspect_price",
            reason: summarizeRateOneReason(rounded, breakdown, pricingKind),
          });
        }

        const list = ratesByDate.get(dateStr) ?? [];
        list.push(line);
        ratesByDate.set(dateStr, list);
      }
    }

    this.logInfo("[aiosell-sync] rate_build_summary", {
      rate_calendar_rows: rows.length,
      rate_calendar_rows_price_index: rateCalendarRowsAll.length,
      price_index_entries: priceIndex.size,
      auto_apply_dynamic_rules: autoApplyDynamicRules,
      persist_dynamic_rates: persistDynamicRates,
      dynamic_pricing_sync_mode: autoApplyDynamicRules
        ? persistDynamicRates
          ? "persisted_results"
          : "rpc_calculate_rate_price"
        : "tariff_only",
      dynamic_pricing_calendar_rows_applied: dynamicPricingRowsApplied,
      derived_prices_recomputed: derivedRecomputedCount,
      derived_trust_calendar_rows: derivedTrustCalendarRows,
      aiosell_list_rate_occupancy: aiosellListRateOccupancy,
      aiosell_rate_occupancy_mode: aiosellRateOccupancyMode,
      suspect_price_lines_logged: suspectPriceEmitted,
      lines_with_sent_rate_zero_or_one: sentRateEqOneCount,
      sample_rates_still_one: sentRateOneSamples,
      channel_pricing_fixed_price_lines: channelPricingFixedPriceLines,
      channel_pricing_multiplier_lines: channelPricingMultiplierLines,
    });

    if (channelPricingFixedPriceLines > 0 || channelPricingMultiplierLines > 0) {
      this.logWarn("[aiosell-sync] channel_pricing_overrides_active", {
        fixed_price_lines: channelPricingFixedPriceLines,
        multiplier_lines: channelPricingMultiplierLines,
        hint:
          "fixed_price ignora o tarifário; price_multiplier ≠ 1 escala o tarifário. " +
          "Multiplicador 1,0 (padrão) equivale ao tarifário — se o CM não muda, verifique API Aiosell ou datas na janela de sync.",
      });
    }
    if (suspectPriceEmitted > 0) {
      this.logger.warn(
        `[aiosell-sync][rate] ${suspectPriceEmitted} linha(s) com preço 0 ou ~1 (detalhe nos logs [aiosell-sync][rate] acima). ` +
          `Secret AIOSELL_LOG_RATE_DEBUG=1 lista até ${MAX_LOG_ALL_RATES} linhas por execução.`,
      );
    }

    ratesByDate.forEach((lines) => {
      lines.sort((a, b) => `${a.roomCode}\0${a.rateplanCode}`.localeCompare(`${b.roomCode}\0${b.rateplanCode}`));
    });

    const sortedRateDates = [...ratesByDate.keys()].sort();
    const rateUpdates: { startDate: string; endDate: string; rates: AiosellRateLine[] }[] = [];
    let rateIndex = 0;
    while (rateIndex < sortedRateDates.length) {
      const snapshot = JSON.stringify(ratesByDate.get(sortedRateDates[rateIndex])!);
      let next = rateIndex + 1;
      while (
        next < sortedRateDates.length &&
        JSON.stringify(ratesByDate.get(sortedRateDates[next])!) === snapshot &&
        isNextDay(sortedRateDates[next - 1], sortedRateDates[next])
      ) {
        next++;
      }
      rateUpdates.push({
        startDate: sortedRateDates[rateIndex],
        endDate: sortedRateDates[next - 1],
        rates: ratesByDate.get(sortedRateDates[rateIndex])!,
      });
      rateIndex = next;
    }

    const rateUpdatesPayload = dedupeRatePriceUpdates(
      mergeAiosellUpdatesByDateRange(rateUpdates as unknown as Record<string, unknown>[], "rates"),
    );
    const rateLineCount = rateUpdates.reduce((acc, update) => acc + update.rates.length, 0);
    const syncedRatePairs = collectRatePairsFromPayload(rateUpdatesPayload);
    const inventoryRoomCodesSent = collectInventoryRoomCodesFromPayload(inventoryCombinedPayload);
    const uniqueRoomCodesFromPayload = [...new Set(syncedRatePairs.map((pair) => pair.roomCode))].sort();
    const uniqueRateplanCodesFromPayload = [...new Set(syncedRatePairs.map((pair) => pair.rateplanCode))].sort();
    const mappingSemanticsWarning = aiosellMappingSemanticsWarning(uniqueRoomCodesFromPayload, uniqueRateplanCodesFromPayload);

    const SYNC_LOG_MAX_PAIRS = 150;
    this.logInfo("[aiosell-sync] sync_mapping_coverage", {
      doc: "Aiosell PMS→CM: POST update-rates com hotelCode + updates[].rates[] (roomCode, rateplanCode, rate, restrictions); inventário com updates[].rooms[].roomCode.",
      unique_rate_pairs: syncedRatePairs.length,
      rate_pairs: syncedRatePairs.length > SYNC_LOG_MAX_PAIRS ? syncedRatePairs.slice(0, SYNC_LOG_MAX_PAIRS) : syncedRatePairs,
      rate_pairs_truncated: syncedRatePairs.length > SYNC_LOG_MAX_PAIRS,
      unique_room_codes: uniqueRoomCodesFromPayload,
      unique_rateplan_codes: uniqueRateplanCodesFromPayload,
      inventory_room_codes: inventoryRoomCodesSent,
      mapping_semantics_warning: mappingSemanticsWarning,
    });
    if (mappingSemanticsWarning) this.logger.warn(`[aiosell-sync] sync_mapping_semantics ${mappingSemanticsWarning}`);

    try {
      await this.prisma.ota_channels.update({
        where: { id: channelId },
        data: { sync_status: "syncing", last_sync_at: new Date() },
      });

      if (inventoryCombinedPayload.length === 0 && rateUpdatesPayload.length === 0) {
        const emptyError = `Não há dados no rate_calendar para sincronizar (próximos ${SYNC_DAYS_AHEAD} dias). Verifique tarifas e categorias.`;
        await this.prisma.ota_channels.update({
          where: { id: channelId },
          data: { sync_status: "error", sync_error: emptyError },
        });
        return fail(400, emptyError);
      }

      const aiosellApiMessages: string[] = [];
      let aiosellRatePostMessage: string | undefined;
      let aiosellRatePostAckOnly = false;
      let aiosellRatesPostRequests = 0;
      let aiosellRatesUpdateChunkSizeUsed = 0;

      const rawInvChunk = (process.env.AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE ?? "").trim();
      const parsedInvChunk = parseInt(rawInvChunk, 10);
      const inventoryChunkSize = Number.isFinite(parsedInvChunk) && parsedInvChunk > 0 ? Math.min(100, parsedInvChunk) : 15;

      const rawRatesChunk = (process.env.AIOSELL_RATES_UPDATE_CHUNK_SIZE ?? "").trim();
      const parsedRatesChunk = parseInt(rawRatesChunk, 10);
      const ratesChunkSize =
        Number.isFinite(parsedRatesChunk) && parsedRatesChunk > 0 ? Math.min(120, Math.max(1, parsedRatesChunk)) : 40;

      const skipInventoryAvailability = envFlagTrue("AIOSELL_SKIP_INVENTORY_AVAILABILITY");
      if (skipInventoryAvailability && inventoryCombinedPayload.length > 0) {
        this.logger.warn(
          "[aiosell-sync] AIOSELL_SKIP_INVENTORY_AVAILABILITY ativo — não enviando inventário (disponibilidade + restrições) à Aiosell.",
        );
      }

      if (rateUpdatesPayload.length > 0) {
        const rateChunksTotal = Math.ceil(rateUpdatesPayload.length / ratesChunkSize);
        const rateMsgs: string[] = [];
        for (let offset = 0; offset < rateUpdatesPayload.length; offset += ratesChunkSize) {
          const chunk = rateUpdatesPayload.slice(offset, offset + ratesChunkSize);
          const label =
            rateChunksTotal > 1
              ? `Aiosell tarifas (preço + restrições) lote ${Math.floor(offset / ratesChunkSize) + 1}/${rateChunksTotal}`
              : "Aiosell tarifas (preço + restrições)";
          const posted = await this.postToAiosell(channelId, ratesUrl, authHeader, { hotelCode, updates: chunk }, label);
          if (!posted.ok) return fail(502, posted.msg);
          if (posted.aiosellMessage) rateMsgs.push(posted.aiosellMessage);
          let ratesHost: string | null = null;
          try {
            ratesHost = new URL(ratesUrl).host;
          } catch {
            ratesHost = null;
          }
          this.logInfo("[aiosell-sync] aiosell_rate_post_ok", {
            hotelCode,
            rates_path: ratesPath,
            rates_url_host: ratesHost,
            http_ok: true,
            api_message: posted.aiosellMessage ?? null,
            sample_pms_path: pathLooksLikeAiosellSamplePms(ratesPath),
            chunk_index: rateChunksTotal > 1 ? Math.floor(offset / ratesChunkSize) + 1 : null,
            chunk_of: rateChunksTotal > 1 ? rateChunksTotal : null,
            updates_blocks_in_chunk: chunk.length,
          });
          if (!(posted.aiosellMessage ?? "").trim()) aiosellRatePostAckOnly = true;
        }
        aiosellRatePostMessage = rateMsgs.length > 0 ? rateMsgs.join(" · ") : undefined;
        if (rateMsgs.length > 0) aiosellApiMessages.push(`Tarifas: ${rateMsgs.join(" · ")}`);
        if (rateChunksTotal > 1) {
          this.logInfo("[aiosell-sync] aiosell_rate_post_chunks_done", {
            total_update_blocks: rateUpdatesPayload.length,
            chunk_size: ratesChunkSize,
            requests_sent: rateChunksTotal,
          });
        }
        if (aiosellRatePostAckOnly) {
          this.logWarn("[aiosell-sync] aiosell_rate_post_ack_only", {
            api_messages_sample: rateMsgs.slice(0, 3),
            rate_chunks: rateChunksTotal,
            hint:
              "A resposta só confirma receção do pedido. A atualização visível no Channel Manager pode demorar ou depender de processamento na Aiosell — se o tarifário não refletir as alterações, confirme com o suporte Aiosell.",
          });
        }
        aiosellRatesPostRequests = rateChunksTotal;
        aiosellRatesUpdateChunkSizeUsed = ratesChunkSize;
        if (pathLooksLikeAiosellSamplePms(ratesPath)) {
          this.logWarn("[aiosell-sync] sample_pms_path_rates", {
            hint:
              "O path de tarifas contém «sample-pms» (exemplo da documentação). A API pode responder HTTP 200 mas o painel Aiosell do hotel em produção pode não refletir alterações. Peça à Aiosell o path de produção do endpoint update-rates e configure em Channel Manager → Editar canal → Path de tarifas.",
            ratesPath,
          });
        }
      }

      const inventoryParseHints = [
        "Cada roomCode no inventário tem de existir como tipo de quarto no Channel Manager Aiosell para este hotel; combinações que o CM não reconhece podem devolver «Payload Parsing Failed».",
        "Confirme no PMS o separador «Mapeamento Aiosell»: Room Code e Rate Plan Code têm de coincidir com o painel CM (não use códigos de outro hotel ou de tipos ainda não criados no CM).",
        "Secret opcional AIOSELL_SKIP_INVENTORY_AVAILABILITY=1: sincroniza só tarifas sem POST de inventário, útil enquanto valida o mapeamento com o suporte Aiosell.",
      ];

      if (!skipInventoryAvailability && inventoryCombinedPayload.length > 0) {
        const totalChunks = Math.ceil(inventoryCombinedPayload.length / inventoryChunkSize);
        const inventoryMsgs: string[] = [];
        for (let offset = 0; offset < inventoryCombinedPayload.length; offset += inventoryChunkSize) {
          const chunk = inventoryCombinedPayload.slice(offset, offset + inventoryChunkSize);
          const label =
            totalChunks > 1
              ? `Aiosell inventário (disponibilidade + restrições) lote ${Math.floor(offset / inventoryChunkSize) + 1}/${totalChunks}`
              : "Aiosell inventário (disponibilidade + restrições)";
          const posted = await this.postToAiosell(channelId, inventoryUrl, authHeader, { hotelCode, updates: chunk }, label);
          if (!posted.ok) return { status: 502, body: { success: false, error: posted.msg, details: inventoryParseHints } };
          if (posted.aiosellMessage) inventoryMsgs.push(posted.aiosellMessage);
          const inventoryAck = (posted.aiosellMessage ?? "").trim();
          if (inventoryAck) {
            const inventoryAccepted =
              /inventory updated successfully/i.test(inventoryAck) ||
              /request received successfully/i.test(inventoryAck) ||
              /received successfully/i.test(inventoryAck);
            this.logInfo("[aiosell-sync] aiosell_inventory_post_ok", {
              hotelCode,
              inventory_path: inventoryPath,
              http_ok: true,
              api_message: inventoryAck,
              inventory_accepted: inventoryAccepted,
              chunk_index: totalChunks > 1 ? Math.floor(offset / inventoryChunkSize) + 1 : null,
              chunk_of: totalChunks > 1 ? totalChunks : null,
            });
          }
        }
        if (inventoryMsgs.length > 0) aiosellApiMessages.push(`Inventário: ${inventoryMsgs.join(" · ")}`);
      }

      let updatedChannel;
      try {
        updatedChannel = await this.prisma.ota_channels.update({
          where: { id: channelId },
          data: { last_sync_at: new Date(), sync_status: "success", sync_error: null },
        });
      } catch (error) {
        return fail(500, errorMessage(error));
      }

      const dynamicPricingSyncMode = autoApplyDynamicRules
        ? persistDynamicRates
          ? "persisted_results"
          : "rpc_calculate_rate_price"
        : "tariff_only";

      return {
        status: 200,
        body: {
          success: true,
          inventoryCombinedBlocks: inventoryCombinedPayload.length,
          rateRows: rateLineCount,
          rateUpdateBlocks: rateUpdatesPayload.length,
          ratesIncludeRestrictionsPerLine: true,
          syncDaysAhead: SYNC_DAYS_AHEAD,
          syncedRatePairs,
          syncedRatePairsCount: syncedRatePairs.length,
          inventoryRoomCodesSent,
          aiosellApiMessages,
          syncHints: {
            hotelCode,
            establishmentId,
            rateCalendarRows: rows.length,
            rateCalendarRowsAll: rateCalendarRowsAll.length,
            skippedUnmappedPairCount: skippedUnmappedPairs.length,
            skippedUnmappedPairDetails: skippedUnmappedPairs.length > 0 ? skippedUnmappedPairs.slice(0, 40) : [],
            rateSalesStatusRows: rateSalesStatusRows.length,
            inventoryPath,
            ratesPath,
            roomCodesSent: uniqueRoomCodesFromPayload,
            rateplanCodesSent: uniqueRateplanCodesFromPayload,
            mappingSemanticsWarning,
            aiosellListRateOccupancy,
            aiosellRateOccupancyMode: aiosellRateOccupancyMode === "infer" ? "infer_from_rateplan_code" : "list_column_only",
            channelPricingFixedPriceLineCount: channelPricingFixedPriceLines,
            channelPricingMultiplierLineCount: channelPricingMultiplierLines,
            aiosellSamplePmsPathRates: pathLooksLikeAiosellSamplePms(ratesPath),
            aiosellSamplePmsPathInventory: pathLooksLikeAiosellSamplePms(inventoryPath),
            aiosellRatePostMessage: aiosellRatePostMessage ?? null,
            aiosellRatePostAckOnly,
            aiosellRatesPostRequests,
            aiosellRatesUpdateChunkSizeUsed,
            autoApplyDynamicRules,
            persistDynamicRates,
            dynamicPricingSyncMode,
            dynamicPricingRowsApplied,
          },
          ratePriceDiagnostics: {
            autoApplyDynamicRules,
            persistDynamicRates,
            dynamicPricingSyncMode,
            dynamicPricingRowsApplied,
            derivedPricesRecomputed: derivedRecomputedCount,
            derivedTrustCalendarRows,
            linesWithSentRateZeroOrOne: sentRateEqOneCount,
            samples: sentRateOneSamples,
            channelPricingFixedPriceLineCount: channelPricingFixedPriceLines,
            channelPricingMultiplierLineCount: channelPricingMultiplierLines,
            logsHint:
              "Logs: procure sync_start, rate_build_summary, channel_pricing_overrides_active e [aiosell-sync][rate] (Supabase → Edge Functions → aiosell-sync → Logs).",
          },
          channel: toPlain(updatedChannel),
        },
      };
    } catch (error) {
      const message = errorMessage(error);
      await this.prisma.ota_channels
        .update({ where: { id: channelId }, data: { sync_status: "error", sync_error: message } })
        .catch(() => undefined);
      return fail(500, message);
    }
  }

  private internalBearer(authorization: string | undefined): boolean {
    const bearer = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return false;
    const internal = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return (internal.length > 0 && bearer === internal) || (serviceRole.length > 0 && bearer === serviceRole);
  }

  private async loadRateCalendar(establishmentId: string, today: string, futureDateStr: string) {
    const all: Record<string, unknown>[] = [];
    const gte = utcDate(today);
    const lte = utcDate(futureDateStr);
    let offset = 0;
    for (;;) {
      const batch = await this.prisma.rate_calendar.findMany({
        where: { establishment_id: establishmentId, date: { gte, lte } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        include: { pricing_plans: true, room_categories: true },
        skip: offset,
        take: RATE_CALENDAR_PAGE_SIZE_AI,
      });
      for (const row of batch) {
        const plain = toPlain(row) as Record<string, unknown>;
        plain.date = dateOnly(row.date);
        all.push(plain);
      }
      if (batch.length < RATE_CALENDAR_PAGE_SIZE_AI) break;
      offset += RATE_CALENDAR_PAGE_SIZE_AI;
    }
    return all;
  }

  /** BAR x2 via public.calculate_rate_price. A failed call does not invent a price. */
  private async calculateRatePrice(
    establishmentId: string,
    categoryId: string,
    planId: string,
    date: string,
    key: string,
  ): Promise<number | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ price: unknown }>>`
        SELECT public.calculate_rate_price(
          ${establishmentId}::uuid,
          ${categoryId}::uuid,
          ${planId}::uuid,
          ${date}::date,
          2::int,
          0::int
        ) AS price
      `;
      const price = Number(rows[0]?.price ?? 0);
      if (!Number.isFinite(price) || price <= 0) return null;
      return price;
    } catch (error) {
      this.logger.warn(`[aiosell-sync] calculate_rate_price: ${errorMessage(error)} ${key}`);
      return null;
    }
  }

  private async postToAiosell(
    channelId: string,
    url: string,
    authHeader: string,
    payload: Record<string, unknown>,
    label: string,
  ): Promise<{ ok: true; aiosellMessage?: string; acceptedDespiteHttpError?: boolean } | { ok: false; msg: string }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(payload),
    });
    const text = (await res.text().catch(() => "")).trim();
    let parsed: Record<string, unknown> | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
    const parsedMessage = parsed && typeof parsed.message === "string" ? parsed.message.trim() : "";
    const acceptedDespiteHttpError =
      !res.ok && parsed?.success === true && /^request received successfully\.?$/i.test(parsedMessage);

    if (!res.ok && !acceptedDespiteHttpError) {
      const msg = `${label} (HTTP ${res.status}): ${text || res.statusText}`;
      await this.prisma.ota_channels.update({ where: { id: channelId }, data: { sync_status: "error", sync_error: msg } });
      return { ok: false, msg };
    }
    if (parsed && typeof parsed.success === "boolean" && parsed.success === false) {
      const detail =
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.error === "string" && parsed.error) ||
        text ||
        "success=false";
      const msg = `${label}: ${detail}`;
      await this.prisma.ota_channels.update({ where: { id: channelId }, data: { sync_status: "error", sync_error: msg } });
      return { ok: false, msg };
    }
    if (acceptedDespiteHttpError) {
      this.logWarn("[aiosell-sync] aiosell_http_error_but_acknowledged", {
        label,
        status: res.status,
        statusText: res.statusText,
        message: parsedMessage || null,
        hint:
          "Aiosell respondeu HTTP não-2xx, mas com payload de ACK (success=true, Request Received Successfully). O sync segue como aceite para evitar falso negativo no PMS.",
      });
    }
    return { ok: true, aiosellMessage: parsedMessage || undefined, acceptedDespiteHttpError };
  }

  private logInfo(message: string, payload: unknown) {
    this.logger.log(`${message} ${JSON.stringify(payload)}`);
  }

  private logWarn(message: string, payload: unknown) {
    this.logger.warn(`${message} ${JSON.stringify(payload)}`);
  }
}

function fail(status: number, error: string): Result {
  return { status, body: { success: false, error } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match ? match[1] : String(value ?? "").slice(0, 10);
}

function toPlain(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    if (Prisma.Decimal.isDecimal(value)) return Number(value);
    if (Array.isArray(value)) return value.map((item) => toPlain(item));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = toPlain(item);
    return out;
  }
  return value;
}

function envFlagTrue(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function splitAiosellRatePlanCodes(raw: unknown): string[] {
  const source = String(raw ?? "").replace(/\u00a0/g, " ");
  if (!source.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of source.split(/[,;\n\r]+/)) {
    const token = part.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function pathLooksLikeAiosellSamplePms(path: string): boolean {
  return path.toLowerCase().includes("sample-pms");
}

function computeAiosellRateFromRowAndChannelPricing(
  rate: Record<string, unknown>,
  cfg: Record<string, unknown> | null | undefined,
): {
  rounded: number;
  breakdown: {
    step: "base_only" | "fixed_override" | "multiplier";
    base_price_raw: unknown;
    base_num: number;
    fixed_price: unknown;
    price_multiplier: unknown;
    computed_before_round: number;
  };
} {
  const baseRaw = rate.base_price;
  const baseNum = Number(baseRaw);
  const baseOk = Number.isFinite(baseNum) ? baseNum : 0;
  let finalPrice = baseOk;
  const breakdown: {
    step: "base_only" | "fixed_override" | "multiplier";
    base_price_raw: unknown;
    base_num: number;
    fixed_price: unknown;
    price_multiplier: unknown;
    computed_before_round: number;
  } = {
    step: "base_only",
    base_price_raw: baseRaw,
    base_num: baseOk,
    fixed_price: null,
    price_multiplier: null,
    computed_before_round: baseOk,
  };

  if (cfg) {
    if (cfg.fixed_price != null && cfg.fixed_price !== "") {
      breakdown.fixed_price = cfg.fixed_price;
      breakdown.step = "fixed_override";
      finalPrice = Number(cfg.fixed_price);
      breakdown.computed_before_round = finalPrice;
    } else if (cfg.price_multiplier != null && cfg.price_multiplier !== "") {
      const mult = Number(cfg.price_multiplier);
      if (!Number.isFinite(mult) || mult <= 0 || Math.abs(mult - 1) < 1e-6) {
        breakdown.step = "base_only";
        finalPrice = baseOk;
        breakdown.computed_before_round = baseOk;
      } else {
        breakdown.price_multiplier = cfg.price_multiplier;
        breakdown.step = "multiplier";
        finalPrice = baseOk * mult;
        breakdown.computed_before_round = finalPrice;
      }
    }
  }

  const rounded = Number.isFinite(Math.round(finalPrice * 100) / 100) ? Math.round(finalPrice * 100) / 100 : 0;
  return { rounded, breakdown };
}

function normPlanIdForPricing(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function channelPricingRowKind(
  cfg: Record<string, unknown> | null | undefined,
  planId: string | null,
): "exact" | "category_fallback" | "none" {
  if (!cfg) return "none";
  const cfgPid = normPlanIdForPricing(cfg.pricing_plan_id);
  const want = normPlanIdForPricing(planId);
  if (cfgPid === want) return "exact";
  if (cfgPid === null && want !== null) return "category_fallback";
  return "exact";
}

function summarizeRateOneReason(
  rounded: number,
  breakdown: ReturnType<typeof computeAiosellRateFromRowAndChannelPricing>["breakdown"],
  pricingKind: "exact" | "category_fallback" | "none",
): string {
  if (rounded <= 0) {
    return `Preço final ${rounded}: step=${breakdown.step}; base_price=${JSON.stringify(breakdown.base_price_raw)}. Verifique calendário e, em Tarifas por canal, fixed_price ou multiplier.`;
  }
  if (breakdown.step === "fixed_override") {
    return `Preço veio de channel_pricing.fixed_price=${JSON.stringify(breakdown.fixed_price)} (substitui rate_calendar.base_price). Ver tabela channel_pricing / Tarifas por canal.`;
  }
  if (breakdown.step === "multiplier") {
    return `Preço = base_price(${breakdown.base_num}) × price_multiplier(${JSON.stringify(breakdown.price_multiplier)}) = ${rounded}. Ajuste multiplicador ou base no calendário.`;
  }
  if (Math.abs(rounded - 1) < 0.005) {
    return `Preço = apenas rate_calendar.base_price (${JSON.stringify(breakdown.base_price_raw)}). channel_pricing: ${pricingKind}. Corrija o preço no tarifário para esta data/plano.`;
  }
  return `step=${breakdown.step} base=${breakdown.base_num}`;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function joinBaseUrlAndPath(base: string, path: string): string {
  const trimmedBase = (base || "").trim().replace(/\/$/, "");
  let trimmedPath = (path ?? "").trim();
  if (!trimmedPath.startsWith("/")) trimmedPath = `/${trimmedPath}`;
  try {
    if (/^\/api\/v2\/cm\//i.test(trimmedPath)) return `${new URL(trimmedBase).origin}${trimmedPath}`;
  } catch {
    /* base inválida — continuar com concatenação simples */
  }
  if (/\/cm$/i.test(trimmedBase) && /^\/cm(\/|$)/i.test(trimmedPath)) {
    trimmedPath = trimmedPath.replace(/^\/cm/i, "");
    if (!trimmedPath.startsWith("/")) trimmedPath = `/${trimmedPath}`;
  }
  return `${trimmedBase}${trimmedPath}`.replace(/(\/cm)\/cm(\/)/gi, "$1$2");
}

function addDaysIso(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function isNextDay(prev: string, next: string): boolean {
  return addDaysIso(prev, 1) === next;
}

function normalizeCalendarDate(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match ? match[1] : null;
}

function eachDateInRangeInclusiveAiosell(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function buildRateCalendarPriceIndex(rows: Record<string, unknown>[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of rows) {
    const categoryId = String(row.category_id ?? "").trim();
    const planRaw = row.pricing_plan_id;
    if (!categoryId || planRaw == null || planRaw === "") continue;
    const date = normalizeCalendarDate(row.date) ?? String(row.date).slice(0, 10);
    const base = Number(row.base_price);
    index.set(`${categoryId}|${date}|${String(planRaw).trim()}`, Number.isFinite(base) ? base : 0);
  }
  return index;
}

function pickPricingPlanRow(rate: Record<string, unknown>): Record<string, unknown> | null {
  const raw = rate.pricing_plans;
  const planId = rate.pricing_plan_id != null ? String(rate.pricing_plan_id).trim() : "";
  if (Array.isArray(raw)) {
    if (planId) {
      const hit = raw.find((plan) => String((plan as Record<string, unknown>).id ?? "") === planId);
      if (hit) return hit as Record<string, unknown>;
    }
    return (raw[0] as Record<string, unknown>) ?? null;
  }
  return (raw as Record<string, unknown>) ?? null;
}

function resolveEffectiveBasePriceForSync(rate: Record<string, unknown>, priceIndex: Map<string, number>): DerivedBaseResolve {
  const categoryId = String(rate.category_id ?? "").trim();
  const date = normalizeCalendarDate(rate.date) ?? String(rate.date).slice(0, 10);
  const storedBase = Number.isFinite(Number(rate.base_price)) ? Number(rate.base_price) : 0;
  const plan = pickPricingPlanRow(rate);
  const basePlanId = plan?.base_plan_id_for_rate != null ? String(plan.base_plan_id_for_rate) : null;
  const fluctuationType = plan?.fluctuation_type == null ? null : String(plan.fluctuation_type).trim().toLowerCase();
  const fluctuationValue = plan?.fluctuation_value;

  if (!basePlanId || fluctuationValue == null || fluctuationValue === "") {
    return { effectiveBase: storedBase, source: "stored", storedBase, basePlanBase: null, basePlanId: null };
  }
  if (fluctuationType !== "percentage" && fluctuationType !== "fixed") {
    return { effectiveBase: storedBase, source: "stored", storedBase, basePlanBase: null, basePlanId };
  }

  const basePlanBase = priceIndex.get(`${categoryId}|${date}|${String(basePlanId).trim()}`) ?? 0;
  if (basePlanBase <= 0) {
    return { effectiveBase: storedBase, source: "stored", storedBase, basePlanBase: basePlanBase || null, basePlanId };
  }

  let recomputed = basePlanBase;
  if (fluctuationType === "percentage") recomputed = basePlanBase * (1 + Number(fluctuationValue) / 100);
  else if (fluctuationType === "fixed") recomputed = basePlanBase + Number(fluctuationValue);
  recomputed = Math.round(Math.max(0, recomputed) * 100) / 100;

  if (!envFlagTrue("AIOSELL_RECOMPUTE_DERIVED_FROM_BASE_PLAN") && storedBase > 2) {
    return {
      effectiveBase: storedBase,
      source: "stored",
      storedBase,
      basePlanBase,
      basePlanId,
      trustCalendarOverRecompute: true,
    };
  }
  return {
    effectiveBase: recomputed,
    source: "recomputed_from_base_plan",
    storedBase,
    basePlanBase,
    basePlanId,
    trustCalendarOverRecompute: false,
  };
}

function clampAiosellListOccupancy(raw: unknown): Occ {
  const value = Math.floor(Number(raw));
  if (Number.isFinite(value) && value >= 1 && value <= 4) return value as Occ;
  return 2;
}

function inferOccupancyFromAiosellRateplanCode(rateplanCode: string): Occ | null {
  const match = sanitizeAiosellCode(rateplanCode).toLowerCase().match(/-([sdqt])-(?:ep|cp|ro|bb|rb)/);
  if (!match) return null;
  switch (match[1]) {
    case "s":
      return 1;
    case "d":
      return 2;
    case "t":
      return 3;
    case "q":
      return 4;
    default:
      return null;
  }
}

function pmsListPriceForAiosellOccupancy(rate: Record<string, unknown>, effectiveBarOcc2: number, occupancy: Occ): number {
  const basePrice = Number.isFinite(effectiveBarOcc2) ? effectiveBarOcc2 : 0;
  const adultPrice = Number.isFinite(Number(rate.adult_price)) ? Number(rate.adult_price) : 0;
  let baseCalculated = basePrice;
  if (occupancy === 1) baseCalculated = Math.max(0, basePrice - adultPrice);
  else if (occupancy === 3) baseCalculated = basePrice + adultPrice;
  else if (occupancy === 4) baseCalculated = basePrice + adultPrice * 2;

  let finalPrice = baseCalculated;
  const applyFluctuation = (typeKey: string, valueKey: string) => {
    const type = rate[typeKey];
    const value = rate[valueKey];
    if ((type === "fixed" || type === "percentage") && value != null && value !== "" && !Number.isNaN(Number(value))) {
      const amount = Number(value);
      finalPrice = type === "percentage" ? baseCalculated * (1 + amount / 100) : baseCalculated + amount;
    }
  };
  if (occupancy === 1) applyFluctuation("occupancy_1_fluctuation_type", "occupancy_1_fluctuation_value");
  else if (occupancy === 3) applyFluctuation("occupancy_3_fluctuation_type", "occupancy_3_fluctuation_value");
  else if (occupancy === 4) applyFluctuation("occupancy_4_fluctuation_type", "occupancy_4_fluctuation_value");
  return Math.max(0, Math.round(finalPrice * 100) / 100);
}

function safeIntNonNegative(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function sanitizeAiosellCode(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function normalizeChannelCodeInput(value: unknown): string {
  return sanitizeAiosellCode(String(value ?? "").replace(/\u00a0/g, " ").trim());
}

function collectRatePairsFromPayload(updates: Record<string, unknown>[]): { roomCode: string; rateplanCode: string }[] {
  const seen = new Set<string>();
  const pairs: { roomCode: string; rateplanCode: string }[] = [];
  for (const update of updates) {
    for (const line of (update.rates as Record<string, unknown>[]) || []) {
      const roomCode = sanitizeAiosellCode(String(line.roomCode ?? ""));
      const rateplanCode = sanitizeAiosellCode(String(line.rateplanCode ?? ""));
      if (!roomCode || !rateplanCode) continue;
      const key = `${roomCode}\0${rateplanCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ roomCode, rateplanCode });
    }
  }
  pairs.sort((a, b) => `${a.roomCode}\0${a.rateplanCode}`.localeCompare(`${b.roomCode}\0${b.rateplanCode}`));
  return pairs;
}

function collectInventoryRoomCodesFromPayload(updates: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const update of updates) {
    for (const room of (update.rooms as Record<string, unknown>[]) || []) {
      const code = sanitizeAiosellCode(String(room.roomCode ?? ""));
      if (code) seen.add(code);
    }
  }
  return [...seen].sort();
}

function looksLikePmsPlanLabelUsedAsRoomCode(roomCode: string): boolean {
  const normalized = roomCode.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "-");
  return normalized === "reembolsavel" || normalized === "nao-reembolsavel" || normalized === "teste";
}

function looksLikeCmRatePlanId(rateplanCode: string): boolean {
  const token = rateplanCode.toLowerCase();
  return /-(s|d|t|q|bb|ep|ro|rb)(?:$|-)/.test(token) || /^(deluxe|executivo|standard)-/.test(token);
}

function aiosellMappingSemanticsWarning(roomCodes: string[], rateplanCodes: string[]): string | null {
  if (rateplanCodes.length === 0) return null;
  if (!roomCodes.some(looksLikePmsPlanLabelUsedAsRoomCode)) return null;
  if (!rateplanCodes.some(looksLikeCmRatePlanId)) return null;
  return (
    "Algum roomCode no payload parece nome de plano PMS (ex. nao-reembolsavel) e rateplanCode parece ID do CM " +
    "(ex. deluxe-s-ep). Na API Aiosell, roomCode deve ser o tipo de quarto no CM (deluxe, executivo, standard) " +
    "e rateplanCode o plano de tarifa no CM. Corrija em Tarifas por canal / Mapeamento Aiosell."
  );
}

function isCategoryClosedForOtaChannel(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "closed" || value === "restricted_ota" || value === "restricted_all";
}

function isPlanTariffClosedInCalendar(row: Record<string, unknown>): boolean {
  const value = String(row.sales_status ?? "").trim().toLowerCase();
  return value === "closed" || value === "no_price";
}

function aiosellRestrictionShape(
  minStay: number | null,
  maxStay: number | null,
  closeOnArrival: boolean,
  closeOnDeparture: boolean,
  stopSell: boolean,
  minAdvanceDays: number | null = null,
  maxAdvanceDays: number | null = null,
): Record<string, unknown> {
  const minStayOut = minStay != null && Number.isFinite(Number(minStay)) && Number(minStay) >= 1 ? Math.floor(Number(minStay)) : null;
  const minAdv = minAdvanceDays != null && Number(minAdvanceDays) > 0 ? Math.floor(Number(minAdvanceDays)) : null;
  const maxAdv = maxAdvanceDays != null && Number(maxAdvanceDays) > 0 ? Math.floor(Number(maxAdvanceDays)) : null;
  const maxStayVal = maxStay != null && Number.isFinite(Number(maxStay)) ? Number(maxStay) : null;
  return {
    stopSell,
    exactStayArrival: null,
    maximumStayArrival: null,
    minimumAdvanceReservation: minAdv,
    minimumStay: minStayOut,
    closeOnArrival,
    minimumStayArrival: null,
    maximumStay: maxStayVal,
    maximumAdvanceReservation: maxAdv,
    closeOnDeparture,
  };
}

function aggregateRowsToAiosellInvRestrictions(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  let minStay: number | null = null;
  let maxStay: number | null = null;
  let closeOnArrival = false;
  let closeOnDeparture = false;
  let stopSell = false;
  let minAdvanceAgg: number | null = null;
  let maxAdvanceAgg: number | null = null;
  let hasAny = false;
  for (const row of rows) {
    const min = row.min_stay ?? row.min_los;
    const max = row.max_stay ?? row.max_los;
    const closedToArrival = row.closed_to_arrival ?? row.cta;
    const closedToDeparture = row.closed_to_departure ?? row.ctd;
    const stop = row.stop_sell_ota;
    const minAdvance = row.min_advance_days ?? row.min_advance_reservation;
    const maxAdvance = row.max_advance_days ?? row.max_advance_reservation;
    if (min != null && Number(min) >= 1) {
      const value = Math.floor(Number(min));
      minStay = minStay == null ? value : Math.max(minStay, value);
      hasAny = true;
    }
    if (max != null) {
      const value = Number(max);
      maxStay = maxStay === null ? value : Math.min(maxStay, value);
      hasAny = true;
    }
    if (closedToArrival) {
      closeOnArrival = true;
      hasAny = true;
    }
    if (closedToDeparture) {
      closeOnDeparture = true;
      hasAny = true;
    }
    if (stop) {
      stopSell = true;
      hasAny = true;
    }
    if (minAdvance != null && Number(minAdvance) > 0) {
      const value = Math.floor(Number(minAdvance));
      minAdvanceAgg = minAdvanceAgg === null ? value : Math.max(minAdvanceAgg, value);
      hasAny = true;
    }
    if (maxAdvance != null && Number(maxAdvance) > 0) {
      const value = Math.floor(Number(maxAdvance));
      maxAdvanceAgg = maxAdvanceAgg === null ? value : Math.min(maxAdvanceAgg, value);
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return aiosellRestrictionShape(minStay, maxStay, closeOnArrival, closeOnDeparture, stopSell, minAdvanceAgg, maxAdvanceAgg);
}

function rowToAiosellRateRestrictions(row: Record<string, unknown>): Record<string, unknown> | null {
  const min = row.min_stay ?? row.min_los;
  const max = row.max_stay ?? row.max_los;
  const closedToArrival = row.closed_to_arrival ?? row.cta;
  const closedToDeparture = row.closed_to_departure ?? row.ctd;
  const stop = row.stop_sell_ota;
  const minAdvanceRaw = row.min_advance_days ?? row.min_advance_reservation;
  const maxAdvanceRaw = row.max_advance_days ?? row.max_advance_reservation;
  const planTariffClosed = isPlanTariffClosedInCalendar(row);
  const minStayForApi = min != null && Number(min) >= 1 ? Math.floor(Number(min)) : null;
  const maxStay = max != null ? Number(max) : null;
  const minAdvance = minAdvanceRaw != null && Number(minAdvanceRaw) > 0 ? Math.floor(Number(minAdvanceRaw)) : null;
  const maxAdvance = maxAdvanceRaw != null && Number(maxAdvanceRaw) > 0 ? Math.floor(Number(maxAdvanceRaw)) : null;
  const has =
    planTariffClosed ||
    (min != null && Number(min) >= 1) ||
    max != null ||
    closedToArrival ||
    closedToDeparture ||
    stop ||
    minAdvance != null ||
    maxAdvance != null;
  if (!has) return null;
  return aiosellRestrictionShape(minStayForApi, maxStay, !!closedToArrival, !!closedToDeparture, Boolean(stop) || planTariffClosed, minAdvance, maxAdvance);
}

function defaultOpenAiosellRateRestrictions(): Record<string, unknown> {
  return aiosellRestrictionShape(null, null, false, false, false, null, null);
}

function effectiveRateRestrictionsForRow(row: Record<string, unknown>): Record<string, unknown> {
  return rowToAiosellRateRestrictions(row) ?? defaultOpenAiosellRateRestrictions();
}

function mergeAiosellUpdatesByDateRange(updates: Record<string, unknown>[], itemsKey: "rooms" | "rates"): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const update of updates) {
    const start = normalizeCalendarDate(update.startDate);
    const end = normalizeCalendarDate(update.endDate);
    if (!start || !end || start > end) continue;
    const key = `${start}|${end}`;
    const items = (update[itemsKey] as Record<string, unknown>[]) || [];
    const prev = map.get(key);
    if (!prev) map.set(key, { startDate: start, endDate: end, [itemsKey]: [...items] });
    else (prev[itemsKey] as Record<string, unknown>[]).push(...items);
  }
  return [...map.values()];
}

function mergeMinimumStayLos(a: unknown, b: unknown): number | null {
  const left = a != null && a !== "" && Number.isFinite(Number(a)) && Number(a) >= 1 ? Math.floor(Number(a)) : null;
  const right = b != null && b !== "" && Number.isFinite(Number(b)) && Number(b) >= 1 ? Math.floor(Number(b)) : null;
  if (left != null && right != null) return Math.max(left, right);
  return left ?? right ?? null;
}

function mergeTwoInvRestrictions(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const minStay = mergeMinimumStayLos(a.minimumStay, b.minimumStay);
  const maxA = a.maximumStay as number | null | undefined;
  const maxB = b.maximumStay as number | null | undefined;
  let maxStay: number | null = null;
  if (maxA != null && maxB != null) maxStay = Math.min(Number(maxA), Number(maxB));
  else maxStay = (maxA != null ? Number(maxA) : null) ?? (maxB != null ? Number(maxB) : null);
  const minAdvVals = [a.minimumAdvanceReservation, b.minimumAdvanceReservation].filter((value) => value != null && Number(value) > 0) as number[];
  const minAdvanceMerged = minAdvVals.length > 0 ? Math.max(...minAdvVals.map((value) => Math.floor(Number(value)))) : null;
  const maxAdvVals = [a.maximumAdvanceReservation, b.maximumAdvanceReservation].filter((value) => value != null && Number(value) > 0) as number[];
  let maxAdvanceMerged: number | null = null;
  if (maxAdvVals.length === 2) maxAdvanceMerged = Math.min(Math.floor(Number(maxAdvVals[0])), Math.floor(Number(maxAdvVals[1])));
  else if (maxAdvVals.length === 1) maxAdvanceMerged = Math.floor(Number(maxAdvVals[0]));
  return aiosellRestrictionShape(
    minStay,
    maxStay,
    Boolean(a.closeOnArrival) || Boolean(b.closeOnArrival),
    Boolean(a.closeOnDeparture) || Boolean(b.closeOnDeparture),
    Boolean(a.stopSell) || Boolean(b.stopSell),
    minAdvanceMerged,
    maxAdvanceMerged,
  );
}

function dedupeRatePriceUpdates(updates: Record<string, unknown>[]): Record<string, unknown>[] {
  return updates
    .map((update) => {
      const rates = (update.rates as Record<string, unknown>[]) || [];
      const byKey = new Map<string, Record<string, unknown>>();
      for (const line of rates) {
        const roomCode = sanitizeAiosellCode(String(line.roomCode ?? ""));
        const rateplanCode = sanitizeAiosellCode(String(line.rateplanCode ?? ""));
        if (!roomCode || !rateplanCode) continue;
        const key = `${roomCode}\0${rateplanCode}`;
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, line);
          continue;
        }
        const prevRestrictions = prev.restrictions as Record<string, unknown> | undefined;
        const nextRestrictions = line.restrictions as Record<string, unknown> | undefined;
        const merged = prevRestrictions && nextRestrictions ? mergeTwoInvRestrictions(prevRestrictions, nextRestrictions) : nextRestrictions ?? prevRestrictions;
        byKey.set(key, { ...line, restrictions: merged });
      }
      return { ...update, rates: [...byKey.values()] };
    })
    .filter((update) => ((update.rates as unknown[]) || []).length > 0);
}

function dedupeInventoryCombinedUpdates(updates: Record<string, unknown>[]): Record<string, unknown>[] {
  return updates
    .map((update) => {
      const rooms = (update.rooms as Record<string, unknown>[]) || [];
      const byCode = new Map<string, Record<string, unknown>>();
      for (const room of rooms) {
        const code = sanitizeAiosellCode(String(room.roomCode ?? ""));
        if (!code) continue;
        const available = safeIntNonNegative(room.available);
        const restrictions = room.restrictions as Record<string, unknown> | undefined;
        const prev = byCode.get(code);
        if (!prev) {
          const next: Record<string, unknown> = { available, roomCode: code };
          if (restrictions) next.restrictions = restrictions;
          byCode.set(code, next);
          continue;
        }
        const prevRestrictions = prev.restrictions as Record<string, unknown> | undefined;
        const merged = prevRestrictions && restrictions ? mergeTwoInvRestrictions(prevRestrictions, restrictions) : restrictions ?? prevRestrictions;
        const next: Record<string, unknown> = { available: safeIntNonNegative(prev.available) + available, roomCode: code };
        if (merged) next.restrictions = merged;
        byCode.set(code, next);
      }
      const mergedRooms = [...byCode.values()].sort((a, b) => String(a.roomCode).localeCompare(String(b.roomCode)));
      return { ...update, rooms: mergedRooms };
    })
    .filter((update) => ((update.rooms as unknown[]) || []).length > 0);
}

function buildMergedDateRanges<T extends { date: string }>(days: T[], keyFn: (day: T) => string): { startDate: string; endDate: string; slice: T[] }[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: { startDate: string; endDate: string; slice: T[] }[] = [];
  let index = 0;
  while (index < sorted.length) {
    const key = keyFn(sorted[index]);
    let next = index + 1;
    while (next < sorted.length && keyFn(sorted[next]) === key && isNextDay(sorted[next - 1].date, sorted[next].date)) next++;
    const startDate = normalizeCalendarDate(sorted[index].date);
    const endDate = normalizeCalendarDate(sorted[next - 1].date);
    if (startDate && endDate && startDate <= endDate) out.push({ startDate, endDate, slice: sorted.slice(index, next) });
    index = next;
  }
  return out;
}

function dynamicPricingKey(categoryId: string, dateRaw: unknown, planId: unknown): string {
  const date = normalizeCalendarDate(dateRaw) ?? String(dateRaw ?? "").slice(0, 10);
  const plan = planId == null || planId === "" ? "" : String(planId);
  return `${String(categoryId).trim()}\0${date}\0${plan}`;
}
