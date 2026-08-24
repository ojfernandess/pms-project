import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * StayOS PMS → Bukly Channel Manager (OTA 2013A XML).
 * Doc: https://pms.bukly.com / docs/bukly.pdf
 * - Authorization: Basic api_user:api_pass (ota_channels.api_key / api_secret)
 * - HotelCode: ota_channels.bukly_hotel_id
 * - InvTypeCode / RatePlanCode: channel_pricing.channel_room_code / channel_rate_plan_code
 * - POST OTA_HotelRateAmountNotifRQ + OTA_HotelAvailNotifRQ
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYNC_DAYS_AHEAD = 365;
const OTA_NS = "http://www.opentravel.org/OTA/2003/05";
const MAX_MESSAGES_PER_REQUEST = 80;
const RATE_CALENDAR_PAGE = 1000;

type AnyObj = Record<string, unknown>;

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
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

function requestorId(): string {
  const fromEnv = (Deno.env.get("BUKLY_REQUESTOR_ID") ?? "").trim();
  return fromEnv || "STAYOS";
}

function xmlHasSuccess(body: string): boolean {
  return /<\s*Success\s*\/?\s*>/i.test(body);
}

function extractOtaErrors(body: string): string[] {
  const out: string[] = [];
  const re = /<Error\b[^>]*>([\s\S]*?)<\/Error>|<Error\b[^>]*\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const text = (m[1] || m[0] || "").replace(/<[^>]+>/g, "").trim();
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
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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

/** Compact consecutive same-value day rows into Start/End ranges. */
function compactDaily<T extends { date: string; key: string; valueKey: string }>(
  rows: T[],
): Array<T & { start: string; end: string }> {
  const sorted = [...rows].sort((a, b) =>
    a.key === b.key ? a.date.localeCompare(b.date) : a.key.localeCompare(b.key),
  );
  const out: Array<T & { start: string; end: string }> = [];
  for (const row of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.key === row.key &&
      last.valueKey === row.valueKey &&
      addDaysYmd(last.end, 1) === row.date
    ) {
      last.end = row.date;
    } else {
      out.push({ ...row, start: row.date, end: row.date });
    }
  }
  return out;
}

