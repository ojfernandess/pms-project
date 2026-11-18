import { Injectable, Logger } from "@nestjs/common";
import { Prisma, reservation_status } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  basicAuthHeader,
  buildNotifReportXml,
  buildReadUndeliveredXml,
  BuklyNotifConfirm,
  collectXmlBlocks,
  firstTagText,
  normalizeCode,
  postOtaXml,
  readXmlAttr,
  requestorId,
  xmlHasSuccess,
} from "./bukly-ota.util";

type PricingRow = {
  category_id: string;
  pricing_plan_id: string | null;
  channel_room_code: string | null;
  channel_rate_plan_code: string | null;
};

type ParsedRoomStay = {
  roomTypeCode: string;
  ratePlanCode: string;
  bookingCode: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  roomTotal: number;
  currency: string;
  guestRph: string | null;
  comments: string | null;
};

type ParsedReservation = {
  resStatus: "Book" | "Modify" | "Cancel";
  reservationId: string;
  messageId: string;
  /** ResID_Type 24 — ID da reserva no canal upstream (ex. Booking.com). */
  partnerReservationId: string | null;
  createDateTime: string | null;
  lastModifyDateTime: string | null;
  sourceChannelCode: string | null;
  sourceChannelName: string | null;
  guestName: string | null;
  guestEmail: string | null;
  globalTotal: number;
  currency: string;
  prepaid: boolean;
  globalComments: string | null;
  roomStays: ParsedRoomStay[];
  rawXml: string;
};

function asBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function errorMessage(error: unknown, fallback = "erro"): string {
  return error instanceof Error ? error.message : fallback;
}

