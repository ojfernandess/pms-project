import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  baseSellableRoomsByCategory,
  bookedCountFromOccupiedMap,
  buildOccupiedRoomsByCategoryDate,
} from "./channel-availability-blocks";

/**
 * StayOS PMS → Bukly Channel Manager (OTA 2013A XML).
 * Authorization: Basic api_user:api_pass (ota_channels.api_key / api_secret)
 * HotelCode: ota_channels.bukly_hotel_id
 * InvTypeCode / RatePlanCode: channel_pricing.channel_room_code / channel_rate_plan_code
 * POST OTA_HotelRateAmountNotifRQ + OTA_HotelAvailNotifRQ
 */

const SYNC_DAYS_AHEAD = 365;
const OTA_NS = "http://www.opentravel.org/OTA/2003/05";
const MAX_MESSAGES_PER_REQUEST = 80;
const RATE_CALENDAR_PAGE = 1000;

type RateLine = {
  invTypeCode: string;
  ratePlanCode: string;
  start: string;
  end: string;
  amount: number;
};

type AvailLine = {
  invTypeCode: string;
  ratePlanCode: string;
  start: string;
  end: string;
  bookingLimit: number;
  minLos?: number | null;
  maxLos?: number | null;
  cta?: boolean;
  ctd?: boolean;
  stopSell?: boolean;
};

type DailyRow = {
  date: string;
  key: string;
  valueKey: string;
};

type Mapping = {
  categoryId: string;
  planId: string | null;
  invTypeCode: string;
  ratePlanCode: string;
  fixedPrice: number | null;
  priceMultiplier: number | null;
};

type CalRow = {
  date: string;
  category_id: string;
  pricing_plan_id: string;
  base_price: number;
  adult_price: number | null;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean | null;
  closed_to_departure: boolean | null;
  stop_sell_ota: boolean | null;
  stop_sell_booking_engine: boolean | null;
};

function escapeXml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function requestorId(): string {
  const fromEnv = (process.env.BUKLY_REQUESTOR_ID ?? "").trim();
  return fromEnv || "STAYOS";
}

function xmlHasSuccess(body: string): boolean {
  return /<\s*Success\s*\/?\s*>/i.test(body);
}

