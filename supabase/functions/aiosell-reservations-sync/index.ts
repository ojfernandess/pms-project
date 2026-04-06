import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Inline: o bundler de deploy só inclui `index.ts` (não ficheiros irmãos). */
async function triggerAiosellAvailabilitySync(args: {
  channelId: string;
  establishmentId: string;
  logPrefix?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) {
    console.warn(
      `${args.logPrefix ?? "triggerAiosellAvailabilitySync"}: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente`
    );
    return { ok: false, error: "misconfigured" };
  }
  const invokeUrl = `${url}/functions/v1/aiosell-sync`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    const r = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        apikey: key,
      },
      body: JSON.stringify({
        channel_id: args.channelId,
        establishment_id: args.establishmentId,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const text = await r.text();
    if (!r.ok) {
      console.warn(
        `${args.logPrefix ?? "triggerAiosellAvailabilitySync"}: aiosell-sync HTTP ${r.status}`,
        text.slice(0, 500)
      );
      return { ok: false, status: r.status, error: text.slice(0, 240) };
    }
    try {
      const j = JSON.parse(text) as { success?: boolean; error?: string };
      if (j.success === false) {
        return { ok: false, error: j.error ?? "sync_failed" };
      }
    } catch {
      /* resposta não JSON */
    }
    return { ok: true, status: r.status };
  } catch (e) {
    console.warn(`${args.logPrefix ?? "triggerAiosellAvailabilitySync"}`, e);
    return { ok: false, error: String(e) };
  }
}

function scheduleAiosellAvailabilitySync(args: {
  channelId: string;
  establishmentId: string;
  logPrefix?: string;
}): void {
  const p = triggerAiosellAvailabilitySync(args);
  const g = globalThis as { EdgeRuntime?: { waitUntil: (x: Promise<unknown>) => void } };
  if (g.EdgeRuntime?.waitUntil) {
    g.EdgeRuntime.waitUntil(p);
  } else {
    void p;
  }
}

