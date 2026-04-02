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

/** Documentação Aiosell: `guest.firstName`/`lastName`, `rooms[].guestName`. */
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
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function basicAuthHeader(username: string, password: string): string {
  const token = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${token}`;
}

/**
 * Junta URL base do canal com o path do endpoint (mesma regra que aiosell-sync).
 */
function joinBaseUrlAndPath(base: string, path: string): string {
  const b = (base || "").trim().replace(/\/$/, "");
  let p = (path ?? "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  try {
    if (/^\/api\/v2\/cm\//i.test(p)) {
      return `${new URL(b).origin}${p}`;
    }
  } catch {
    /* base inválida */
  }
  const baseEndsWithCm = /\/cm$/i.test(b);
  if (baseEndsWithCm && /^\/cm(\/|$)/i.test(p)) {
    p = p.replace(/^\/cm/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
  }
  let out = `${b}${p}`;
  out = out.replace(/(\/cm)\/cm(\/)/gi, "$1$2");
  return out;
}

function normalizeChannelCodeInput(s: unknown): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function extractBookingsArray(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    for (const k of ["bookings", "reservations", "data", "items", "results", "records"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function addDaysIso(d: Date, days: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "Não autorizado" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ success: false, error: "Sessão inválida ou expirada" }, 401);
  }

  const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  const db = supabaseAdmin ?? supabaseUser;

  let body: {
    channel_id?: string;
    establishment_id?: string;
    bookings?: unknown[];
    pull?: boolean;
    days?: number;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "JSON inválido" }, 400);
  }

  const channelId = body.channel_id;
  if (!channelId) {
    return jsonResponse({ success: false, error: "channel_id obrigatório" }, 400);
  }

  const { data: channel, error: channelError } = await db.from("ota_channels").select("*").eq("id", channelId).single();

  if (channelError || !channel) {
    return jsonResponse({ success: false, error: "Canal não encontrado" }, 404);
  }

  if (channel.channel_manager_type !== "aiosell") {
    return jsonResponse({ success: false, error: "Canal não é Aiosell" }, 400);
  }

  const fromChannel = channel.establishment_id as string | null;
  const fromBody = body.establishment_id ?? null;
  const establishmentId = (fromChannel || fromBody) as string | null;

  if (!establishmentId) {
    return jsonResponse(
      {
        success: false,
        error: "establishment_id em falta ou canal sem estabelecimento.",
      },
      400
    );
  }

  if (fromChannel && fromBody && fromChannel !== fromBody) {
    return jsonResponse({ success: false, error: "establishment_id não coincide com o canal." }, 400);
  }

  const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
    p_user_id: user.id,
    p_establishment_id: establishmentId,
  });

  if (accessRpcError) {
    return jsonResponse(
      {
        success: false,
        error: `Não foi possível validar permissão: ${accessRpcError.message}`,
      },
      500
    );
  }
  if (canAccess !== true) {
    return jsonResponse({ success: false, error: "Sem permissão para este estabelecimento" }, 403);
  }

  const days = Math.min(365, Math.max(0, Number(body.days ?? 0) || 0));
  const daysBack = days || 30;
  const daysAhead = days || 90;

  let bookings: Record<string, unknown>[] = [];

  if (Array.isArray(body.bookings) && body.bookings.length > 0) {
    bookings = body.bookings.filter((b) => b && typeof b === "object") as Record<string, unknown>[];
  } else if (body.pull === true) {
    const listPath = (channel as { aiosell_bookings_list_path?: string | null }).aiosell_bookings_list_path?.trim();
    if (!listPath) {
      return jsonResponse(
        {
          success: false,
          error:
            "Preencha `aiosell_bookings_list_path` no canal (endpoint GET fornecido pela Aiosell) ou envie `bookings: [...]` no corpo.",
          hint:
            "A documentação pública Aiosell descreve apenas o webhook push; o endpoint de listagem depende do contrato com o suporte Aiosell.",
        },
        400
      );
    }

    const apiUser = channel.api_key as string | null;
    const apiPass = channel.api_secret as string | null;
    const hotelCodeRaw = (channel.aiosell_hotel_code as string | null)?.trim() || null;
    const hotelCode = hotelCodeRaw ? normalizeChannelCodeInput(hotelCodeRaw) : null;

    if (!apiUser || !apiPass || !hotelCode) {
      return jsonResponse(
        {
          success: false,
          error: "Configure api_key, api_secret e aiosell_hotel_code no canal para pull HTTP.",
        },
        400
      );
    }

    const baseUrl = (channel.aiosell_base_url as string) || "https://live.aiosell.com";
    const url = joinBaseUrlAndPath(baseUrl, listPath);
    const u = new URL(url);
    const fromDate = addDaysIso(new Date(), -daysBack);
    const toDate = addDaysIso(new Date(), daysAhead);
    if (!u.searchParams.has("hotelCode")) u.searchParams.set("hotelCode", hotelCode);
    if (!u.searchParams.has("fromDate")) u.searchParams.set("fromDate", fromDate);
    if (!u.searchParams.has("toDate")) u.searchParams.set("toDate", toDate);

    const res = await fetch(u.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(apiUser, apiPass),
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Resposta do canal não é JSON",
          status: res.status,
          preview: text.slice(0, 400),
        },
        502
      );
    }

    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          error: `HTTP ${res.status} ao obter reservas`,
          body: parsed,
        },
        502
      );
    }

    bookings = extractBookingsArray(parsed);
  } else {
    return jsonResponse(
      {
        success: false,
        error: "Envie `bookings` (array de payloads) ou `pull: true` com `aiosell_bookings_list_path` configurado.",
      },
      400
    );
  }

  if (bookings.length === 0) {
    return jsonResponse({
      success: true,
      processed: 0,
      results: [],
      message: "Nenhuma reserva para processar.",
    });
  }

  const results: Record<string, unknown>[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of bookings) {
    const r = await applyAiosellReservationPayload(db, channel as Record<string, unknown>, item, {
      logPrefix: "aiosell-reservations-sync",
    });
    const j = r.json as Record<string, unknown>;
    const bid = String((item as { bookingId?: unknown }).bookingId ?? (item as { cmBookingId?: unknown }).cmBookingId ?? "");
    if (r.status >= 200 && r.status < 300 && j.success) {
      if (j.already_exists) skipped++;
      else if (j.action === "book") created++;
      results.push({ bookingId: bid || null, booking_id: bid || null, status: "ok", ...j });
    } else {
      failed++;
      results.push({
        bookingId: bid || null,
        booking_id: bid || null,
        status: "error",
        httpStatus: r.status,
        error: j.error ?? j,
      });
    }
  }

  return jsonResponse({
    success: true,
    processed: bookings.length,
    created,
    skipped,
    failed,
    results,
  });
});