function buildRateAmountNotifXml(
  hotelCode: string,
  reqId: string,
  messages: RateLine[],
): string {
  const parts = messages
    .map((m) => {
      return `<RateAmountMessage>
  <StatusApplicationControl InvTypeCode="${escapeXml(m.invTypeCode)}" RatePlanCode="${escapeXml(m.ratePlanCode)}" Start="${escapeXml(m.start)}" End="${escapeXml(m.end)}"/>
  <Rates>
    <Rate CurrencyCode="BRL" Start="${escapeXml(m.start)}" End="${escapeXml(m.end)}">
      <BaseByGuestAmts>
        <BaseByGuestAmt AmountAfterTax="${escapeXml(m.amount.toFixed(2))}"/>
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

function buildAvailNotifXml(
  hotelCode: string,
  reqId: string,
  messages: AvailLine[],
): string {
  const parts = messages
    .map((m) => {
      const los: string[] = [];
      if (m.minLos != null && Number(m.minLos) > 0) {
        los.push(
          `<LengthOfStay MinMaxMessageType="SetMinLOS" Time="${escapeXml(Math.floor(Number(m.minLos)))}"/>`,
        );
      }
      if (m.maxLos != null && Number(m.maxLos) > 0) {
        los.push(
          `<LengthOfStay MinMaxMessageType="SetMaxLOS" Time="${escapeXml(Math.floor(Number(m.maxLos)))}"/>`,
        );
      }
      const lengths =
        los.length > 0 ? `<LengthsOfStay>\n${los.join("\n")}\n</LengthsOfStay>` : "";

      const restrictions: string[] = [];
      if (m.stopSell) {
        restrictions.push(`<RestrictionStatus Status="Close"/>`);
      } else {
        restrictions.push(`<RestrictionStatus Status="Open"/>`);
      }
      if (m.cta) {
        restrictions.push(`<RestrictionStatus Status="Close" Restriction="Arrival"/>`);
      } else {
        restrictions.push(`<RestrictionStatus Status="Open" Restriction="Arrival"/>`);
      }
      if (m.ctd) {
        restrictions.push(`<RestrictionStatus Status="Close" Restriction="Departure"/>`);
      } else {
        restrictions.push(`<RestrictionStatus Status="Open" Restriction="Departure"/>`);
      }

      return `<AvailStatusMessage BookingLimit="${escapeXml(m.bookingLimit)}">
  <StatusApplicationControl InvTypeCode="${escapeXml(m.invTypeCode)}" RatePlanCode="${escapeXml(m.ratePlanCode)}" Start="${escapeXml(m.start)}" End="${escapeXml(m.end)}"/>
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

async function postOtaXml(
  apiUrl: string,
  auth: string,
  xml: string,
): Promise<{ ok: boolean; status: number; body: string; errors: string[] }> {
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
  return {
    ok,
    status: res.status,
    body: body.slice(0, 4000),
    errors: ok ? [] : extractOtaErrors(body).length
      ? extractOtaErrors(body)
      : [`HTTP ${res.status}: ${body.slice(0, 300) || res.statusText}`],
  };
}

async function fetchAllRateCalendar(
  db: ReturnType<typeof createClient>,
  establishmentId: string,
  from: string,
  to: string,
): Promise<AnyObj[]> {
  const all: AnyObj[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("rate_calendar")
      .select("id, date, category_id, pricing_plan_id, base_price, adult_price, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell_ota, stop_sell_booking_engine")
      .eq("establishment_id", establishmentId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + RATE_CALENDAR_PAGE - 1);
    if (error) throw error;
    const batch = (data as AnyObj[]) || [];
    all.push(...batch);
    if (batch.length < RATE_CALENDAR_PAGE) break;
    offset += RATE_CALENDAR_PAGE;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ success: false, error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const internalServiceAuth = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

  let db: ReturnType<typeof createClient>;

  if (internalServiceAuth) {
    db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ success: false, error: "Sessão inválida ou expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    db = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabaseUser;
  }

  let body: { channel_id?: string; establishment_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const channelId = body.channel_id;
  if (!channelId) {
    return new Response(JSON.stringify({ success: false, error: "channel_id obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const todayUtcMinus1 = new Date(Date.now() - 86_400_000);
  const today = todayUtcMinus1.toISOString().split("T")[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + SYNC_DAYS_AHEAD);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  const { data: channel, error: channelError } = await db
    .from("ota_channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (channelError || !channel) {
    return new Response(JSON.stringify({ success: false, error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (channel.channel_manager_type !== "bukly") {
    return new Response(JSON.stringify({ success: false, error: "Canal não é Bukly" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (channel.is_active === false) {
    return new Response(JSON.stringify({ success: false, error: "Canal Bukly inativo" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const establishmentId =
    (body.establishment_id as string | undefined) ||
    (channel.establishment_id as string | undefined);
  if (!establishmentId) {
    return new Response(JSON.stringify({ success: false, error: "establishment_id obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const hotelCode = normalizeCode(channel.bukly_hotel_id);
  const apiUser = normalizeCode(channel.api_key);
  const apiPass = String(channel.api_secret ?? "");
  const apiUrl = normalizeCode(channel.bukly_api_url) || "https://pms.bukly.com";

  if (!hotelCode || !apiUser || !apiPass) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Credenciais Bukly incompletas (HotelCode, usuário e senha Basic Auth)",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: pricingRows, error: pricingError } = await db
    .from("channel_pricing")
    .select("id, category_id, pricing_plan_id, channel_room_code, channel_rate_plan_code, is_active, fixed_price, price_multiplier")
    .eq("ota_channel_id", channelId)
    .eq("is_active", true);

  if (pricingError) {
    return new Response(JSON.stringify({ success: false, error: pricingError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  type Mapping = {
    categoryId: string;
    planId: string | null;
    invTypeCode: string;
    ratePlanCode: string;
    fixedPrice: number | null;
    priceMultiplier: number | null;
  };

  const mappings: Mapping[] = [];
  const skippedUnmapped: string[] = [];

  for (const row of pricingRows || []) {
    const room = normalizeCode((row as AnyObj).channel_room_code);
    const rate = normalizeCode((row as AnyObj).channel_rate_plan_code);
    const categoryId = String((row as AnyObj).category_id || "");
    if (!categoryId) continue;
    if (!room || !rate) {
      skippedUnmapped.push(`categoria ${categoryId}: faltam InvTypeCode/RatePlanCode`);
      continue;
    }
    const fixedRaw = (row as AnyObj).fixed_price;
    const multRaw = (row as AnyObj).price_multiplier;
    const fixedNum = fixedRaw != null && fixedRaw !== "" ? Number(fixedRaw) : null;
    const multNum = multRaw != null && multRaw !== "" ? Number(multRaw) : null;
    mappings.push({
      categoryId,
      planId: (row as AnyObj).pricing_plan_id
        ? String((row as AnyObj).pricing_plan_id)
        : null,
      invTypeCode: room,
      ratePlanCode: rate,
      fixedPrice: fixedNum != null && Number.isFinite(fixedNum) ? fixedNum : null,
      priceMultiplier: multNum != null && Number.isFinite(multNum) && multNum > 0 ? multNum : null,
    });
  }

  if (mappings.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Nenhum mapeamento Bukly ativo com Room Code (InvTypeCode) e Rate Plan Code. Configure em Tarifas por canal.",
        skippedUnmapped,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await db
    .from("ota_channels")
    .update({ bukly_sync_status: "syncing", sync_status: "syncing" })
    .eq("id", channelId);

  let syncLogId: string | null = null;
  try {
    const { data: logRow } = await db
      .from("bukly_sync_logs")
      .insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        sync_type: "full",
        status: "pending",
        sync_data: { hotelCode, mappingCount: mappings.length, skippedUnmapped },
      })
      .select("id")
      .single();
    syncLogId = (logRow as { id?: string } | null)?.id ?? null;
  } catch (e) {
    console.warn("bukly_sync_logs insert skipped", e);
  }

  try {
    const rateCalendar = await fetchAllRateCalendar(db, establishmentId, today, futureDateStr);

    const { data: rooms, error: roomsError } = await db
      .from("rooms")
      .select("id, category_id, is_blocked, status, is_active")
      .eq("establishment_id", establishmentId);
    if (roomsError) throw roomsError;

    const activeRooms = (rooms || []).filter((r: AnyObj) => {
      if (r.is_active === false) return false;
      if (r.is_blocked === true) return false;
      if (r.status === "maintenance") return false;
      return !!r.category_id;
    });

    const { data: reservations, error: resError } = await db
      .from("reservations")
      .select("category_id, checkin_date, checkout_date, room_id, status")
      .eq("establishment_id", establishmentId)
      .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"]);
    if (resError) throw resError;

    const roomsByCategory = new Map<string, string[]>();
    for (const r of activeRooms) {
      const cat = String((r as AnyObj).category_id);
      if (!roomsByCategory.has(cat)) roomsByCategory.set(cat, []);
      roomsByCategory.get(cat)!.push(String((r as AnyObj).id));
    }

    const occupiedByCategoryDate = new Map<string, Set<string>>();
    for (const res of reservations || []) {
      const checkin = String((res as AnyObj).checkin_date || "").slice(0, 10);
      const checkout = String((res as AnyObj).checkout_date || "").slice(0, 10);
      if (!checkin || !checkout) continue;
      let d = checkin;
      while (d < checkout) {
        if (d >= today && d <= futureDateStr) {
          const roomId = (res as AnyObj).room_id ? String((res as AnyObj).room_id) : null;
          const cat = (res as AnyObj).category_id
            ? String((res as AnyObj).category_id)
            : null;
          if (roomId && cat) {
            const key = `${cat}|${d}`;
            if (!occupiedByCategoryDate.has(key)) occupiedByCategoryDate.set(key, new Set());
            occupiedByCategoryDate.get(key)!.add(roomId);
          } else if (cat) {
            const key = `${cat}|${d}`;
            if (!occupiedByCategoryDate.has(key)) occupiedByCategoryDate.set(key, new Set());
            occupiedByCategoryDate.get(key)!.add(`anon-${(res as AnyObj).id || d}`);
          }
        }
        d = addDaysYmd(d, 1);
      }
    }

    function availableFor(categoryId: string, date: string): number {
      const roomIds = roomsByCategory.get(categoryId) || [];
      const total = roomIds.length;
      const occ = occupiedByCategoryDate.get(`${categoryId}|${date}`);
      if (!occ) return total;
      let used = 0;
      for (const id of roomIds) {
        if (occ.has(id)) used += 1;
      }
      // anonymous occupancy without room_id
      for (const id of occ) {
        if (id.startsWith("anon-")) used += 1;
      }
      return Math.max(0, total - used);
    }

    function resolvePrice(row: AnyObj, mapping: Mapping): number {
      if (mapping.fixedPrice != null) return mapping.fixedPrice;
      const base = Number(row.base_price ?? row.adult_price ?? 0);
      const baseOk = Number.isFinite(base) ? base : 0;
      if (mapping.priceMultiplier != null && mapping.priceMultiplier !== 1) {
        return baseOk * mapping.priceMultiplier;
      }
      return baseOk;
    }

    const dailyRates: Array<{
      date: string;
      key: string;
      valueKey: string;
      invTypeCode: string;
      ratePlanCode: string;
      amount: number;
    }> = [];

    const dailyAvail: Array<{
      date: string;
      key: string;
      valueKey: string;
      invTypeCode: string;
      ratePlanCode: string;
      bookingLimit: number;
      minLos?: number | null;
      maxLos?: number | null;
      cta?: boolean;
      ctd?: boolean;
      stopSell?: boolean;
    }> = [];

    for (const mapping of mappings) {
      const rows = rateCalendar.filter((r) => {
        if (String(r.category_id) !== mapping.categoryId) return false;
        if (mapping.planId) {
          return String(r.pricing_plan_id || "") === mapping.planId;
        }
        return true;
      });

      // If no plan filter and multiple plans, keep one row per date (prefer BAR-like first occurrence)
      const byDate = new Map<string, AnyObj>();
      for (const r of rows) {
        const date = String(r.date).slice(0, 10);
        if (!byDate.has(date)) byDate.set(date, r);
      }

      for (const [date, r] of byDate) {
        const amount = Math.round(resolvePrice(r, mapping) * 100) / 100;
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
        const minLos = Number(r.min_stay ?? 0) || null;
        const maxLos = Number(r.max_stay ?? 0) || null;
        const cta = !!r.closed_to_arrival;
        const ctd = !!r.closed_to_departure;
        const stopSell =
          !!(r.stop_sell_ota ?? r.stop_sell_booking_engine) || bookingLimit <= 0;
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

      // Fill availability for dates without tariff (zero avail) for mapped category window
      // only when we have rooms — skip empty calendars to avoid huge zero pushes
    }

    const rateMessages: RateLine[] = compactDaily(dailyRates).map((r) => ({
      invTypeCode: r.invTypeCode,
      ratePlanCode: r.ratePlanCode,
      start: r.start,
      end: r.end,
      amount: r.amount,
    }));

    const availMessages: AvailLine[] = compactDaily(dailyAvail).map((r) => ({
      invTypeCode: r.invTypeCode,
      ratePlanCode: r.ratePlanCode,
      start: r.start,
      end: r.end,
      bookingLimit: r.bookingLimit,
      minLos: r.minLos,
      maxLos: r.maxLos,
      cta: r.cta,
      ctd: r.ctd,
      stopSell: r.stopSell,
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
      const xml = buildRateAmountNotifXml(hotelCode, reqId, chunk);
      const result = await postOtaXml(apiUrl, auth, xml);
      ratesPosts += 1;
      if (!result.ok) {
        errors.push(...result.errors.map((e) => `Rates: ${e}`));
        break;
      }
    }

    if (errors.length === 0) {
      for (const chunk of chunkArray(availMessages, MAX_MESSAGES_PER_REQUEST)) {
        const xml = buildAvailNotifXml(hotelCode, reqId, chunk);
        const result = await postOtaXml(apiUrl, auth, xml);
        availPosts += 1;
        if (!result.ok) {
          errors.push(...result.errors.map((e) => `Avail: ${e}`));
          break;
        }
      }
    }

    const success = errors.length === 0;
    const nowIso = new Date().toISOString();

    await db
      .from("ota_channels")
      .update({
        bukly_sync_status: success ? "success" : "error",
        sync_status: success ? "success" : "error",
        bukly_last_sync_at: success ? nowIso : channel.bukly_last_sync_at,
        last_sync_at: success ? nowIso : undefined,
      })
      .eq("id", channelId);

    if (syncLogId) {
      await db
        .from("bukly_sync_logs")
        .update({
          status: success ? "success" : "error",
          records_synced: rateMessages.length + availMessages.length,
          error_message: success ? null : errors.join(" | ").slice(0, 2000),
          completed_at: nowIso,
          sync_data: {
            hotelCode,
            ratesMessages: rateMessages.length,
            availMessages: availMessages.length,
            ratesPosts,
            availPosts,
            skippedUnmapped,
            mappingCount: mappings.length,
          },
        })
        .eq("id", syncLogId);
    }

    return new Response(
      JSON.stringify({
        success,
        error: success ? undefined : errors[0] || "Falha na sincronização Bukly",
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
      }),
      {
        status: success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno Bukly sync";
    console.error("bukly-sync error", e);
    await db
      .from("ota_channels")
      .update({ bukly_sync_status: "error", sync_status: "error" })
      .eq("id", channelId);
    if (syncLogId) {
      await db
        .from("bukly_sync_logs")
        .update({
          status: "error",
          error_message: msg.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLogId);
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
