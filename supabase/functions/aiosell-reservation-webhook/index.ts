import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Aiosell: `pah` true = pagamento no hotel; `pah` false = reserva pré-paga (OTA).
 * Aceita também texto em paymentStatus/segment quando o canal envia "Prepaid".
 */
function boolFromUnknown(v: unknown): boolean | undefined {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

function looksLikePrepaidString(v: unknown): boolean {
  if (v == null) return false;
  const t = String(v).toLowerCase().trim();
  return (
    t.includes("prepaid") ||
    t.includes("pre-paid") ||
    t.includes("pre pago") ||
    t.includes("prepago") ||
    t === "pp"
  );
}

function isAiosellPrepaidBooking(
  layers: Record<string, unknown>[],
  body: Record<string, unknown>
): boolean {
  const pahKeys = ["pah", "payAtHotel", "pay_at_hotel", "paymentAtHotel"];

  for (const layer of layers) {
    for (const k of pahKeys) {
      if (!(k in layer)) continue;
      const b = boolFromUnknown(layer[k]);
      if (b === true) return false;
      if (b === false) return true;
    }
  }
  for (const k of pahKeys) {
    if (!(k in body)) continue;
    const b = boolFromUnknown(body[k]);
    if (b === true) return false;
    if (b === false) return true;
  }

  const statusKeys = [
    "paymentStatus",
    "payment_status",
    "bookingPaymentStatus",
    "paymentType",
    "payment_type",
    "bookingPaymentType",
    "prepaidStatus",
  ];
  for (const layer of layers) {
    for (const k of statusKeys) {
      if (looksLikePrepaidString(layer[k])) return true;
    }
    if (looksLikePrepaidString(layer.segment) || looksLikePrepaidString(layer.bookingSegment)) {
      return true;
    }
  }
  for (const k of statusKeys) {
    if (looksLikePrepaidString(body[k])) return true;
  }
  if (looksLikePrepaidString(body.segment)) return true;

  return false;
}

async function insertAiosellChannelPrepaidPayment(
  supabase: SupabaseClient,
  args: {
    reservationId: string;
    establishmentId: string;
    amount: number;
    bookingId: string;
    partnerChannelName?: string | null;
  }
): Promise<{ error: string | null }> {
  if (args.amount <= 0) return { error: null };

  const marker = "Pré-pago via canal OTA (Aiosell)";
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("reservation_id", args.reservationId)
    .ilike("notes", `%${marker}%`)
    .maybeSingle();

  if (existing?.id) return { error: null };

  const notes = [
    marker,
    `bookingId: ${args.bookingId}`,
    args.partnerChannelName ? `canal parceiro: ${args.partnerChannelName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("payments").insert({
    reservation_id: args.reservationId,
    establishment_id: args.establishmentId,
    amount: args.amount,
    payment_method: "deposit",
    payment_date: new Date().toISOString(),
    notes,
  });

  return { error: error?.message ?? null };
}

/** Camadas do payload (raiz, data, reservation, booking, etc.) para aceitar webhooks aninhados. */
function collectLayers(body: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [body];
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    out.push(data as Record<string, unknown>);
  }
  const payload = body.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    out.push(payload as Record<string, unknown>);
  }
  const reservation = body.reservation;
  if (reservation && typeof reservation === "object" && !Array.isArray(reservation)) {
    out.push(reservation as Record<string, unknown>);
  }
  const booking = body.booking;
  if (booking && typeof booking === "object" && !Array.isArray(booking)) {
    out.push(booking as Record<string, unknown>);
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const dr = d.reservation;
    if (dr && typeof dr === "object" && !Array.isArray(dr)) {
      out.push(dr as Record<string, unknown>);
    }
    const db = d.booking;
    if (db && typeof db === "object" && !Array.isArray(db)) {
      out.push(db as Record<string, unknown>);
    }
  }
  return out;
}

function firstNonEmptyString(layers: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const layer of layers) {
    for (const k of keys) {
      const v = layer[k];
      if (v == null || v === "") continue;
      if (typeof v === "number" && !Number.isNaN(v)) return String(v);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

function normalizeActionFromLayers(layers: Record<string, unknown>[]): string {
  const keys = ["action", "event", "type", "bookingType", "operation"];
  for (const layer of layers) {
    for (const k of keys) {
      const v = layer[k];
      if (v != null && String(v).length) return String(v).toLowerCase();
    }
  }
  return "";
}

function pickBookingIdFromLayers(layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "bookingId",
    "cmBookingId",
    "otaBookingId",
    "reservationId",
    "booking_id",
    "bookingReference",
    "confirmationNo",
    "confirmationNumber",
    "externalBookingId",
    "reference",
    "bookingCode",
    "ota_booking_id",
    "confirmation_code",
    "bookingNumber",
    "booking_id_ext",
    "id",
  ];
  return firstNonEmptyString(layers, keys);
}

function pickRoomsFromLayers(layers: Record<string, unknown>[]): Record<string, unknown>[] {
  for (const layer of layers) {
    for (const key of ["rooms", "roomList", "room_stays", "roomStays"]) {
      const rm = layer[key];
      if (Array.isArray(rm) && rm.length) return rm as Record<string, unknown>[];
    }
    const single = layer.room;
    if (single && typeof single === "object" && !Array.isArray(single)) {
      return [single as Record<string, unknown>];
    }
  }
  return [];
}

function pickGuestObject(layers: Record<string, unknown>[]): Record<string, unknown> {
  for (const layer of layers) {
    const g = layer.guest;
    if (g && typeof g === "object" && !Array.isArray(g)) {
      return g as Record<string, unknown>;
    }
  }
  return {};
}

function isBadGuestNameToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || t === "null" || t === "undefined";
}

function pickGuestStringField(guest: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = guest[k];
    if (v == null || v === "") continue;
    const raw = String(v).trim();
    if (isBadGuestNameToken(raw)) continue;
    return raw;
  }
  return undefined;
}

function sanitizeGuestNameBuilt(s: string): string {
  let t = s.trim().replace(/\s+/g, " ");
  t = t.replace(/\s+(null|undefined)\s*$/gi, "").trim();
  t = t.replace(/^(null|undefined)\s+/gi, "").trim();
  if (isBadGuestNameToken(t)) return "";
  return t;
}

/**
 * Documentação Aiosell: `guest.firstName`/`lastName`, `rooms[].guestName`, valores na raiz.
 */
function buildAiosellGuestName(
  body: Record<string, unknown>,
  layers: Record<string, unknown>[],
  guest: Record<string, unknown>,
  room0: Record<string, unknown>
): string {
  const fromLayers = firstNonEmptyString(layers, ["guestName", "guest_name"]);
  if (fromLayers && !isBadGuestNameToken(fromLayers)) return sanitizeGuestNameBuilt(fromLayers);
  const bodyGn = body.guestName;
  if (typeof bodyGn === "string" && bodyGn.trim() && !isBadGuestNameToken(bodyGn.trim())) {
    return sanitizeGuestNameBuilt(bodyGn.trim());
  }
  const fromRoom = firstNonEmptyString([room0], ["guestName", "guest_name", "primaryGuestName"]);
  if (fromRoom && !isBadGuestNameToken(fromRoom)) return sanitizeGuestNameBuilt(fromRoom);
  const fn = pickGuestStringField(guest, ["firstName", "first_name", "givenName", "given_name"]);
  const ln = pickGuestStringField(guest, ["lastName", "last_name", "surname", "familyName"]);
  const combined = [fn, ln].filter((x): x is string => !!x && !isBadGuestNameToken(x)).join(" ").trim();
  if (combined) return sanitizeGuestNameBuilt(combined);
  const single = pickGuestStringField(guest, ["name", "fullName", "full_name"]);
  if (single) return sanitizeGuestNameBuilt(single);
  return "Hóspede OTA";
}

function pickGuestPhone(guest: Record<string, unknown>): string | null {
  const keys = ["phone", "mobile", "phoneNumber", "mobilePhone", "telephone", "tel"];
  for (const k of keys) {
    const v = guest[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickAiosellBookingMeta(body: Record<string, unknown>, layers: Record<string, unknown>[]) {
  const sourceChannel =
    firstNonEmptyString(layers, ["channel", "channelName", "sourceChannel", "otaChannel", "partnerChannel"]) ||
    (typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : "") ||
    "";
  const segment =
    firstNonEmptyString(layers, ["segment", "bookingSegment"]) ||
    (typeof body.segment === "string" && body.segment.trim() ? body.segment.trim() : "") ||
    "";
  const cmBookingId =
    firstNonEmptyString(layers, ["cmBookingId", "cm_booking_id", "itineraryId", "itinerary_id"]) || "";
  const specialRequests =
    firstNonEmptyString(layers, ["specialRequests", "special_requests", "remarks"]) || "";
  const bookedOn =
    firstNonEmptyString(layers, ["bookedOn", "booked_on", "bookingDate", "booking_date"]) || "";
  return {
    sourceChannel: sourceChannel || null,
    segment: segment || null,
    cmBookingId: cmBookingId || null,
    specialRequests: specialRequests || null,
    bookedOn: bookedOn || null,
  };
}

function guestAddressJson(addr: unknown): Record<string, unknown> | null {
  if (!addr || typeof addr !== "object" || Array.isArray(addr)) return null;
  return addr as Record<string, unknown>;
}

function buildAiosellReservationNotes(
  bookingId: string,
  meta: ReturnType<typeof pickAiosellBookingMeta>
): string {
  const parts: string[] = [`Aiosell booking ${bookingId}`];
  if (meta.sourceChannel) parts.push(`Canal parceiro: ${meta.sourceChannel}`);
  if (meta.segment) parts.push(`Segmento: ${meta.segment}`);
  if (meta.cmBookingId) parts.push(`CM booking: ${meta.cmBookingId}`);
  if (meta.bookedOn) parts.push(`Reservado em: ${meta.bookedOn}`);
  if (meta.specialRequests) parts.push(`Pedidos: ${meta.specialRequests}`);
  return parts.join(" · ");
}

function pickCheckIn(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "checkin",
    "checkIn",
    "checkin_date",
    "checkinDate",
    "arrivalDate",
    "arrival",
    "fromDate",
    "startDate",
    "check_in",
    "dateFrom",
    "start_date",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function pickCheckOut(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "checkout",
    "checkOut",
    "checkout_date",
    "checkoutDate",
    "departureDate",
    "departure",
    "toDate",
    "endDate",
    "check_out",
    "dateTo",
    "end_date",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function pickRoomCode(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "roomCode",
    "room_code",
    "roomTypeCode",
    "room_type_code",
    "categoryCode",
    "roomType",
    "roomId",
  ];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

function pickRateplanCode(room0: Record<string, unknown>, layers: Record<string, unknown>[]): string | undefined {
  const keys = ["rateplanCode", "rate_plan_code", "ratePlanCode", "rateCode", "mealPlanCode", "rate_plan"];
  const fromRoom = firstNonEmptyString([room0], keys);
  if (fromRoom) return fromRoom;
  return firstNonEmptyString(layers, keys);
}

/** Alinha com aiosell-sync (NBSP → espaço, trim) para bater com `aiosell_hotel_code` na BD. */
function normalizeAiosellCodeInput(s: unknown): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function extractNumberFromAmountLike(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (!Number.isNaN(n)) return n;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["amountAfterTax", "amountBeforeTax", "total", "amount", "grandTotal"]) {
      const n = extractNumberFromAmountLike(o[k]);
      if (n != null) return n;
    }
  }
  return undefined;
}

function pickTotalAmount(
  room0: Record<string, unknown>,
  body: Record<string, unknown>,
  layers: Record<string, unknown>[]
): number {
  const direct = extractNumberFromAmountLike(room0.amount) ?? extractNumberFromAmountLike(body.amount);
  if (direct != null) return direct;
  const keys = ["amount", "totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"];
  for (const k of keys) {
    const v = room0[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  for (const k of keys) {
    const v = body[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  for (const layer of layers) {
    for (const k of keys) {
      const v = layer[k];
      if (v != null && v !== "") {
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
      }
    }
  }
  return 0;
}

/**
 * Aplica um payload no formato Aiosell -> PMS (book / modify / cancel).
 * Usado pelo webhook e pela sincronização manual/pull.
 */
async function applyAiosellReservationPayload(
  supabase: SupabaseClient,
  channel: Record<string, unknown>,
  body: Record<string, unknown>,
  opts?: { logPrefix?: string }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const logPrefix = opts?.logPrefix ?? "aiosell-reservation";

  const layers = collectLayers(body);
  const action = normalizeActionFromLayers(layers);
  const bookingId = pickBookingIdFromLayers(layers);

  const guest = pickGuestObject(layers);
  const rooms = pickRoomsFromLayers(layers);
  const room0 = rooms[0] || {};
  const roomGuest =
    room0.guest && typeof room0.guest === "object" && !Array.isArray(room0.guest)
      ? (room0.guest as Record<string, unknown>)
      : {};
  const guestMerged = { ...guest, ...roomGuest };
  const guestName = buildAiosellGuestName(body, layers, guestMerged, room0);
  const meta = pickAiosellBookingMeta(body, layers);
  const guestPhone = pickGuestPhone(guestMerged);
  const guestAddr = guestAddressJson(guestMerged.address);

  const checkIn = pickCheckIn(room0, layers);
  const checkOut = pickCheckOut(room0, layers);

  const roomCode = pickRoomCode(room0, layers);
  const rateplanCode = pickRateplanCode(room0, layers);

  const establishmentId = channel.establishment_id as string;

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("checkin_time, checkout_time")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (action.includes("cancel")) {
    if (!bookingId) {
      return { status: 400, json: { success: false, error: "bookingId obrigatório para cancel" } };
    }
    const { data: otaRow } = await supabase
      .from("ota_reservations")
      .select("reservation_id")
      .eq("ota_channel_id", channel.id)
      .eq("ota_reservation_code", String(bookingId))
      .maybeSingle();
    if (!otaRow?.reservation_id) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada" } };
    }
    const { error: updErr } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", otaRow.reservation_id);
    if (updErr) {
      return { status: 500, json: { success: false, error: updErr.message } };
    }
    return { status: 200, json: { success: true, action: "cancel", reservation_id: otaRow.reservation_id } };
  }

  if (action.includes("modify") || action.includes("update")) {
    if (!bookingId) {
      return { status: 400, json: { success: false, error: "bookingId obrigatório para alteração" } };
    }
    if (!checkIn || !checkOut) {
      return { status: 400, json: { success: false, error: "Datas obrigatórias para alteração" } };
    }
    const { data: otaRow } = await supabase
      .from("ota_reservations")
      .select("reservation_id")
      .eq("ota_channel_id", channel.id)
      .eq("ota_reservation_code", String(bookingId))
      .maybeSingle();
    if (!otaRow?.reservation_id) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada" } };
    }
    const patch: Record<string, unknown> = {
      checkin_date: checkIn,
      checkout_date: checkOut,
      guest_name: guestName,
    };
    const amt = room0.amount ?? room0.totalAmount ?? body.totalAmount ?? body.amount;
    const numAmt = extractNumberFromAmountLike(amt) ?? (amt != null && amt !== "" ? Number(amt) : NaN);
    if (numAmt != null && !Number.isNaN(numAmt)) patch.total_amount = numAmt;
    const modifyPrepaid = isAiosellPrepaidBooking(layers, body);
    if (modifyPrepaid && numAmt != null && !Number.isNaN(numAmt) && numAmt > 0) {
      patch.paid_amount = numAmt;
      patch.payment_status = "paid";
    }
    const { error: updErr } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", otaRow.reservation_id);
    if (updErr) {
      return { status: 500, json: { success: false, error: updErr.message } };
    }
    await supabase
      .from("ota_reservations")
      .update({
        ota_guest_name: guestName,
        ota_guest_email: (guestMerged.email as string) || null,
        ota_guest_phone: guestPhone,
        ota_source_channel_name: meta.sourceChannel,
        ota_segment: meta.segment,
        ota_cm_booking_id: meta.cmBookingId,
        ota_special_requests: meta.specialRequests,
        ota_guest_address: guestAddr,
      })
      .eq("ota_channel_id", channel.id)
      .eq("ota_reservation_code", String(bookingId));
    if (modifyPrepaid && numAmt != null && !Number.isNaN(numAmt) && numAmt > 0) {
      const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
        reservationId: otaRow.reservation_id,
        establishmentId,
        amount: numAmt,
        bookingId: String(bookingId),
        partnerChannelName: meta.sourceChannel,
      });
      if (payErr.error) {
        console.warn(`${logPrefix} prepaid payment (modify)`, payErr.error);
      }
    }
    return { status: 200, json: { success: true, action: "modify", reservation_id: otaRow.reservation_id } };
  }

  // book (default)
  if (!bookingId) {
    console.warn(`${logPrefix} 400: bookingId ausente`, { rootKeys: Object.keys(body) });
    return { status: 400, json: { success: false, error: "bookingId obrigatório" } };
  }
  if (!checkIn || !checkOut) {
    console.warn(`${logPrefix} 400: datas ausentes`, {
      hasCheckIn: !!checkIn,
      hasCheckOut: !!checkOut,
      rootKeys: Object.keys(body),
    });
    return { status: 400, json: { success: false, error: "checkIn/checkOut obrigatórios" } };
  }
  if (!roomCode) {
    console.warn(`${logPrefix} 400: roomCode ausente`, { rootKeys: Object.keys(body) });
    return { status: 400, json: { success: false, error: "roomCode obrigatório" } };
  }

  const { data: existingOta } = await supabase
    .from("ota_reservations")
    .select("reservation_id")
    .eq("ota_channel_id", channel.id)
    .eq("ota_reservation_code", String(bookingId))
    .maybeSingle();

  if (existingOta?.reservation_id) {
    return {
      status: 200,
      json: {
        success: true,
        action: "book",
        already_exists: true,
        reservation_id: existingOta.reservation_id,
      },
    };
  }

  const { data: pricingRows } = await supabase
    .from("channel_pricing")
    .select("category_id, pricing_plan_id, channel_room_code, channel_rate_plan_code")
    .eq("ota_channel_id", channel.id)
    .eq("is_active", true);

  let mapping = (pricingRows || []).find(
    (p: { channel_room_code?: unknown; channel_rate_plan_code?: unknown }) =>
      p.channel_room_code &&
      String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase() &&
      (!rateplanCode ||
        !p.channel_rate_plan_code ||
        String(p.channel_rate_plan_code).toUpperCase() === String(rateplanCode).toUpperCase())
  );

  if (!mapping) {
    mapping = (pricingRows || []).find(
      (p: { channel_room_code?: unknown }) =>
        p.channel_room_code &&
        String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase()
    );
  }

  if (!mapping?.category_id) {
    console.warn(`${logPrefix} 400: mapeamento channel_pricing`, {
      roomCode,
      rateplanCode: rateplanCode ?? null,
    });
    return {
      status: 400,
      json: {
        success: false,
        error:
          "Mapeamento não encontrado: configure Tarifa por Canal com Room Code / Rate Plan Code para este canal Aiosell",
      },
    };
  }

  const total = pickTotalAmount(room0, body, layers);
  const prepaid = isAiosellPrepaidBooking(layers, body);

  const occ = room0.occupancy && typeof room0.occupancy === "object" && !Array.isArray(room0.occupancy)
    ? (room0.occupancy as Record<string, unknown>)
    : {};
  const baseNotes = buildAiosellReservationNotes(String(bookingId), meta);
  const reservationData: Record<string, unknown> = {
    guest_name: guestName,
    adults: Number(room0.adults ?? occ.adults ?? body.adults ?? 2),
    children: Number(room0.children ?? occ.children ?? body.children ?? 0),
    total_amount: total,
    paid_amount: prepaid && total > 0 ? total : 0,
    payment_status: prepaid && total > 0 ? "paid" : "pending",
    status: "pending",
    channel: "ota",
    notes: prepaid ? `${baseNotes} · Pagamento: pré-pago (OTA)` : baseNotes,
    checkin_time: hotelSettings?.checkin_time ?? null,
    checkout_time: hotelSettings?.checkout_time ?? null,
  };

  if (mapping.pricing_plan_id) {
    reservationData.pricing_plan_id = mapping.pricing_plan_id;
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
    p_reservation_data: reservationData,
    p_checkin_date: checkIn,
    p_checkout_date: checkOut,
    p_establishment_id: establishmentId,
    p_room_id: null,
    p_category_id: mapping.category_id,
  });

  if (rpcErr) {
    return { status: 500, json: { success: false, error: rpcErr.message } };
  }

  let res = rpcResult as { success?: boolean; error?: string; reservation_id?: string };
  if (typeof rpcResult === "string") {
    try {
      res = JSON.parse(rpcResult) as typeof res;
    } catch {
      return { status: 500, json: { success: false, error: "Resposta RPC inválida" } };
    }
  }
  if (!res?.success) {
    console.warn(`${logPrefix} 400: create_reservation_with_lock`, {
      rpcMessage: res?.error ?? null,
    });
    return { status: 400, json: { success: false, error: res?.error || "Falha ao criar reserva" } };
  }

  const rid = res.reservation_id as string;

  const { error: otaInsErr } = await supabase.from("ota_reservations").insert({
    reservation_id: rid,
    ota_channel_id: channel.id,
    ota_reservation_code: String(bookingId),
    ota_guest_name: guestName,
    ota_guest_email: (guestMerged.email as string) || null,
    ota_guest_phone: guestPhone,
    ota_source_channel_name: meta.sourceChannel,
    ota_segment: meta.segment,
    ota_cm_booking_id: meta.cmBookingId,
    ota_special_requests: meta.specialRequests,
    ota_guest_address: guestAddr,
    sync_status: "synced",
    synced_at: new Date().toISOString(),
  });

  if (otaInsErr) {
    return {
      status: 500,
      json: { success: false, error: `Reserva criada mas vínculo OTA falhou: ${otaInsErr.message}` },
    };
  }

  if (prepaid && total > 0) {
    const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
      reservationId: rid,
      establishmentId,
      amount: total,
      bookingId: String(bookingId),
      partnerChannelName: meta.sourceChannel,
    });
    if (payErr.error) {
      console.warn(`${logPrefix} prepaid payment insert`, payErr.error);
    }
  }

  return {
    status: 200,
    json: {
      success: true,
      action: "book",
      reservation_id: rid,
      prepaid_recorded: prepaid && total > 0,
    },
  };
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-aiosell-secret, x-webhook-secret, x-api-secret, x-api-key",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBasicAuth(header: string | null): { user: string; pass: string } | null {
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  try {
    const b64 = header.slice(6).trim();
    const bin = atob(b64);
    const idx = bin.indexOf(":");
    if (idx < 0) return null;
    return { user: bin.slice(0, idx), pass: bin.slice(idx + 1) };
  } catch {
    return null;
  }
}

/** Bearer token (ex.: Aiosell envia Authorization: Bearer em vez de Basic). */
function parseBearerToken(header: string | null): string | null {
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const t = header.slice(7).trim();
  return t || null;
}

/** Alguns clientes usam `Authorization: Token <segredo>`. */
function parseTokenScheme(header: string | null): string | null {
  if (!header?.toLowerCase().startsWith("token ")) return null;
  const t = header.slice(6).trim();
  return t || null;
}

function parseBearerOrTokenAuth(header: string | null): string | null {
  return parseBearerToken(header) || parseTokenScheme(header);
}

/** Formato típico de JWT (anon Supabase, etc.) — não usar como "password" do canal. */
function looksLikeJwt(token: string): boolean {
  const t = token.trim();
  if (!t.startsWith("eyJ")) return false;
  const parts = t.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** JWT anon / service_role / publishable — não são credenciais do canal Aiosell. */
function isSupabasePlatformBearer(token: string | null): boolean {
  if (!token?.trim()) return false;
  const t = token.trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const sr = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const pub = (Deno.env.get("SB_PUBLISHABLE_KEY") ?? "").trim();
  return (anon && t === anon) || (sr && t === sr) || (pub && t === pub);
}

/**
 * Bearer que conta como credencial do canal: não é JWT de plataforma nem JWT opaco (eyJ…)
 * salvo quando coincide com webhook secret ou api_secret.
 */
function resolveBearerForChannel(
  bearerRaw: string | null,
  whSecret: string,
  apiSecret: string
): string | null {
  if (!bearerRaw?.trim()) return null;
  const b = bearerRaw.trim();
  if (whSecret && b === whSecret) return b;
  if (apiSecret && b === apiSecret) return b;
  if (isSupabasePlatformBearer(b)) return null;
  if (looksLikeJwt(b)) return null;
  return b;
}

/** Segredo de webhook na raiz ou em `data` (payloads aninhados da Aiosell). */
function pickWebhookSecretFromBody(body: Record<string, unknown>): string {
  const root =
    (typeof body.secret === "string" ? body.secret.trim() : "") ||
    (typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : "") ||
    (typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "") ||
    (typeof body.authToken === "string" ? body.authToken.trim() : "");
  if (root) return root;
  const d = body.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return "";
  const data = d as Record<string, unknown>;
  return (
    (typeof data.webhookSecret === "string" ? data.webhookSecret.trim() : "") ||
    (typeof data.webhook_secret === "string" ? data.webhook_secret.trim() : "") ||
    (typeof data.authToken === "string" ? data.authToken.trim() : "") ||
    (typeof data.secret === "string" ? data.secret.trim() : "") ||
    ""
  );
}

/**
 * Query string: credencial do canal (igual api_secret ou aiosell_webhook_secret).
 * Nomes alternativos porque alguns painéis só permitem acrescentar "?token=" etc.
 * Não incluir `gate` aqui — esse parâmetro é só para AIOSELL_WEBHOOK_GATE_KEY.
 */
function pickSecretFromQuery(url: URL): string {
  const names = ["secret", "token", "auth", "webhook_secret", "pms_secret", "key"];
  for (const n of names) {
    const v = url.searchParams.get(n)?.trim();
    if (v) return v;
  }
  return "";
}

/** Segundo fator na URL: define o mesmo valor em Supabase Secrets como AIOSELL_WEBHOOK_GATE_KEY (útil quando o CM não envia headers). */
function gateKeyMatchesUrl(url: URL): boolean {
  const envGate = (Deno.env.get("AIOSELL_WEBHOOK_GATE_KEY") ?? "").trim();
  if (!envGate) return false;
  const g = url.searchParams.get("gate")?.trim();
  return !!g && g === envGate;
}

/** Alguns CMs enviam API secret no JSON (sem Basic no header). Nomes específicos para não confundir com dados de hóspede. */
function pickBodyApiSecretToken(layers: Record<string, unknown>[]): string {
  return (
    firstNonEmptyString(layers, [
      "apiSecret",
      "api_secret",
      "pmsApiSecret",
      "channelApiSecret",
      "webhookApiSecret",
    ]) ?? ""
  );
}

/** Par user/password no corpo (equivalente a Basic Auth). */
function bodyApiKeySecretMatchesChannel(
  channel: { api_key?: unknown; api_secret?: unknown },
  layers: Record<string, unknown>[]
): boolean {
  const k = firstNonEmptyString(layers, [
    "apiKey",
    "api_key",
    "pmsApiKey",
    "username",
    "user",
  ]);
  const s = firstNonEmptyString(layers, [
    "apiSecret",
    "api_secret",
    "pmsApiSecret",
  ]);
  if (!k || !s) return false;
  return (
    String(channel.api_key ?? "").trim() === k &&
    String(channel.api_secret ?? "").trim() === s
  );
}

function envFlagTrue(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Contingência quando o CM (ex.: Stay OS) não envia headers, query nem campos de segredo no JSON.
 * Definir secret no projeto: AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY=true
 * Opcional: AIOSELL_WEBHOOK_TRUST_HOTEL_CODES=codigo1,codigo2 (restringe por hotelCode do body).
 * Menos seguro que ?secret= ou Basic — usar só se não houver alternativa.
 */
function trustHotelCodeBypass(
  hotelCode: string | undefined,
  otaChannelIdParam: string | null
): boolean {
  if (!envFlagTrue("AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY")) return false;
  if (otaChannelIdParam) return true;
  const hc = normalizeAiosellCodeInput(hotelCode ?? "");
  if (!hc) return false;
  const allow = (Deno.env.get("AIOSELL_WEBHOOK_TRUST_HOTEL_CODES") ?? "").trim();
  if (!allow) return true;
  const codes = allow.split(",").map((s) => normalizeAiosellCodeInput(s)).filter(Boolean);
  return codes.some((c) => c.toLowerCase() === hc.toLowerCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ success: false, error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.warn("aiosell-reservation-webhook 400: corpo não é JSON");
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const url = new URL(req.url);
  const otaChannelIdParam = url.searchParams.get("ota_channel_id");

  const layers = collectLayers(body);
  const hotelCode = firstNonEmptyString(layers, [
    "hotelCode",
    "hotelId",
    "propertyCode",
    "propertyId",
    "hotel_code",
    "property_id",
  ]);
  if (!hotelCode && !otaChannelIdParam) {
    console.warn("aiosell-reservation-webhook 400: hotelCode ou ota_channel_id", {
      rootKeys: Object.keys(body),
    });
    return jsonResponse(
      { success: false, error: "hotelCode (ou query ota_channel_id) é obrigatório" },
      400
    );
  }

  let channel: any = null;
  if (otaChannelIdParam) {
    const { data, error } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("id", otaChannelIdParam)
      .eq("channel_manager_type", "aiosell")
      .maybeSingle();
    if (error || !data) {
      return jsonResponse({ success: false, error: "Canal Aiosell não encontrado" }, 404);
    }
    channel = data;
  } else {
    const { data, error } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("channel_manager_type", "aiosell")
      .eq("aiosell_hotel_code", normalizeAiosellCodeInput(hotelCode))
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      return jsonResponse({ success: false, error: "Canal Aiosell não encontrado para este hotelCode" }, 404);
    }
    channel = data;
  }

  const authHeader = req.headers.get("Authorization");
  const secretHeader =
    req.headers.get("x-aiosell-secret") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-api-secret");
  const apikeyHeader = req.headers.get("apikey")?.trim() ?? "";
  const xApiKeyHeader = req.headers.get("x-api-key")?.trim() ?? "";
  const basic = parseBasicAuth(authHeader);
  const bearerRaw = parseBearerOrTokenAuth(authHeader);
  const whSecret = String(channel.aiosell_webhook_secret ?? "").trim();
  const configuredWebhookSecret = whSecret.length > 0;
  const apiSecret = String(channel.api_secret ?? "").trim();

  /** Chamadas à URL Supabase: Bearer JWT anon ou `apikey` com anon — não contar como segredo do canal. */
  const bearerForChannel = resolveBearerForChannel(bearerRaw, whSecret, apiSecret);

  const tokenFromBody = pickWebhookSecretFromBody(body);
  const bodyApiSecretToken = pickBodyApiSecretToken(layers);
  const bodyPairOk = bodyApiKeySecretMatchesChannel(channel, layers);

  const apikeyAsSecret =
    apikeyHeader && !isSupabasePlatformBearer(apikeyHeader) ? apikeyHeader : "";
  const xApiKeyAsSecret =
    xApiKeyHeader && !isSupabasePlatformBearer(xApiKeyHeader) ? xApiKeyHeader : "";

  const querySecretVal = pickSecretFromQuery(url);
  const gateOk = gateKeyMatchesUrl(url);

  const inlineSecret =
    (secretHeader && secretHeader.trim()) ||
    querySecretVal ||
    tokenFromBody ||
    bodyApiSecretToken ||
    apikeyAsSecret ||
    xApiKeyAsSecret;

  /** Header/query/body: com webhook secret na BD só aceita esse valor; senão aceita api_secret (mesmo que Aiosell envie só no header). */
  const secretOk =
    !!inlineSecret &&
    (configuredWebhookSecret
      ? inlineSecret === whSecret
      : !!(apiSecret && inlineSecret === apiSecret));

  const basicOk =
    basic &&
    String(channel.api_key ?? "").trim() === String(basic.user ?? "").trim() &&
    apiSecret === String(basic.pass ?? "").trim();
  const bearerOk =
    !!bearerForChannel &&
    (bearerForChannel === whSecret ||
      (!configuredWebhookSecret &&
        channel.api_key &&
        apiSecret &&
        bearerForChannel === apiSecret));

  const trustOkEnv = trustHotelCodeBypass(hotelCode, otaChannelIdParam);
  const trustOkChannel = channel.aiosell_webhook_trust_hotel_only === true;
  const trustOk = trustOkEnv || trustOkChannel;

  if (!secretOk && !basicOk && !bearerOk && !bodyPairOk && !gateOk && !trustOk) {
    console.warn("aiosell-reservation-webhook: auth failed (sem segredos)", {
      hasHotelCode: !!hotelCode,
      hasOtaChannelIdParam: !!otaChannelIdParam,
      configuredWebhookSecret,
      hasSecretHeader: !!(secretHeader && secretHeader.trim()),
      hasQuerySecret: !!querySecretVal,
      gateConfigured: !!(Deno.env.get("AIOSELL_WEBHOOK_GATE_KEY") ?? "").trim(),
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
    });
    return jsonResponse(
      {
        success: false,
        error: "Unauthorized",
        hint:
          "A Aiosell muitas vezes envia só o JSON (hotelCode) sem Basic Auth. No PMS: Channel Manager → Editar canal Aiosell → ative «Aceitar webhook só com hotelCode». Ou use na URL do webhook ?secret= com o mesmo valor do api_secret, ou configure Basic (usuário = api_key, senha = api_secret). No Supabase: confirme deploy com verify_jwt=false (supabase/config.toml) e, se precisar, o secret AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY.",
      },
      401
    );
  }

  if (trustOk && !(secretOk || basicOk || bearerOk || bodyPairOk || gateOk)) {
    console.warn(
      `aiosell-reservation-webhook: webhook sem credencial HTTP aceite (${trustOkEnv ? "secret AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY" : ""}${trustOkEnv && trustOkChannel ? " e " : ""}${trustOkChannel ? "opção no canal (aiosell_webhook_trust_hotel_only)" : ""})`
    );
  }

  const result = await applyAiosellReservationPayload(supabase, channel, body, {
    logPrefix: "aiosell-reservation-webhook",
  });
  return jsonResponse(result.json, result.status);
});