function extractOtaErrors(body: string): string[] {
  const out: string[] = [];
  const re = /<Error\b[^>]*>([\s\S]*?)<\/Error>|<Error\b[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const text = (match[1] || match[0] || "").replace(/<[^>]+>/g, "").trim();
    if (text) out.push(text.slice(0, 400));
  }
  return out.slice(0, 8);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ymdFromDb(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function asBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function compactDaily<T extends DailyRow>(rows: T[]): Array<T & { start: string; end: string }> {
  const sorted = [...rows].sort((a, b) => (a.key === b.key ? a.date.localeCompare(b.date) : a.key.localeCompare(b.key)));
  const out: Array<T & { start: string; end: string }> = [];
  for (const row of sorted) {
    const last = out[out.length - 1];
    if (last && last.key === row.key && last.valueKey === row.valueKey && addDaysYmd(last.end, 1) === row.date) {
      last.end = row.date;
    } else {
      out.push({ ...row, start: row.date, end: row.date });
    }
  }
  return out;
}

function buildRateAmountNotifXml(hotelCode: string, reqId: string, messages: RateLine[]): string {
  const parts = messages
    .map((message) => {
      return `<RateAmountMessage>
  <StatusApplicationControl InvTypeCode="${escapeXml(message.invTypeCode)}" RatePlanCode="${escapeXml(message.ratePlanCode)}" Start="${escapeXml(message.start)}" End="${escapeXml(message.end)}"/>
  <Rates>
    <Rate CurrencyCode="BRL" Start="${escapeXml(message.start)}" End="${escapeXml(message.end)}">
      <BaseByGuestAmts>
        <BaseByGuestAmt AmountAfterTax="${escapeXml(message.amount.toFixed(2))}"/>
      </BaseByGuestAmts>
    </Rate>
  </Rates>
</RateAmountMessage>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelRateAmountNotifRQ xmlns="${OTA_NS}" Version="1.0">
  <POS>
    <Source>
      <RequestorID Type="22" ID="${escapeXml(reqId)}"/>
    </Source>
  </POS>
  <RateAmountMessages HotelCode="${escapeXml(hotelCode)}">
${parts}
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>`;
}

function buildAvailNotifXml(hotelCode: string, reqId: string, messages: AvailLine[]): string {
  const parts = messages
    .map((message) => {
      const los: string[] = [];
      if (message.minLos != null && Number(message.minLos) > 0) {
        los.push(`<LengthOfStay MinMaxMessageType="SetMinLOS" Time="${escapeXml(Math.floor(Number(message.minLos)))}"/>`);
      }
      if (message.maxLos != null && Number(message.maxLos) > 0) {
        los.push(`<LengthOfStay MinMaxMessageType="SetMaxLOS" Time="${escapeXml(Math.floor(Number(message.maxLos)))}"/>`);
      }
      const lengths = los.length > 0 ? `<LengthsOfStay>\n${los.join("\n")}\n</LengthsOfStay>` : "";

      const restrictions: string[] = [];
      if (message.stopSell) restrictions.push(`<RestrictionStatus Status="Close"/>`);
      else restrictions.push(`<RestrictionStatus Status="Open"/>`);
      if (message.cta) restrictions.push(`<RestrictionStatus Status="Close" Restriction="Arrival"/>`);
      else restrictions.push(`<RestrictionStatus Status="Open" Restriction="Arrival"/>`);
      if (message.ctd) restrictions.push(`<RestrictionStatus Status="Close" Restriction="Departure"/>`);
      else restrictions.push(`<RestrictionStatus Status="Open" Restriction="Departure"/>`);

      return `<AvailStatusMessage BookingLimit="${escapeXml(message.bookingLimit)}">
  <StatusApplicationControl InvTypeCode="${escapeXml(message.invTypeCode)}" RatePlanCode="${escapeXml(message.ratePlanCode)}" Start="${escapeXml(message.start)}" End="${escapeXml(message.end)}"/>
  ${restrictions.join("\n  ")}
  ${lengths}
</AvailStatusMessage>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelAvailNotifRQ xmlns="${OTA_NS}" Version="1.0">
  <POS>
    <Source>
      <RequestorID Type="22" ID="${escapeXml(reqId)}"/>
    </Source>
  </POS>
  <AvailStatusMessages HotelCode="${escapeXml(hotelCode)}">
${parts}
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>`;
}

async function postOtaXml(apiUrl: string, auth: string, xml: string): Promise<{ ok: boolean; status: number; body: string; errors: string[] }> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/xml; charset=utf-8",
      Accept: "application/xml, text/xml, */*",
    },
    body: xml,
  });
  const body = await res.text();
  const ok = res.ok && xmlHasSuccess(body);
  const parsedErrors = extractOtaErrors(body);
  return {
    ok,
    status: res.status,
    body: body.slice(0, 4000),
    errors: ok ? [] : parsedErrors.length ? parsedErrors : [`HTTP ${res.status}: ${body.slice(0, 300) || res.statusText}`],
  };
}

@Injectable()
export class BuklySyncService {
  private readonly logger = new Logger(BuklySyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(body: unknown): Promise<{ status: number; body: unknown }> {
    const payload = asBody(body);
    if (!payload) {
      return { status: 400, body: { success: false, error: "JSON inválido" } };
    }

    const channelId = typeof payload.channel_id === "string" ? payload.channel_id : "";
    if (!channelId) {
      return { status: 400, body: { success: false, error: "channel_id obrigatório" } };
    }

    const today = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + SYNC_DAYS_AHEAD);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    let channel: Awaited<ReturnType<PrismaService["ota_channels"]["findUnique"]>>;
    try {
      channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
    } catch (error) {
      this.logger.warn(`Canal Bukly não lido: ${errorMessage(error, "erro")}`);
      channel = null;
    }
    if (!channel) {
      return { status: 404, body: { success: false, error: "Canal não encontrado" } };
    }
    if (channel.channel_manager_type !== "bukly") {
      return { status: 400, body: { success: false, error: "Canal não é Bukly" } };
    }
    if (channel.is_active === false) {
      return { status: 400, body: { success: false, error: "Canal Bukly inativo" } };
    }

    const establishmentFromBody = typeof payload.establishment_id === "string" ? payload.establishment_id : "";
    const establishmentId = establishmentFromBody || channel.establishment_id || "";
    if (!establishmentId) {
      return { status: 400, body: { success: false, error: "establishment_id obrigatório" } };
    }

    const hotelCode = normalizeCode(channel.bukly_hotel_id);
    const apiUser = normalizeCode(channel.api_key);
    const apiPass = String(channel.api_secret ?? "");
    const apiUrl = normalizeCode(channel.bukly_api_url) || "https://pms.bukly.com";
    if (!hotelCode || !apiUser || !apiPass) {
      return {
        status: 400,
        body: { success: false, error: "Credenciais Bukly incompletas (HotelCode, usuário e senha Basic Auth)" },
      };
    }

    let pricingRows: Array<{
      category_id: string;
      pricing_plan_id: string | null;
      channel_room_code: string | null;
      channel_rate_plan_code: string | null;
      fixed_price: Prisma.Decimal | null;
      price_multiplier: Prisma.Decimal | null;
    }>;
    try {
      pricingRows = await this.prisma.channel_pricing.findMany({
        where: { ota_channel_id: channelId, is_active: true },
        select: {
          category_id: true,
          pricing_plan_id: true,
          channel_room_code: true,
          channel_rate_plan_code: true,
          fixed_price: true,
          price_multiplier: true,
        },
      });
    } catch (error) {
      return { status: 500, body: { success: false, error: errorMessage(error, "Erro ao ler tarifas do canal") } };
    }

    const mappings: Mapping[] = [];
    const skippedUnmapped: string[] = [];
    for (const row of pricingRows) {
      const room = normalizeCode(row.channel_room_code);
      const rate = normalizeCode(row.channel_rate_plan_code);
      const categoryId = String(row.category_id || "");
      if (!categoryId) continue;
      if (!room || !rate) {
        skippedUnmapped.push(`categoria ${categoryId}: faltam InvTypeCode/RatePlanCode`);
        continue;
      }
      const fixedNum = finiteOrNull(row.fixed_price);
      const multNum = finiteOrNull(row.price_multiplier);
      mappings.push({
        categoryId,
        planId: row.pricing_plan_id ? String(row.pricing_plan_id) : null,
        invTypeCode: room,
        ratePlanCode: rate,
        fixedPrice: fixedNum,
        priceMultiplier: multNum != null && multNum > 0 ? multNum : null,
      });
    }

    if (mappings.length === 0) {
      return {
        status: 400,
        body: {
          success: false,
          error: "Nenhum mapeamento Bukly ativo com Room Code (InvTypeCode) e Rate Plan Code. Configure em Tarifas por canal.",
          skippedUnmapped,
        },
      };
    }

    let syncLogId: string | null = null;
    try {
      await this.prisma.ota_channels.update({
        where: { id: channelId },
        data: { bukly_sync_status: "syncing", sync_status: "syncing" },
      });

      try {
        const logRow = await this.prisma.bukly_sync_logs.create({
          data: {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            sync_type: "full",
            status: "pending",
            sync_data: { hotelCode, mappingCount: mappings.length, skippedUnmapped } as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        syncLogId = logRow.id;
      } catch (error) {
        this.logger.warn(`bukly_sync_logs insert skipped: ${errorMessage(error, "erro")}`);
      }

      const rateCalendar = await this.fetchAllRateCalendar(establishmentId, today, futureDateStr);
      const [rooms, reservations, maintenanceTickets] = await Promise.all([
        this.prisma.rooms.findMany({
          where: { establishment_id: establishmentId },
          select: { id: true, category_id: true, is_blocked: true },
        }),
        this.prisma.reservations.findMany({
          where: {
            establishment_id: establishmentId,
            status: { in: ["pending", "confirmed", "checkedin", "blocked", "preregistration"] },
          },
          select: {
            id: true,
            category_id: true,
            checkin_date: true,
            checkout_date: true,
            room_id: true,
            status: true,
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
      ]);

      const roomRows = rooms.map((room) => ({
        id: String(room.id),
        category_id: room.category_id ? String(room.category_id) : null,
        is_blocked: room.is_blocked,
      }));

      const sellableByCategory = baseSellableRoomsByCategory(roomRows);

      const occupiedByCategoryDate = buildOccupiedRoomsByCategoryDate({
        rooms: roomRows,
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
        windowEndInclusive: futureDateStr,
        keySeparator: "|",
      });

      const availableFor = (categoryId: string, date: string): number => {
        const base = sellableByCategory.get(categoryId) ?? 0;
        const booked = bookedCountFromOccupiedMap(occupiedByCategoryDate, categoryId, date, "|");
        return Math.max(0, base - booked);
      };

      const resolvePrice = (row: CalRow, mapping: Mapping): number => {
        if (mapping.fixedPrice != null) return mapping.fixedPrice;
        const base = Number(row.base_price ?? row.adult_price ?? 0);
        const baseOk = Number.isFinite(base) ? base : 0;
        if (mapping.priceMultiplier != null && mapping.priceMultiplier !== 1) {
          return baseOk * mapping.priceMultiplier;
        }
        return baseOk;
      };

      const dailyRates: Array<DailyRow & { invTypeCode: string; ratePlanCode: string; amount: number }> = [];
      const dailyAvail: Array<DailyRow & Omit<AvailLine, "start" | "end">> = [];

      for (const mapping of mappings) {
        const rows = rateCalendar.filter((row) => {
          if (String(row.category_id) !== mapping.categoryId) return false;
          if (mapping.planId) return String(row.pricing_plan_id || "") === mapping.planId;
          return true;
        });
        const byDate = new Map<string, CalRow>();
        for (const row of rows) {
          if (!byDate.has(row.date)) byDate.set(row.date, row);
        }
        for (const [date, row] of byDate) {
          const amount = Math.round(resolvePrice(row, mapping) * 100) / 100;
          const key = `${mapping.invTypeCode}|${mapping.ratePlanCode}`;
          dailyRates.push({
            date,
            key,
            valueKey: String(amount),
            invTypeCode: mapping.invTypeCode,
            ratePlanCode: mapping.ratePlanCode,
            amount,
          });

          const bookingLimit = availableFor(mapping.categoryId, date);
          const minLos = Number(row.min_stay ?? 0) || null;
          const maxLos = Number(row.max_stay ?? 0) || null;
          const cta = !!row.closed_to_arrival;
          const ctd = !!row.closed_to_departure;
          const stopSell = !!(row.stop_sell_ota ?? row.stop_sell_booking_engine) || bookingLimit <= 0;
          dailyAvail.push({
            date,
            key,
            valueKey: `${bookingLimit}|${minLos}|${maxLos}|${cta}|${ctd}|${stopSell}`,
            invTypeCode: mapping.invTypeCode,
            ratePlanCode: mapping.ratePlanCode,
            bookingLimit,
            minLos,
            maxLos,
            cta,
            ctd,
            stopSell,
          });
        }
      }

      const rateMessages: RateLine[] = compactDaily(dailyRates).map((row) => ({
        invTypeCode: row.invTypeCode,
        ratePlanCode: row.ratePlanCode,
        start: row.start,
        end: row.end,
        amount: row.amount,
      }));
      const availMessages: AvailLine[] = compactDaily(dailyAvail).map((row) => ({
        invTypeCode: row.invTypeCode,
        ratePlanCode: row.ratePlanCode,
        start: row.start,
        end: row.end,
        bookingLimit: row.bookingLimit,
        minLos: row.minLos,
        maxLos: row.maxLos,
        cta: row.cta,
        ctd: row.ctd,
        stopSell: row.stopSell,
      }));

      if (rateMessages.length === 0 && availMessages.length === 0) {
        throw new Error("Nenhuma tarifa/disponibilidade no período para os mapeamentos Bukly");
      }

      const auth = basicAuthHeader(apiUser, apiPass);
      const reqId = requestorId();
      const errors: string[] = [];
      let ratesPosts = 0;
      let availPosts = 0;

      for (const chunk of chunkArray(rateMessages, MAX_MESSAGES_PER_REQUEST)) {
        const result = await postOtaXml(apiUrl, auth, buildRateAmountNotifXml(hotelCode, reqId, chunk));
        ratesPosts += 1;
        if (!result.ok) {
          errors.push(...result.errors.map((item) => `Rates: ${item}`));
          break;
        }
      }
      if (errors.length === 0) {
        for (const chunk of chunkArray(availMessages, MAX_MESSAGES_PER_REQUEST)) {
          const result = await postOtaXml(apiUrl, auth, buildAvailNotifXml(hotelCode, reqId, chunk));
          availPosts += 1;
          if (!result.ok) {
            errors.push(...result.errors.map((item) => `Avail: ${item}`));
            break;
          }
        }
      }

      const success = errors.length === 0;
      const now = new Date();
      await this.prisma.ota_channels.update({
        where: { id: channelId },
        data: {
          bukly_sync_status: success ? "success" : "error",
          sync_status: success ? "success" : "error",
          ...(success ? { bukly_last_sync_at: now, last_sync_at: now } : { bukly_last_sync_at: channel.bukly_last_sync_at }),
        },
      });
      if (syncLogId) {
        await this.prisma.bukly_sync_logs.update({
          where: { id: syncLogId },
          data: {
            status: success ? "success" : "error",
            records_synced: rateMessages.length + availMessages.length,
            error_message: success ? null : errors.join(" | ").slice(0, 2000),
            completed_at: now,
            sync_data: {
              hotelCode,
              ratesMessages: rateMessages.length,
              availMessages: availMessages.length,
              ratesPosts,
              availPosts,
              skippedUnmapped,
              mappingCount: mappings.length,
            } as Prisma.InputJsonValue,
          },
        });
      }

      const response: Record<string, unknown> = {
        success,
        details: errors,
        ratesMessages: rateMessages.length,
        availMessages: availMessages.length,
        ratesPosts,
        availPosts,
        skippedUnmapped,
        syncHints: {
          hotelCode,
          establishmentId,
          apiUrl,
          requestorId: reqId,
          mappingCount: mappings.length,
        },
      };
      if (!success) response.error = errors[0] || "Falha na sincronização Bukly";
      return { status: success ? 200 : 400, body: response };
    } catch (error) {
      const message = errorMessage(error, "Erro interno Bukly sync");
      this.logger.error(`bukly-sync error: ${message}`);
      try {
        await this.prisma.ota_channels.update({
          where: { id: channelId },
          data: { bukly_sync_status: "error", sync_status: "error" },
        });
        if (syncLogId) {
          await this.prisma.bukly_sync_logs.update({
            where: { id: syncLogId },
            data: {
              status: "error",
              error_message: message.slice(0, 2000),
              completed_at: new Date(),
            },
          });
        }
      } catch (updateError) {
        this.logger.error(`bukly-sync status update failed: ${errorMessage(updateError, "erro")}`);
      }
      return { status: 500, body: { success: false, error: message } };
    }
  }

  private async fetchAllRateCalendar(establishmentId: string, from: string, to: string): Promise<CalRow[]> {
    const all: CalRow[] = [];
    let offset = 0;
    for (;;) {
      const batch = await this.prisma.rate_calendar.findMany({
        where: {
          establishment_id: establishmentId,
          date: { gte: utcDate(from), lte: utcDate(to) },
        },
        select: {
          id: true,
          date: true,
          category_id: true,
          pricing_plan_id: true,
          base_price: true,
          adult_price: true,
          min_stay: true,
          max_stay: true,
          closed_to_arrival: true,
          closed_to_departure: true,
          stop_sell_ota: true,
          stop_sell_booking_engine: true,
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        skip: offset,
        take: RATE_CALENDAR_PAGE,
      });
      for (const row of batch) {
        all.push({
          date: ymdFromDb(row.date),
          category_id: row.category_id,
          pricing_plan_id: row.pricing_plan_id,
          base_price: Number(row.base_price),
          adult_price: row.adult_price == null ? null : Number(row.adult_price),
          min_stay: row.min_stay,
          max_stay: row.max_stay,
          closed_to_arrival: row.closed_to_arrival,
          closed_to_departure: row.closed_to_departure,
          stop_sell_ota: row.stop_sell_ota,
          stop_sell_booking_engine: row.stop_sell_booking_engine,
        });
      }
      if (batch.length < RATE_CALENDAR_PAGE) break;
      offset += RATE_CALENDAR_PAGE;
    }
    return all;
  }
}