function parseAmount(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseRoomStay(block: string): ParsedRoomStay | null {
  const roomTypeCode =
    readXmlAttr(block, "RoomTypeCode") ||
    readXmlAttr(collectXmlBlocks(block, "RoomType")[0] ?? "", "RoomTypeCode") ||
    "";
  const ratePlanCode =
    readXmlAttr(collectXmlBlocks(block, "RatePlan")[0] ?? "", "RatePlanCode") ||
    readXmlAttr(collectXmlBlocks(block, "RoomRate")[0] ?? "", "RatePlanCode") ||
    "";
  if (!roomTypeCode || !ratePlanCode) return null;
  const timeSpan = collectXmlBlocks(block, "TimeSpan")[0] ?? "";
  const checkIn = readXmlAttr(timeSpan, "Start") || "";
  const checkOut = readXmlAttr(timeSpan, "End") || "";
  const roomRate = collectXmlBlocks(block, "RoomRate")[0] ?? "";
  const bookingCode = readXmlAttr(roomRate, "BookingCode");
  const roomTotalBlock = collectXmlBlocks(block, "Total").find((t) => !t.includes("BaseByGuest")) ?? "";
  const roomTotal = parseAmount(readXmlAttr(roomTotalBlock, "AmountAfterTax") || readXmlAttr(roomTotalBlock, "AmountBeforeTax"));
  const currency = readXmlAttr(roomTotalBlock, "CurrencyCode") || "BRL";
  let adults = 2;
  let children = 0;
  for (const gc of collectXmlBlocks(block, "GuestCount")) {
    const code = readXmlAttr(gc, "AgeQualifyingCode");
    const count = Number(readXmlAttr(gc, "Count") ?? "0") || 0;
    if (code === "8") children += count;
    else adults += count || 0;
  }
  const rphBlock = collectXmlBlocks(block, "ResGuestRPHs")[0] ?? "";
  let guestRph: string | null = null;
  const rphEl = collectXmlBlocks(rphBlock, "ResGuestRPH")[0];
  if (rphEl) guestRph = readXmlAttr(rphEl, "RPH") || firstTagText(rphEl, "ResGuestRPH");
  else guestRph = firstTagText(block, "ResGuestRPHs");
  const comments = collectXmlBlocks(block, "Comments")
    .map((c) => firstTagText(c, "Text"))
    .filter(Boolean)
    .join("\n");
  return {
    roomTypeCode,
    ratePlanCode,
    bookingCode,
    checkIn,
    checkOut,
    adults: Math.max(1, adults),
    children,
    roomTotal,
    currency,
    guestRph,
    comments: comments || null,
  };
}

function parseHotelReservation(block: string): ParsedReservation | null {
  const resStatus = (readXmlAttr(block, "ResStatus") || "Book") as ParsedReservation["resStatus"];
  const uniqueIds = collectXmlBlocks(block, "UniqueID");
  let reservationId = "";
  let messageId = "";
  for (const uid of uniqueIds) {
    const type = readXmlAttr(uid, "Type");
    const id = readXmlAttr(uid, "ID");
    if (!id) continue;
    if (type === "14" && !reservationId) reservationId = id;
    if (type === "16" && readXmlAttr(uid, "ID_Context") === "MessageID") messageId = id;
  }
  if (!reservationId || !messageId) return null;

  const pos = collectXmlBlocks(block, "POS")[0] ?? "";
  const company = collectXmlBlocks(pos, "CompanyName")[0] ?? "";
  const sourceChannelCode = readXmlAttr(company, "Code");
  const sourceChannelName = firstTagText(company, "CompanyName") || sourceChannelCode;

  const global = collectXmlBlocks(block, "ResGlobalInfo")[0] ?? "";
  const globalTotalBlock = collectXmlBlocks(global, "Total")[0] ?? "";
  const globalTotal = parseAmount(
    readXmlAttr(globalTotalBlock, "AmountAfterTax") || readXmlAttr(globalTotalBlock, "AmountBeforeTax"),
  );
  const currency = readXmlAttr(globalTotalBlock, "CurrencyCode") || "BRL";

  const guarantee = collectXmlBlocks(global, "Guarantee")[0] ?? "";
  const guaranteeCode = readXmlAttr(guarantee, "GuaranteeCode");
  const paymentOnChannel =
    collectXmlBlocks(guarantee, "Comment")
      .some((c) => readXmlAttr(c, "Name") === "PaymentOnChannel" && /true/i.test(firstTagText(c, "Text") || "")) ?? false;
  const prepaid = guaranteeCode?.toLowerCase() === "paid" || paymentOnChannel;

  const profile = collectXmlBlocks(global, "Profile")[0] ?? collectXmlBlocks(block, "Profile")[0] ?? "";
  const given = firstTagText(profile, "GivenName");
  const surname = firstTagText(profile, "Surname");
  const guestName = [given, surname].filter(Boolean).join(" ").trim() || surname || given || null;
  const guestEmail = firstTagText(profile, "Email");

  const roomStays = collectXmlBlocks(block, "RoomStay")
    .map((stay) => parseRoomStay(stay))
    .filter((stay): stay is ParsedRoomStay => !!stay);

  const globalComments = collectXmlBlocks(global, "Comments")
    .map((c) => firstTagText(c, "Text"))
    .filter(Boolean)
    .join("\n");

  let partnerReservationId: string | null = null;
  for (const idBlock of collectXmlBlocks(global, "HotelReservationID")) {
    const resType = readXmlAttr(idBlock, "ResID_Type");
    const resValue = readXmlAttr(idBlock, "ResID_Value");
    if (resType === "24" && resValue?.trim()) {
      partnerReservationId = resValue.trim();
      break;
    }
  }
  return {
    resStatus,
    reservationId,
    messageId,
    partnerReservationId,
    createDateTime: readXmlAttr(block, "CreateDateTime"),
    lastModifyDateTime: readXmlAttr(block, "LastModifyDateTime"),
    sourceChannelCode,
    sourceChannelName,
    guestName,
    guestEmail,
    globalTotal,
    currency,
    prepaid,
    globalComments: globalComments || null,
    roomStays,
    rawXml: block.slice(0, 12000),
  };
}

function parseResRetrieveXml(xml: string): ParsedReservation[] {
  if (!xmlHasSuccess(xml)) return [];
  const out: ParsedReservation[] = [];
  for (const block of collectXmlBlocks(xml, "HotelReservation")) {
    const parsed = parseHotelReservation(block);
    if (parsed) out.push(parsed);
  }
  return out;
}

function findChannelPricing(roomCode: string, rateCode: string, rows: PricingRow[]) {
  const room = normalizeCode(roomCode);
  const rate = normalizeCode(rateCode);
  return rows.find(
    (r) => normalizeCode(r.channel_room_code) === room && normalizeCode(r.channel_rate_plan_code) === rate,
  );
}

function splitRoomTotals(stays: ParsedRoomStay[], globalTotal: number): number[] {
  const sumParts = stays.reduce((s, r) => s + (r.roomTotal > 0 ? r.roomTotal : 0), 0);
  if (sumParts > 0) return stays.map((r) => Math.round((r.roomTotal > 0 ? r.roomTotal : 0) * 100) / 100);
  const each = stays.length ? Math.round((globalTotal / stays.length) * 100) / 100 : globalTotal;
  return stays.map(() => each);
}

function otaLineCode(bookingId: string, index: number, stay: ParsedRoomStay): string {
  const suffix = stay.bookingCode?.trim() || String(index);
  return `${bookingId}#${suffix}`;
}

@Injectable()
export class BuklyReservationsService {
  private readonly logger = new Logger(BuklyReservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(body: unknown): Promise<{ status: number; body: unknown }> {
    const payload = asBody(body);
    if (!payload) return { status: 400, body: { success: false, error: "JSON inválido" } };
    const channelId = typeof payload.channel_id === "string" ? payload.channel_id : "";
    if (!channelId) return { status: 400, body: { success: false, error: "channel_id obrigatório" } };

    const channel = await this.prisma.ota_channels.findUnique({ where: { id: channelId } });
    if (!channel) return { status: 404, body: { success: false, error: "Canal não encontrado" } };
    if (channel.channel_manager_type !== "bukly") {
      return { status: 400, body: { success: false, error: "Canal não é Bukly" } };
    }
    if (channel.is_active === false) {
      return { status: 400, body: { success: false, error: "Canal Bukly inativo" } };
    }

    const establishmentId =
      (typeof payload.establishment_id === "string" ? payload.establishment_id : "") || channel.establishment_id || "";
    if (!establishmentId) return { status: 400, body: { success: false, error: "establishment_id obrigatório" } };

    const hotelCode = normalizeCode(channel.bukly_hotel_id);
    const apiUser = normalizeCode(channel.api_key);
    const apiPass = String(channel.api_secret ?? "");
    const apiUrl = normalizeCode(channel.bukly_api_url) || "https://pms.bukly.com";
    if (!hotelCode || !apiUser || !apiPass) {
      return {
        status: 400,
        body: { success: false, error: "Credenciais Bukly incompletas (HotelCode + Basic Auth)" },
      };
    }

    const auth = basicAuthHeader(apiUser, apiPass);
    const reqId = requestorId();
    const readXml = buildReadUndeliveredXml(hotelCode, reqId);
    const readRes = await postOtaXml(apiUrl, auth, readXml);
    if (!readRes.ok) {
      return {
        status: 502,
        body: { success: false, error: readRes.errors[0] || "Falha ao consultar reservas Bukly (OTA_ReadRQ)" },
      };
    }

    const reservations = parseResRetrieveXml(readRes.body);
    if (reservations.length === 0) {
      return { status: 200, body: { success: true, imported: 0, message: "Nenhuma reserva Undelivered" } };
    }

    const pricingRows = await this.prisma.channel_pricing.findMany({
      where: { ota_channel_id: channelId, is_active: true },
      select: {
        category_id: true,
        pricing_plan_id: true,
        channel_room_code: true,
        channel_rate_plan_code: true,
      },
    });

    const confirms: BuklyNotifConfirm[] = [];
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let cancelled = 0;

    for (const item of reservations) {
      try {
        await this.prisma.bukly_webhooks.create({
          data: {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            webhook_type: item.resStatus === "Book" ? "booking" : item.resStatus === "Modify" ? "modification" : "cancellation",
            payload: { reservationId: item.reservationId, messageId: item.messageId, roomCount: item.roomStays.length } as Prisma.InputJsonValue,
            processed: false,
          },
        });
      } catch {
        /* auditoria opcional */
      }

      if (item.resStatus === "Cancel") {
        const n = await this.cancelGroup(channelId, item.reservationId);
        cancelled += n;
        imported += n;
        confirms.push({
          resStatus: "Cancel",
          messageId: item.messageId,
          reservationId: item.reservationId,
          lastModifyDateTime: item.lastModifyDateTime || new Date().toISOString(),
        });
        continue;
      }

      if (item.roomStays.length === 0) {
        errors.push(`${item.reservationId}: sem RoomStays`);
        continue;
      }

      if (item.resStatus === "Modify") {
        const n = await this.modifyGroup(channelId, establishmentId, item, pricingRows);
        if (n.ok) {
          updated += n.count;
          imported += n.count;
          confirms.push({
            resStatus: "Modify",
            messageId: item.messageId,
            reservationId: item.reservationId,
            lastModifyDateTime: item.lastModifyDateTime || new Date().toISOString(),
            pmsReservationCode: n.firstCode ?? undefined,
          });
        } else errors.push(`${item.reservationId}: ${n.error}`);
        continue;
      }

      const book = await this.bookGroup(channelId, establishmentId, item, pricingRows);
      if (book.ok) {
        imported += book.count;
        confirms.push({
          resStatus: "Book",
          messageId: item.messageId,
          reservationId: item.reservationId,
          createDateTime: item.createDateTime || new Date().toISOString(),
          pmsReservationCode: book.firstCode ?? undefined,
        });
      } else errors.push(`${item.reservationId}: ${book.error}`);
    }

    if (confirms.length > 0) {
      const report = buildNotifReportXml(confirms);
      const ack = await postOtaXml(apiUrl, auth, report);
      if (!ack.ok) {
        errors.push(`Falha OTA_NotifReportRQ: ${ack.errors[0] || "erro"}`);
      }
    }

    return {
      status: errors.length ? 207 : 200,
      body: {
        success: errors.length === 0,
        imported,
        booked: imported - updated - cancelled,
        updated,
        cancelled,
        reservations_seen: reservations.length,
        confirmed_messages: confirms.length,
        errors,
      },
    };
  }

  private async listOtaGroup(channelId: string, bookingId: string) {
    return this.prisma.ota_reservations.findMany({
      where: {
        ota_channel_id: channelId,
        OR: [{ ota_reservation_code: bookingId }, { ota_reservation_code: { startsWith: `${bookingId}#` } }],
      },
      select: { id: true, reservation_id: true, ota_reservation_code: true },
    });
  }

  private async cancelGroup(channelId: string, bookingId: string): Promise<number> {
    const rows = await this.listOtaGroup(channelId, bookingId);
    const ids = rows.map((r) => r.reservation_id).filter(Boolean) as string[];
    if (!ids.length) return 0;
    await this.prisma.reservations.updateMany({
      where: { id: { in: ids }, status: { not: reservation_status.cancelled } },
      data: {
        status: reservation_status.cancelled,
        cancelled_at: new Date(),
        cancellation_reason: "Cancelamento via Bukly (OTA)",
      },
    });
    await this.prisma.ota_reservations.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { sync_status: "cancelled", synced_at: new Date() },
    });
    return ids.length;
  }

  private async modifyGroup(
    channelId: string,
    establishmentId: string,
    item: ParsedReservation,
    pricingRows: PricingRow[],
  ): Promise<{ ok: true; count: number; firstCode?: string } | { ok: false; error: string }> {
    const amounts = splitRoomTotals(item.roomStays, item.globalTotal);
    let count = 0;
    let firstCode: string | undefined;
    for (let i = 0; i < item.roomStays.length; i += 1) {
      const stay = item.roomStays[i];
      const otaCode = otaLineCode(item.reservationId, i, stay);
      const ota = await this.prisma.ota_reservations.findFirst({
        where: { ota_channel_id: channelId, ota_reservation_code: otaCode },
        select: { reservation_id: true },
      });
      if (!ota?.reservation_id) continue;
      const mapping = findChannelPricing(stay.roomTypeCode, stay.ratePlanCode, pricingRows);
      const total = amounts[i] ?? stay.roomTotal;
      await this.prisma.reservations.update({
        where: { id: ota.reservation_id },
        data: {
          ...(stay.checkIn ? { checkin_date: new Date(`${stay.checkIn}T12:00:00Z`) } : {}),
          ...(stay.checkOut ? { checkout_date: new Date(`${stay.checkOut}T12:00:00Z`) } : {}),
          adults: stay.adults,
          children: stay.children,
          total_amount: total,
          ...(mapping?.category_id ? { category_id: mapping.category_id } : {}),
          ...(item.guestName ? { guest_name: item.guestName } : {}),
          ...(item.prepaid && total > 0 ? { paid_amount: total, payment_status: "paid" } : {}),
        },
      });
      count += 1;
      if (!firstCode) {
        const row = await this.prisma.reservations.findUnique({
          where: { id: ota.reservation_id },
          select: { reservation_code: true },
        });
        firstCode = row?.reservation_code ?? undefined;
      }
    }
    if (count === 0) {
      const created = await this.bookGroup(channelId, establishmentId, item, pricingRows);
      if (!created.ok) return { ok: false, error: created.error || "Modify sem vínculo local" };
      return { ok: true, count: created.count, firstCode: created.firstCode };
    }
    return { ok: true, count, firstCode };
  }

  private async bookGroup(
    channelId: string,
    establishmentId: string,
    item: ParsedReservation,
    pricingRows: PricingRow[],
  ): Promise<{ ok: true; count: number; firstCode?: string } | { ok: false; error: string }> {
    const amounts = splitRoomTotals(item.roomStays, item.globalTotal);
    let created = 0;
    let firstCode: string | undefined;

    for (let i = 0; i < item.roomStays.length; i += 1) {
      const stay = item.roomStays[i];
      const otaCode = otaLineCode(item.reservationId, i, stay);
      const exists = await this.prisma.ota_reservations.findFirst({
        where: { ota_channel_id: channelId, ota_reservation_code: otaCode },
        select: { reservation_id: true },
      });
      if (exists?.reservation_id) {
        created += 1;
        continue;
      }

      const mapping = findChannelPricing(stay.roomTypeCode, stay.ratePlanCode, pricingRows);
      if (!mapping?.category_id) {
        return {
          ok: false,
          error: `Mapeamento ausente (InvType ${stay.roomTypeCode} / Rate ${stay.ratePlanCode}) — configure Tarifas por canal`,
        };
      }
      if (!stay.checkIn || !stay.checkOut) {
        return { ok: false, error: "Datas de estadia ausentes no RoomStay" };
      }

      const total = amounts[i] ?? stay.roomTotal;
      const notes = [
        `Bukly ${item.reservationId}`,
        item.sourceChannelName ? `Canal: ${item.sourceChannelName}` : null,
        item.roomStays.length > 1 ? `Grupo ${i + 1}/${item.roomStays.length}` : null,
        stay.comments,
        item.globalComments,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 4000);

      const reservationData: Record<string, unknown> = {
        guest_name: item.guestName || `Hóspede OTA (${item.sourceChannelCode || "Bukly"})`,
        adults: stay.adults,
        children: stay.children,
        total_amount: total,
        paid_amount: item.prepaid && total > 0 ? total : 0,
        payment_status: item.prepaid && total > 0 ? "paid" : "pending",
        status: "pending",
        channel: "ota",
        notes,
      };
      if (mapping.pricing_plan_id) reservationData.pricing_plan_id = mapping.pricing_plan_id;

      const rows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.create_reservation_with_lock(
          ${JSON.stringify(reservationData)}::jsonb,
          ${stay.checkIn}::date,
          ${stay.checkOut}::date,
          ${establishmentId}::uuid,
          ${null}::uuid,
          ${mapping.category_id}::uuid
        ) AS result
      `;
      const result = rows[0]?.result as { success?: boolean; reservation_id?: string; error?: string } | null;
      if (!result?.success || !result.reservation_id) {
        return { ok: false, error: String(result?.error || "Falha ao criar reserva") };
      }

      const guestJson = {
        ota_guest_name: item.guestName,
        ota_guest_email: item.guestEmail,
        ota_source_channel_name: item.sourceChannelName,
        ota_cm_booking_id: item.partnerReservationId,
        ota_special_requests: stay.comments || item.globalComments,
        sync_status: "synced",
        synced_at: new Date().toISOString(),
      };
      const linkRows = await this.prisma.$queryRaw<Array<{ result: unknown }>>`
        SELECT public.ota_link_reservation_after_sync(
          ${result.reservation_id}::uuid,
          ${channelId}::uuid,
          ${otaCode},
          ${JSON.stringify(guestJson)}::jsonb
        ) AS result
      `;
      const linked = linkRows[0]?.result as { success?: boolean; reservation_id?: string; error?: string } | null;
      if (!linked?.success) {
        return { ok: false, error: String(linked?.error || "Falha ao vincular OTA") };
      }

      if (!firstCode) {
        const row = await this.prisma.reservations.findUnique({
          where: { id: result.reservation_id },
          select: { reservation_code: true },
        });
        firstCode = row?.reservation_code ?? undefined;
      }
      created += 1;
    }

    return { ok: true, count: created, firstCode };
  }
}