function envFlagTrue(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function splitAiosellRatePlanCodes(raw: unknown): string[] {
  const s = String(raw ?? "").replace(/\u00a0/g, " ");
  if (!s.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(/[,;\n\r]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function channelRateplanMatchesAiosell(stored: unknown, incoming: string | null | undefined): boolean {
  if (incoming == null || !String(incoming).trim()) return true;
  const s = String(stored ?? "").trim();
  if (!s) return true;
  const want = String(incoming).toUpperCase().trim();
  return splitAiosellRatePlanCodes(s).some((c) => c.toUpperCase() === want);
}

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
  for (const layer of layers) {
    const s = layer.status;
    if (s == null || s === "") continue;
    const t = String(s).trim().toLowerCase();
    if (t === "cancelled" || t === "canceled") return "cancel";
    if (t === "modified" || t === "update") return "modify";
  }
  return "";
}

function pickBookingIdFromLayers(layers: Record<string, unknown>[]): string | undefined {
  const keys = [
    "bookingId",
    "cmBookingId",
    "otaBookingId",
    "reservation_id",
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

function pickTotalAmountFromRoomObjectOnly(room0: Record<string, unknown>): number | null {
  const direct =
    extractNumberFromAmountLike(room0.amount) ?? extractNumberFromAmountLike(room0.total);
  if (direct != null) return direct;
  const keys = ["totalAmount", "total_amount", "totalPrice", "total_price", "grandTotal", "price"];
  for (const k of keys) {
    const v = room0[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function summarizeAiosellRoomLine(
  room: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  const rc = pickRoomCode(room, []);
  const rpc = pickRateplanCode(room, []);
  const perRoom = pickTotalAmountFromRoomObjectOnly(room);
  const amountKeys = ["amount", "total", "totalAmount", "total_amount", "totalPrice", "grandTotal", "price"].filter(
    (k) => room[k] != null && room[k] !== ""
  );
  return {
    index,
    roomCode: rc ?? null,
    rateplanCode: rpc ?? null,
    amount_numeric_on_room: perRoom,
    amount_fields_present: amountKeys,
  };
}

function splitMoneyAcrossParts(total: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

function computePerRoomAmounts(
  rooms: Record<string, unknown>[],
  room0: Record<string, unknown>,
  body: Record<string, unknown>,
  layers: Record<string, unknown>[]
): { amounts: number[]; strategy: "per_room_lines" | "split_booking_total" } {
  if (rooms.length === 0) return { amounts: [], strategy: "split_booking_total" };
  const per = rooms.map((r) => pickTotalAmountFromRoomObjectOnly(r));
  const allSet = per.length > 0 && per.every((a) => a != null && !Number.isNaN(a));
  if (allSet) {
    return { amounts: per.map((a) => a as number), strategy: "per_room_lines" };
  }
  const bookingTotal = pickTotalAmount(room0, body, layers);
  return { amounts: splitMoneyAcrossParts(bookingTotal, rooms.length), strategy: "split_booking_total" };
}

function otaReservationCodeForRoom(bookingId: string, roomIndex: number, multiRoom: boolean): string {
  return multiRoom ? `${bookingId}#${roomIndex}` : bookingId;
}

async function listOtaRowsForAiosellBooking(
  supabase: SupabaseClient,
  channelId: string,
  bookingId: string
): Promise<{ id: string; reservation_id: string; ota_reservation_code: string }[]> {
  const { data, error } = await supabase
    .from("ota_reservations")
    .select("id, reservation_id, ota_reservation_code")
    .eq("ota_channel_id", channelId)
    .like("ota_reservation_code", `${bookingId}%`);
  if (error || !data?.length) return [];
  return data.filter(
    (r) =>
      r.ota_reservation_code === bookingId || String(r.ota_reservation_code).startsWith(`${bookingId}#`)
  );
}

function findChannelPricingMapping(
  roomCode: string | undefined,
  rateplanCode: string | undefined,
  pricingRows: { channel_room_code?: unknown; channel_rate_plan_code?: unknown; category_id?: unknown }[] | null
): { category_id: string; pricing_plan_id?: string | null } | null {
  if (!roomCode) return null;
  let mapping = (pricingRows || []).find(
    (p) =>
      p.channel_room_code &&
      String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase() &&
      channelRateplanMatchesAiosell(p.channel_rate_plan_code, rateplanCode)
  );
  if (!mapping) {
    mapping = (pricingRows || []).find(
      (p) =>
        p.channel_room_code &&
        String(p.channel_room_code).toUpperCase() === String(roomCode).toUpperCase()
    );
  }
  if (!mapping?.category_id) return null;
  return { category_id: mapping.category_id as string, pricing_plan_id: (mapping.pricing_plan_id as string) ?? null };
}

async function applyAiosellReservationPayload(
  supabase: SupabaseClient,
  channel: Record<string, unknown>,
  body: Record<string, unknown>,
  opts?: { logPrefix?: string; requestPathname?: string }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const logPrefix = opts?.logPrefix ?? "aiosell-reservations-sync";

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

  const totalOnRoom0Only = pickTotalAmountFromRoomObjectOnly(room0);
  const roomSummaryLines = rooms.map((r, i) => summarizeAiosellRoomLine(r, i));
  console.info(
    `${logPrefix} booking_payload_shape`,
    JSON.stringify({
      booking_id: bookingId ?? null,
      action: action || "(empty)",
      rooms_count: rooms.length,
      room_lines: roomSummaryLines,
      room0_only_amount: totalOnRoom0Only,
      mapped_room_code: roomCode ?? null,
      mapped_rateplan_code: rateplanCode ?? null,
    })
  );

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
    const otaRows = await listOtaRowsForAiosellBooking(supabase, channel.id as string, String(bookingId));
    if (otaRows.length === 0) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada" } };
    }
    const ids = otaRows.map((r) => r.reservation_id);
    const { error: updErr } = await supabase.from("reservations").update({ status: "cancelled" }).in("id", ids);
    if (updErr) {
      return { status: 500, json: { success: false, error: updErr.message } };
    }
    return {
      status: 200,
      json: {
        success: true,
        action: "cancel",
        reservation_id: ids[0],
        reservation_ids: ids,
        cancelled_count: ids.length,
      },
    };
  }

  if (action.includes("modify") || action.includes("update")) {
    if (!bookingId) {
      return { status: 400, json: { success: false, error: "bookingId obrigatório para alteração" } };
    }
    if (!checkIn || !checkOut) {
      return { status: 400, json: { success: false, error: "Datas obrigatórias para alteração" } };
    }
    const otaRows = await listOtaRowsForAiosellBooking(supabase, channel.id as string, String(bookingId));
    if (otaRows.length === 0) {
      return { status: 404, json: { success: false, error: "Reserva OTA não encontrada" } };
    }
    const amt = room0.amount ?? room0.totalAmount ?? body.totalAmount ?? body.amount;
    const numAmt = extractNumberFromAmountLike(amt) ?? (amt != null && amt !== "" ? Number(amt) : NaN);
    const modifyPrepaid = isAiosellPrepaidBooking(layers, body);
    const n = otaRows.length;
    const amountParts =
      numAmt != null && !Number.isNaN(numAmt) && n > 1 ? splitMoneyAcrossParts(numAmt, n) : null;

    for (let i = 0; i < otaRows.length; i++) {
      const patch: Record<string, unknown> = {
        checkin_date: checkIn,
        checkout_date: checkOut,
        guest_name: guestName,
      };
      if (numAmt != null && !Number.isNaN(numAmt)) {
        const part = amountParts ? amountParts[i] : numAmt;
        patch.total_amount = part;
        if (modifyPrepaid && part > 0) {
          patch.paid_amount = part;
          patch.payment_status = "paid";
        }
      }
      const { error: updErr } = await supabase
        .from("reservations")
        .update(patch)
        .eq("id", otaRows[i].reservation_id);
      if (updErr) {
        return { status: 500, json: { success: false, error: updErr.message } };
      }
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
      .in("id", otaRows.map((r) => r.id));

    if (modifyPrepaid && numAmt != null && !Number.isNaN(numAmt) && numAmt > 0) {
      for (let i = 0; i < otaRows.length; i++) {
        const part = amountParts ? amountParts[i] : numAmt;
        if (part > 0) {
          const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
            reservationId: otaRows[i].reservation_id,
            establishmentId,
            amount: part,
            bookingId: `${String(bookingId)}#${i}`,
            partnerChannelName: meta.sourceChannel,
          });
          if (payErr.error) {
            console.warn(`${logPrefix} prepaid payment (modify)`, payErr.error);
          }
        }
      }
    }
    return {
      status: 200,
      json: {
        success: true,
        action: "modify",
        reservation_id: otaRows[0].reservation_id,
        reservation_ids: otaRows.map((r) => r.reservation_id),
        updated_count: otaRows.length,
      },
    };
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

  const prepaid = isAiosellPrepaidBooking(layers, body);
  const bookingTotal = pickTotalAmount(room0, body, layers);

  const { data: pricingRows } = await supabase
    .from("channel_pricing")
    .select("category_id, pricing_plan_id, channel_room_code, channel_rate_plan_code")
    .eq("ota_channel_id", channel.id)
    .eq("is_active", true);

  if (rooms.length > 1) {
    const { data: ex0 } = await supabase
      .from("ota_reservations")
      .select("reservation_id")
      .eq("ota_channel_id", channel.id)
      .eq("ota_reservation_code", `${String(bookingId)}#0`)
      .maybeSingle();
    if (ex0?.reservation_id) {
      return {
        status: 200,
        json: {
          success: true,
          action: "book",
          already_exists: true,
          multi_room: true,
          reservation_id: ex0.reservation_id,
        },
      };
    }

    for (let i = 0; i < rooms.length; i++) {
      const rc = pickRoomCode(rooms[i], layers);
      const rpc = pickRateplanCode(rooms[i], layers);
      const mapping = findChannelPricingMapping(rc, rpc, pricingRows || []);
      if (!rc || !mapping?.category_id) {
        return {
          status: 400,
          json: {
            success: false,
            error: !rc
              ? `roomCode obrigatório (quarto ${i + 1})`
              : `Mapeamento não encontrado para o quarto ${i + 1} (${rc} / ${rpc ?? "—"}).`,
          },
        };
      }
    }

    const { amounts, strategy } = computePerRoomAmounts(rooms, room0, body, layers);
    console.info(
      `${logPrefix} book_amount_resolution`,
      JSON.stringify({
        booking_id: bookingId,
        booking_total: bookingTotal,
        per_room_amounts: amounts,
        split_strategy: strategy,
        prepaid,
        rooms_count: rooms.length,
        multi_room: true,
      })
    );

    const baseNotes = buildAiosellReservationNotes(String(bookingId), meta);
    const createdIds: string[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const rc = pickRoomCode(room, layers);
      const rpc = pickRateplanCode(room, layers);
      const mapping = findChannelPricingMapping(rc, rpc, pricingRows || [])!;
      const ci = pickCheckIn(room, layers) || checkIn;
      const co = pickCheckOut(room, layers) || checkOut;

      const rg =
        room.guest && typeof room.guest === "object" && !Array.isArray(room.guest)
          ? (room.guest as Record<string, unknown>)
          : {};
      const guestMerged_i = { ...guest, ...rg };
      const guestName_i = buildAiosellGuestName(body, layers, guestMerged_i, room);
      const guestPhone_i = pickGuestPhone(guestMerged_i);
      const guestAddr_i = guestAddressJson(guestMerged_i.address);

      const occ =
        room.occupancy && typeof room.occupancy === "object" && !Array.isArray(room.occupancy)
          ? (room.occupancy as Record<string, unknown>)
          : {};
      const total_i = amounts[i] ?? 0;
      const roomLabel = ` · Quarto ${i + 1}/${rooms.length} (Aiosell)`;
      const reservationData: Record<string, unknown> = {
        guest_name: guestName_i,
        adults: Number(room.adults ?? occ.adults ?? body.adults ?? 2),
        children: Number(room.children ?? occ.children ?? body.children ?? 0),
        total_amount: total_i,
        paid_amount: prepaid && total_i > 0 ? total_i : 0,
        payment_status: prepaid && total_i > 0 ? "paid" : "pending",
        status: "pending",
        channel: "ota",
        notes: prepaid
          ? `${baseNotes}${roomLabel} · Pagamento: pré-pago (OTA)`
          : `${baseNotes}${roomLabel}`,
        checkin_time: hotelSettings?.checkin_time ?? null,
        checkout_time: hotelSettings?.checkout_time ?? null,
      };
      if (mapping.pricing_plan_id) {
        reservationData.pricing_plan_id = mapping.pricing_plan_id;
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
        p_reservation_data: reservationData,
        p_checkin_date: ci,
        p_checkout_date: co,
        p_establishment_id: establishmentId,
        p_room_id: null,
        p_category_id: mapping.category_id,
      });

      if (rpcErr) {
        return { status: 500, json: { success: false, error: rpcErr.message } };
      }

      let resRpc = rpcResult as { success?: boolean; error?: string; reservation_id?: string };
      if (typeof rpcResult === "string") {
        try {
          resRpc = JSON.parse(rpcResult) as typeof resRpc;
        } catch {
          return { status: 500, json: { success: false, error: "Resposta RPC inválida" } };
        }
      }
      if (!resRpc?.success) {
        console.warn(`${logPrefix} 400: create_reservation_with_lock`, {
          rpcMessage: resRpc?.error ?? null,
          room_index: i,
        });
        return { status: 400, json: { success: false, error: resRpc?.error || "Falha ao criar reserva" } };
      }

      const rid = resRpc.reservation_id as string;
      createdIds.push(rid);

      const otaCode = otaReservationCodeForRoom(String(bookingId), i, true);
      const { error: otaInsErr } = await supabase.from("ota_reservations").insert({
        reservation_id: rid,
        ota_channel_id: channel.id,
        ota_reservation_code: otaCode,
        ota_guest_name: guestName_i,
        ota_guest_email: (guestMerged_i.email as string) || null,
        ota_guest_phone: guestPhone_i,
        ota_source_channel_name: meta.sourceChannel,
        ota_segment: meta.segment,
        ota_cm_booking_id: meta.cmBookingId,
        ota_special_requests: meta.specialRequests,
        ota_guest_address: guestAddr_i,
        sync_status: "synced",
        synced_at: new Date().toISOString(),
      });

      if (otaInsErr) {
        return {
          status: 500,
          json: { success: false, error: `Reserva criada mas vínculo OTA falhou: ${otaInsErr.message}` },
        };
      }

      if (prepaid && total_i > 0) {
        const payErr = await insertAiosellChannelPrepaidPayment(supabase, {
          reservationId: rid,
          establishmentId,
          amount: total_i,
          bookingId: otaCode,
          partnerChannelName: meta.sourceChannel,
        });
        if (payErr.error) {
          console.warn(`${logPrefix} prepaid payment insert`, payErr.error);
        }
      }
    }

    return {
      status: 200,
      json: {
        success: true,
        action: "book",
        multi_room: true,
        reservation_ids: createdIds,
        reservation_id: createdIds[0],
        rooms_created: createdIds.length,
        prepaid_recorded: prepaid && amounts.some((a) => a > 0),
      },
    };
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

  const mapping = findChannelPricingMapping(roomCode, rateplanCode, pricingRows || []);

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

  const total = bookingTotal;
  console.info(
    `${logPrefix} book_amount_resolution`,
    JSON.stringify({
      booking_id: bookingId,
      total_amount_used_for_pms: total,
      total_on_room0_object_only: totalOnRoom0Only,
      prepaid,
      rooms_count: rooms.length,
    })
  );

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
  let shouldPushAvailability = false;

  for (const item of bookings) {
    const r = await applyAiosellReservationPayload(db, channel as Record<string, unknown>, item, {
      logPrefix: "aiosell-reservations-sync",
    });
    const j = r.json as Record<string, unknown>;
    const bid = String((item as { bookingId?: unknown }).bookingId ?? (item as { cmBookingId?: unknown }).cmBookingId ?? "");
    if (r.status >= 200 && r.status < 300 && j.success) {
      if (j.already_exists) skipped++;
      else if (j.action === "book") created++;
      const action = String(j.action ?? "");
      if (action === "cancel" || action === "modify") {
        shouldPushAvailability = true;
      } else if (action === "book" && !j.already_exists) {
        shouldPushAvailability = true;
      }
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

  if (
    shouldPushAvailability &&
    !envFlagTrue("AIOSELL_SKIP_POST_INVENTORY_SYNC") &&
    (channel as { sync_enabled?: unknown }).sync_enabled !== false &&
    (channel as { is_active?: unknown }).is_active !== false
  ) {
    const est = (channel as { establishment_id?: unknown }).establishment_id as string | undefined;
    if (est) {
      scheduleAiosellAvailabilitySync({
        channelId: String((channel as { id: unknown }).id),
        establishmentId: est,
        logPrefix: "aiosell-reservations-sync",
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
