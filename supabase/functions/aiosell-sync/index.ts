import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Janela de sincronização (dias a partir de hoje). Menor = menos payload e menos tempo. */
const SYNC_DAYS_AHEAD = 180;

/**
 * Alinhamento com a documentação Aiosell (PMS → CM), KB:
 * https://support.aiosell.com/portal/en/kb/aiosell-kb/api-documentation
 * — Rate Push, Inventory Push, restrições (inventário/tarifa), NoShow (path opcional).
 * Preços e restrições de tarifa vão no mesmo POST `rates[]` para o CM não sobrescrever
 * o primeiro pedido com o segundo (tarifa «aberta» no CM após fechar no PMS).
 */

/**
 * Se "1" ou "true": não envia o POST de disponibilidade (inventário numérico) à Aiosell.
 * Útil para testar tarifas/restrições quando o CM ainda rejeita o payload de disponibilidade.
 * Supabase: Edge Function → Secrets → AIOSELL_SKIP_INVENTORY_AVAILABILITY=1
 */
function envFlagTrue(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function basicAuthHeader(username: string, password: string): string {
  const token = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${token}`;
}

/**
 * Junta URL base do canal com o path do endpoint.
 * Evita duplicar `/cm` quando a base já termina em `.../api/v2/cm` e o path foi guardado como
 * `/cm/update/...` (caso típico: 404 em `/api/v2/cm/cm/update/stayos-pms`).
 * Se o path já for absoluto `/api/v2/cm/...`, usa só o origin da base (evita .../cm/api/v2/cm/...).
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
    /* base inválida — continuar com concatenação simples */
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

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isNextDay(prev: string, next: string): boolean {
  return addDaysIso(prev, 1) === next;
}

/** YYYY-MM-DD — evita chaves duplicadas no merge e JSON inválido na Aiosell. */
function normalizeCalendarDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function safeIntNonNegative(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Remove caracteres de controlo; roomCode deve ser texto limpo para o parser da Aiosell. */
function sanitizeAiosellCode(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/** NBSP e espaços invisíveis vindos de copy-paste no painel Aiosell. */
function normalizeChannelCodeInput(s: unknown): string {
  return sanitizeAiosellCode(String(s ?? "").replace(/\u00a0/g, " ").trim());
}

/**
 * `rate_sales_status.status` — fechado para venda via OTA (alinhado a `is_date_available_for_sale`, canal ota).
 * closed / restricted_ota / restricted_all bloqueiam inventário OTA; restricted_booking_engine não.
 */
function isCategoryClosedForOtaChannel(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return s === "closed" || s === "restricted_ota" || s === "restricted_all";
}

/**
 * `rate_calendar.sales_status` por plano — «tarifa fechada» / sem preço no tarifário PMS.
 */
function isPlanTariffClosedInCalendar(row: Record<string, unknown>): boolean {
  const s = String(row.sales_status ?? "")
    .trim()
    .toLowerCase();
  return s === "closed" || s === "no_price";
}

/** Formato de restrições inventário/tarifa conforme doc Aiosell (PDF). */
function aiosellRestrictionShape(
  minStay: number,
  maxStay: number | null,
  closeOnArrival: boolean,
  closeOnDeparture: boolean,
  stopSell: boolean
): Record<string, unknown> {
  return {
    stopSell,
    exactStayArrival: null,
    maximumStayArrival: null,
    minimumAdvanceReservation: null,
    minimumStay: minStay,
    closeOnArrival,
    minimumStayArrival: null,
    maximumStay: maxStay,
    maximumAdvanceReservation: null,
    closeOnDeparture,
  };
}

function aggregateRowsToAiosellInvRestrictions(
  rows: Record<string, unknown>[]
): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  let minStay = 1;
  let maxStay: number | null = null;
  let closeOnArrival = false;
  let closeOnDeparture = false;
  let stopSell = false;
  let hasAny = false;
  for (const row of rows) {
    const ms = row.min_stay ?? row.min_los;
    const xs = row.max_stay ?? row.max_los;
    const cta = row.closed_to_arrival ?? row.cta;
    const ctd = row.closed_to_departure ?? row.ctd;
    const ss = row.stop_sell_ota ?? row.stop_sell_booking_engine;
    if (ms != null && Number(ms) > 1) {
      minStay = Math.max(minStay, Number(ms));
      hasAny = true;
    }
    if (xs != null) {
      const n = Number(xs);
      maxStay = maxStay === null ? n : Math.min(maxStay, n);
      hasAny = true;
    }
    if (cta) {
      closeOnArrival = true;
      hasAny = true;
    }
    if (ctd) {
      closeOnDeparture = true;
      hasAny = true;
    }
    if (ss) {
      stopSell = true;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return aiosellRestrictionShape(minStay, maxStay, closeOnArrival, closeOnDeparture, stopSell);
}

function rowToAiosellRateRestrictions(row: Record<string, unknown>): Record<string, unknown> | null {
  const ms = row.min_stay ?? row.min_los;
  const xs = row.max_stay ?? row.max_los;
  const cta = row.closed_to_arrival ?? row.cta;
  const ctd = row.closed_to_departure ?? row.ctd;
  const ss = row.stop_sell_ota ?? row.stop_sell_booking_engine;
  const planTariffClosed = isPlanTariffClosedInCalendar(row);
  const minStay = ms != null && Number(ms) > 0 ? Number(ms) : 1;
  const maxStay = xs != null ? Number(xs) : null;
  const has =
    planTariffClosed ||
    (ms != null && Number(ms) > 1) ||
    xs != null ||
    cta ||
    ctd ||
    ss;
  if (!has) return null;
  return aiosellRestrictionShape(minStay, maxStay, !!cta, !!ctd, Boolean(ss) || planTariffClosed);
}

/** Tarifa «aberta» no CM: enviar stopSell explícito para reapós fecho no PMS. */
function defaultOpenAiosellRateRestrictions(): Record<string, unknown> {
  return aiosellRestrictionShape(1, null, false, false, false);
}

/** Um único objeto `rates[]` com `rate` + `restrictions` (evita segundo POST a anular o primeiro). */
function effectiveRateRestrictionsForRow(row: Record<string, unknown>): Record<string, unknown> {
  return rowToAiosellRateRestrictions(row) ?? defaultOpenAiosellRateRestrictions();
}

type InvDayCombined = {
  date: string;
  available: number;
  /** null = sem bloco restrictions neste dia (só disponibilidade numérica). */
  restrictions: Record<string, unknown> | null;
};

/** Junta vários blocos com o mesmo período num único objeto (como no PDF da Aiosell). */
function mergeAiosellUpdatesByDateRange(
  updates: Record<string, unknown>[],
  itemsKey: "rooms" | "rates"
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const u of updates) {
    const sd = normalizeCalendarDate(u.startDate);
    const ed = normalizeCalendarDate(u.endDate);
    if (!sd || !ed || sd > ed) continue;
    const key = `${sd}|${ed}`;
    const items = (u[itemsKey] as Record<string, unknown>[]) || [];
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { startDate: sd, endDate: ed, [itemsKey]: [...items] });
    } else {
      const arr = prev[itemsKey] as Record<string, unknown>[];
      arr.push(...items);
    }
  }
  return [...map.values()];
}

/**
 * O merge por período concatena `rooms` de várias categorias PMS; se duas categorias mapeiam o mesmo
 * `roomCode` na Aiosell, o array fica com entradas duplicadas e a API responde "Payload Parsing Failed".
 * `dedupeInventoryCombinedUpdates` agrega disponibilidade + restrições no mesmo objeto `rooms[]`.
 */

function mergeTwoInvRestrictions(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const minStay = Math.max(Number(a.minimumStay ?? 1), Number(b.minimumStay ?? 1));
  const am = a.maximumStay as number | null | undefined;
  const bm = b.maximumStay as number | null | undefined;
  let maxStay: number | null = null;
  if (am != null && bm != null) maxStay = Math.min(Number(am), Number(bm));
  else maxStay = (am != null ? Number(am) : null) ?? (bm != null ? Number(bm) : null);
  return aiosellRestrictionShape(
    minStay,
    maxStay,
    Boolean(a.closeOnArrival) || Boolean(b.closeOnArrival),
    Boolean(a.closeOnDeparture) || Boolean(b.closeOnDeparture),
    Boolean(a.stopSell) || Boolean(b.stopSell)
  );
}

/**
 * Duplicados (mesmo roomCode + rateplanCode) — último preço ganha; restrições fazem merge (OR lógico).
 */
function dedupeRatePriceUpdates(updates: Record<string, unknown>[]): Record<string, unknown>[] {
  return updates
    .map((u) => {
      const rates = (u.rates as Record<string, unknown>[]) || [];
      const byKey = new Map<string, Record<string, unknown>>();
      for (const line of rates) {
        const rc = sanitizeAiosellCode(String(line.roomCode ?? ""));
        const rpc = sanitizeAiosellCode(String(line.rateplanCode ?? ""));
        if (!rc || !rpc) continue;
        const k = `${rc}\0${rpc}`;
        const prev = byKey.get(k);
        if (!prev) {
          byKey.set(k, line);
          continue;
        }
        const pRest = prev.restrictions as Record<string, unknown> | undefined;
        const nRest = line.restrictions as Record<string, unknown> | undefined;
        const mergedRest =
          pRest && nRest ? mergeTwoInvRestrictions(pRest, nRest) : nRest ?? pRest;
        byKey.set(k, {
          ...line,
          restrictions: mergedRest,
        });
      }
      const mergedRates = [...byKey.values()];
      return { ...u, rates: mergedRates };
    })
    .filter((u) => ((u.rates as unknown[]) || []).length > 0);
}

/** Inventário: disponibilidade + restrições no mesmo `rooms[]` (um POST por lote). */
function dedupeInventoryCombinedUpdates(updates: Record<string, unknown>[]): Record<string, unknown>[] {
  return updates
    .map((u) => {
      const rooms = (u.rooms as Record<string, unknown>[]) || [];
      const byCode = new Map<string, Record<string, unknown>>();
      for (const r of rooms) {
        const code = sanitizeAiosellCode(String(r.roomCode ?? ""));
        if (!code) continue;
        const av = safeIntNonNegative(r.available);
        const rest = r.restrictions as Record<string, unknown> | undefined;
        const prev = byCode.get(code);
        if (!prev) {
          const o: Record<string, unknown> = {
            available: av,
            roomCode: code,
          };
          if (rest) o.restrictions = rest;
          byCode.set(code, o);
          continue;
        }
        const mergedAv = safeIntNonNegative(prev.available) + av;
        const pRest = prev.restrictions as Record<string, unknown> | undefined;
        const mergedRest =
          pRest && rest ? mergeTwoInvRestrictions(pRest, rest) : rest ?? pRest;
        const o: Record<string, unknown> = {
          available: mergedAv,
          roomCode: code,
        };
        if (mergedRest) o.restrictions = mergedRest;
        byCode.set(code, o);
      }
      const mergedRooms = [...byCode.values()].sort((a, b) =>
        String(a.roomCode).localeCompare(String(b.roomCode))
      );
      return { ...u, rooms: mergedRooms };
    })
    .filter((u) => ((u.rooms as unknown[]) || []).length > 0);
}

function buildMergedDateRanges<T extends { date: string }>(
  days: T[],
  keyFn: (d: T) => string
): { startDate: string; endDate: string; slice: T[] }[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: { startDate: string; endDate: string; slice: T[] }[] = [];
  let i = 0;
  while (i < sorted.length) {
    const key0 = keyFn(sorted[i]);
    let j = i + 1;
    while (
      j < sorted.length &&
      keyFn(sorted[j]) === key0 &&
      isNextDay(sorted[j - 1].date, sorted[j].date)
    ) {
      j++;
    }
    const sd = normalizeCalendarDate(sorted[i].date);
    const ed = normalizeCalendarDate(sorted[j - 1].date);
    if (!sd || !ed || sd > ed) {
      i = j;
      continue;
    }
    out.push({
      startDate: sd,
      endDate: ed,
      slice: sorted.slice(i, j),
    });
    i = j;
  }
  return out;
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

  const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  /** Leituras críticas com service role (RLS não bloqueia dados na função). */
  const db = supabaseAdmin ?? supabaseUser;

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

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + SYNC_DAYS_AHEAD);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  const { data: channel, error: channelError } = await db.from("ota_channels").select("*").eq("id", channelId).single();

  if (channelError || !channel) {
    return new Response(JSON.stringify({ success: false, error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (channel.channel_manager_type !== "aiosell") {
    return new Response(JSON.stringify({ success: false, error: "Canal não é Aiosell" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fromChannel = channel.establishment_id as string | null;
  const fromBody = body.establishment_id ?? null;
  const establishmentId = (fromChannel || fromBody) as string | null;

  if (!establishmentId) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "O canal OTA não tem estabelecimento definido. Edite o canal e associe o estabelecimento ou sincronize com um estabelecimento selecionado na app.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (fromChannel && fromBody && fromChannel !== fromBody) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "establishment_id enviado não coincide com o estabelecimento do canal.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
    p_user_id: user.id,
    p_establishment_id: establishmentId,
  });

  if (accessRpcError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Não foi possível validar permissão: ${accessRpcError.message}. Confirme que a função user_can_access_establishment existe e tem GRANT EXECUTE para authenticated.`,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (canAccess !== true) {
    return new Response(JSON.stringify({ success: false, error: "Sem permissão para este estabelecimento" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!serviceRoleKey) {
    console.warn("[aiosell-sync] SUPABASE_SERVICE_ROLE_KEY ausente — usando JWT (RLS pode bloquear dados).");
  }

  const { data: rateCalendar, error: rateError } = await db
    .from("rate_calendar")
    .select(
      `
      *,
      pricing_plans (*),
      room_categories (*)
    `
    )
    .eq("establishment_id", establishmentId)
    .gte("date", today)
    .lte("date", futureDateStr)
    .order("date", { ascending: true });

  if (rateError) {
    return new Response(JSON.stringify({ success: false, error: rateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rateSalesStatusRows, error: rssError } = await db
    .from("rate_sales_status")
    .select("category_id, date, status")
    .eq("establishment_id", establishmentId)
    .gte("date", today)
    .lte("date", futureDateStr);

  if (rssError) {
    console.warn("[aiosell-sync] rate_sales_status (ARI):", rssError.message);
  }

  const salesStatusByCategoryDate = new Map<string, string>();
  for (const r of rateSalesStatusRows || []) {
    const cid = r.category_id as string;
    const d = normalizeCalendarDate(r.date);
    if (!d) continue;
    salesStatusByCategoryDate.set(`${cid}|${d}`, String(r.status ?? ""));
  }

  const { data: rooms, error: roomsError } = await db
    .from("rooms")
    .select("id, category_id")
    .eq("establishment_id", establishmentId);

  if (roomsError) {
    return new Response(JSON.stringify({ success: false, error: roomsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: reservations, error: reservationsError } = await db
    .from("reservations")
    .select("category_id, checkin_date, checkout_date, room_id")
    .eq("establishment_id", establishmentId)
    .in("status", ["pending", "confirmed", "checkedin"]);

  if (reservationsError) {
    return new Response(JSON.stringify({ success: false, error: reservationsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reservationsByCategory = new Map<string, typeof reservations>();
  for (const r of reservations || []) {
    const cid = r.category_id as string;
    if (!reservationsByCategory.has(cid)) reservationsByCategory.set(cid, []);
    reservationsByCategory.get(cid)!.push(r);
  }

  const { data: channelPricingConfig } = await db
    .from("channel_pricing")
    .select("*")
    .eq("ota_channel_id", channelId)
    .eq("is_active", true);

  const apiUser = channel.api_key as string | null;
  const apiPass = channel.api_secret as string | null;
  const hotelCodeRaw = (channel.aiosell_hotel_code as string | null)?.trim() || null;
  /** Deve coincidir com o ID do hotel no CM Aiosell (documentação: mesmo ID que no cadastro). */
  const hotelCode = hotelCodeRaw ? normalizeChannelCodeInput(hotelCodeRaw) : null;

  if (!apiUser || !apiPass || !hotelCode) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Configure usuário, senha (Basic Auth) e código do hotel Aiosell",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const baseUrl = (channel.aiosell_base_url as string) || "https://live.aiosell.com";
  const inventoryPath =
    (channel.aiosell_inventory_path as string) || "/api/v2/cm/update/sample-pms";
  const ratesPath = (channel.aiosell_rates_path as string) || "/api/v2/cm/update-rates/sample-pms";
  const inventoryUrl = joinBaseUrlAndPath(baseUrl, inventoryPath);
  const ratesUrl = joinBaseUrlAndPath(baseUrl, ratesPath);
  const auth = basicAuthHeader(apiUser, apiPass);

  const normPlanId = (p: unknown) => (p == null || p === "" ? null : String(p));

  const findPricingConfig = (categoryId: string, planId: string | null) => {
    const list = channelPricingConfig || [];
    const want = normPlanId(planId);
    const exact = list.find(
      (c: Record<string, unknown>) =>
        c.category_id === categoryId && normPlanId(c.pricing_plan_id) === want
    );
    if (exact) return exact;
    return list.find(
      (c: Record<string, unknown>) => c.category_id === categoryId && normPlanId(c.pricing_plan_id) === null
    );
  };

  const rows = (rateCalendar || []) as Record<string, unknown>[];

  {
    const seenPair = new Set<string>();
    const details: string[] = [];
    for (const rate of rows) {
      const categoryId = rate.category_id as string;
      const planId = rate.pricing_plan_id as string | null;
      const key = `${categoryId}\0${planId ?? ""}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const cfg = findPricingConfig(categoryId, planId);
      const room = normalizeChannelCodeInput(cfg?.channel_room_code);
      const rp = normalizeChannelCodeInput(cfg?.channel_rate_plan_code);
      if (!cfg || !room || !rp) {
        const rc = rate.room_categories as Record<string, unknown> | null | undefined;
        const pp = rate.pricing_plans as Record<string, unknown> | null | undefined;
        const catName = (rc?.name as string)?.trim() || categoryId;
        const planLabel = planId
          ? String((pp?.code as string) || (pp?.name as string) || planId).trim() || planId
          : "sem plano";
        details.push(
          `"${catName}" + plano "${planLabel}" — crie/edite uma linha em Tarifas por canal para este canal Aiosell com Room Code e Rate Plan Code (IDs CM).`
        );
      }
    }
    if (details.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Falta mapeamento Aiosell: em Tarifas por canal, para cada categoria e plano de tarifa que existe no calendário, preencha Room Code e Rate Plan Code iguais ao Channel Manager. Se um plano tiver código próprio na Aiosell, use uma linha por (categoria + plano); pode usar uma linha só por categoria (plano vazio) quando o mesmo par room+rate plan servir para todos os planos.",
          details: details.slice(0, 40),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const resolveRoomAndPlanCodes = (rate: Record<string, unknown>) => {
    const cfg = findPricingConfig(rate.category_id as string, rate.pricing_plan_id as string | null);
    const roomCode = normalizeChannelCodeInput(cfg?.channel_room_code);
    const rateplanCode = normalizeChannelCodeInput(cfg?.channel_rate_plan_code);
    return { roomCode, rateplanCode, cfg };
  };
  const rowsByCategoryDate = new Map<string, Record<string, unknown>[]>();
  for (const rate of rows) {
    const k = `${rate.category_id as string}|${String(rate.date)}`;
    if (!rowsByCategoryDate.has(k)) rowsByCategoryDate.set(k, []);
    rowsByCategoryDate.get(k)!.push(rate);
  }

  const categoryDates = new Map<string, Set<string>>();
  rows.forEach((rate) => {
    const cid = rate.category_id as string;
    if (!categoryDates.has(cid)) categoryDates.set(cid, new Set());
    categoryDates.get(cid)!.add(rate.date as string);
  });

  const invCombinedByCategory = new Map<string, InvDayCombined[]>();

  categoryDates.forEach((dates, categoryId) => {
    const categoryRooms = rooms?.filter((r) => r.category_id === categoryId) || [];
    const totalRooms = categoryRooms.length;
    const catRes = reservationsByCategory.get(categoryId) || [];

    dates.forEach((date) => {
      const currentDate = new Date(date + "T12:00:00");
      const occupiedRooms = catRes.filter((r) => {
        const checkin = new Date(r.checkin_date);
        const checkout = new Date(r.checkout_date);
        return currentDate >= checkin && currentDate < checkout;
      }).length;

      let available = Math.max(0, totalRooms - occupiedRooms);
      const rss = salesStatusByCategoryDate.get(`${categoryId}|${date}`) ?? null;
      if (isCategoryClosedForOtaChannel(rss)) {
        available = 0;
      }

      const rowGroup = rowsByCategoryDate.get(`${categoryId}|${date}`) || [];
      let agg = aggregateRowsToAiosellInvRestrictions(rowGroup);
      if (isCategoryClosedForOtaChannel(rss)) {
        const forced = aiosellRestrictionShape(1, null, false, false, true);
        agg = agg ? mergeTwoInvRestrictions(agg, forced) : forced;
      }

      const listC = invCombinedByCategory.get(categoryId) || [];
      listC.push({ date, available, restrictions: agg });
      invCombinedByCategory.set(categoryId, listC);
    });
  });

  const buildInventoryCombinedUpdates = (
    days: InvDayCombined[],
    roomCode: string
  ): Record<string, unknown>[] => {
    const rc = sanitizeAiosellCode(roomCode);
    if (!rc) return [];
    const ranges = buildMergedDateRanges(days, (d) =>
      JSON.stringify({
        a: d.available,
        r: d.restrictions,
      })
    );
    return ranges.map(({ startDate, endDate, slice }) => {
      const d0 = slice[0];
      const room: Record<string, unknown> = {
        available: safeIntNonNegative(d0.available),
        roomCode: rc,
      };
      if (d0.restrictions) {
        room.restrictions = d0.restrictions;
      }
      return { startDate, endDate, rooms: [room] };
    });
  };

  const inventoryCombinedUpdates: Record<string, unknown>[] = [];

  invCombinedByCategory.forEach((days, catId) => {
    const sampleRate = rows.find((r) => r.category_id === catId)!;
    const { roomCode } = resolveRoomAndPlanCodes(sampleRate);
    if (!sanitizeAiosellCode(roomCode)) return;
    inventoryCombinedUpdates.push(...buildInventoryCombinedUpdates(days, roomCode));
  });

  const inventoryCombinedPayload = dedupeInventoryCombinedUpdates(
    mergeAiosellUpdatesByDateRange(inventoryCombinedUpdates, "rooms")
  );

  /** Ordem alinhada ao payload típico CM: roomCode → rateplanCode → rate → restrictions. */
  type AiosellRateLine = {
    roomCode: string;
    rateplanCode: string;
    rate: number;
    restrictions: Record<string, unknown>;
  };

  const ratesByDate = new Map<string, AiosellRateLine[]>();
  rows.forEach((rate) => {
    const { roomCode, rateplanCode, cfg } = resolveRoomAndPlanCodes(rate);
    let finalPrice = Number(rate.base_price) || 0;
    if (cfg) {
      if (cfg.fixed_price != null) finalPrice = Number(cfg.fixed_price);
      else if (cfg.price_multiplier != null) {
        finalPrice = Number(rate.base_price) * Number(cfg.price_multiplier);
      }
    }
    const dateStr = String(rate.date);
    const line: AiosellRateLine = {
      roomCode: sanitizeAiosellCode(roomCode),
      rateplanCode: sanitizeAiosellCode(rateplanCode),
      rate: Number.isFinite(Math.round(finalPrice * 100) / 100) ? Math.round(finalPrice * 100) / 100 : 0,
      restrictions: effectiveRateRestrictionsForRow(rate),
    };
    if (!line.roomCode || !line.rateplanCode) return;
    const list = ratesByDate.get(dateStr) || [];
    list.push(line);
    ratesByDate.set(dateStr, list);
  });

  ratesByDate.forEach((arr) => {
    arr.sort((a, b) =>
      `${a.roomCode}\0${a.rateplanCode}`.localeCompare(`${b.roomCode}\0${b.rateplanCode}`)
    );
  });

  const sortedRateDates = [...ratesByDate.keys()].sort();
  const rateUpdates: { startDate: string; endDate: string; rates: AiosellRateLine[] }[] = [];
  let ri = 0;
  while (ri < sortedRateDates.length) {
    const ratesSnapshot = JSON.stringify(ratesByDate.get(sortedRateDates[ri])!);
    let rj = ri + 1;
    while (
      rj < sortedRateDates.length &&
      JSON.stringify(ratesByDate.get(sortedRateDates[rj])!) === ratesSnapshot &&
      isNextDay(sortedRateDates[rj - 1], sortedRateDates[rj])
    ) {
      rj++;
    }
    rateUpdates.push({
      startDate: sortedRateDates[ri],
      endDate: sortedRateDates[rj - 1],
      rates: ratesByDate.get(sortedRateDates[ri])!,
    });
    ri = rj;
  }

  const rateUpdatesPayload = dedupeRatePriceUpdates(
    mergeAiosellUpdatesByDateRange(
      rateUpdates as unknown as Record<string, unknown>[],
      "rates"
    )
  );

  const rateLineCount = rateUpdates.reduce((acc, u) => acc + u.rates.length, 0);

  const uniqueRoomCodes = new Set<string>();
  const uniqueRateplanCodes = new Set<string>();
  rows.forEach((rate) => {
    const { roomCode, rateplanCode } = resolveRoomAndPlanCodes(rate);
    uniqueRoomCodes.add(roomCode);
    uniqueRateplanCodes.add(rateplanCode);
  });

  /**
   * A Aiosell pode responder HTTP 200 com JSON { success: false, message: "..." }.
   * Só tratar como sucesso quando o corpo não contradiz (doc: { success: true, message }).
   */
  async function postToAiosell(
    url: string,
    payload: Record<string, unknown>,
    label: string
  ): Promise<
    | { ok: true; aiosellMessage?: string }
    | { ok: false; msg: string }
  > {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
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
    if (!res.ok) {
      const msg = `${label} (HTTP ${res.status}): ${text || res.statusText}`;
      await db
        .from("ota_channels")
        .update({ sync_status: "error", sync_error: msg })
        .eq("id", channelId);
      return { ok: false, msg };
    }
    if (parsed && typeof parsed.success === "boolean" && parsed.success === false) {
      const detail =
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.error === "string" && parsed.error) ||
        text ||
        "success=false";
      const msg = `${label}: ${detail}`;
      await db
        .from("ota_channels")
        .update({ sync_status: "error", sync_error: msg })
        .eq("id", channelId);
      return { ok: false, msg };
    }
    const aiosellMessage =
      parsed && typeof parsed.message === "string" ? parsed.message : undefined;
    return { ok: true, aiosellMessage };
  }

  try {
    await db
      .from("ota_channels")
      .update({
        sync_status: "syncing",
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", channelId);

    if (inventoryCombinedPayload.length === 0 && rateUpdatesPayload.length === 0) {
      await db
        .from("ota_channels")
        .update({
          sync_status: "error",
          sync_error:
            `Não há dados no rate_calendar para sincronizar (próximos ${SYNC_DAYS_AHEAD} dias). Verifique tarifas e categorias.`,
        })
        .eq("id", channelId);

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Não há dados no rate_calendar para sincronizar (próximos ${SYNC_DAYS_AHEAD} dias). Verifique tarifas e categorias.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiosellApiMessages: string[] = [];

    /**
     * Lotes de disponibilidade: variável de ambiente opcional (predefinido 15; antes 25).
     * Ex.: AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE=10
     */
    const rawInvChunk = (Deno.env.get("AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE") ?? "").trim();
    const parsedInvChunk = parseInt(rawInvChunk, 10);
    const INV_AVAIL_CHUNK_SIZE =
      Number.isFinite(parsedInvChunk) && parsedInvChunk > 0 ? Math.min(100, parsedInvChunk) : 15;

    const skipInventoryAvailability = envFlagTrue("AIOSELL_SKIP_INVENTORY_AVAILABILITY");
    if (skipInventoryAvailability && inventoryCombinedPayload.length > 0) {
      console.warn(
        "[aiosell-sync] AIOSELL_SKIP_INVENTORY_AVAILABILITY ativo — não enviando inventário (disponibilidade + restrições) à Aiosell."
      );
    }

    /**
     * Ordem: primeiro tarifas (update-rates: cada linha com rate + restrictions),
     * depois inventário (update: rooms com available e, quando existir, restrictions no mesmo objeto).
     */
    if (rateUpdatesPayload.length > 0) {
      const r = await postToAiosell(
        ratesUrl,
        { hotelCode, updates: rateUpdatesPayload },
        "Aiosell tarifas (preço + restrições)"
      );
      if (!r.ok) {
        return new Response(JSON.stringify({ success: false, error: r.msg }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (r.aiosellMessage) aiosellApiMessages.push(`Tarifas: ${r.aiosellMessage}`);
    }

    const inventoryParseHints = [
      "Cada roomCode no inventário tem de existir como tipo de quarto no Channel Manager Aiosell para este hotel; combinações que o CM não reconhece podem devolver «Payload Parsing Failed».",
      "Confirme no PMS o separador «Mapeamento Aiosell»: Room Code e Rate Plan Code têm de coincidir com o painel CM (não use códigos de outro hotel ou de tipos ainda não criados no CM).",
      "Secret opcional AIOSELL_SKIP_INVENTORY_AVAILABILITY=1: sincroniza só tarifas sem POST de inventário, útil enquanto valida o mapeamento com o suporte Aiosell.",
    ];

    if (!skipInventoryAvailability && inventoryCombinedPayload.length > 0) {
      const totalChunks = Math.ceil(inventoryCombinedPayload.length / INV_AVAIL_CHUNK_SIZE);
      const invMsgs: string[] = [];
      for (let off = 0; off < inventoryCombinedPayload.length; off += INV_AVAIL_CHUNK_SIZE) {
        const chunk = inventoryCombinedPayload.slice(off, off + INV_AVAIL_CHUNK_SIZE);
        const label =
          totalChunks > 1
            ? `Aiosell inventário (disponibilidade + restrições) lote ${Math.floor(off / INV_AVAIL_CHUNK_SIZE) + 1}/${totalChunks}`
            : "Aiosell inventário (disponibilidade + restrições)";
        const r = await postToAiosell(inventoryUrl, { hotelCode, updates: chunk }, label);
        if (!r.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              error: r.msg,
              details: inventoryParseHints,
            }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        if (r.aiosellMessage) invMsgs.push(r.aiosellMessage);
      }
      if (invMsgs.length > 0) aiosellApiMessages.push(`Inventário: ${invMsgs.join(" · ")}`);
    }

    const { data: updatedChannel, error: updateError } = await db
      .from("ota_channels")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: "success",
        sync_error: null,
      })
      .eq("id", channelId)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ success: false, error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        inventoryCombinedBlocks: inventoryCombinedPayload.length,
        rateRows: rateLineCount,
        rateUpdateBlocks: rateUpdatesPayload.length,
        /** Cada linha de tarifa inclui `restrictions` (stopSell, LOS, etc.) no mesmo POST. */
        ratesIncludeRestrictionsPerLine: true,
        syncDaysAhead: SYNC_DAYS_AHEAD,
        /** Mensagens retornadas pela API Aiosell (quando existem). */
        aiosellApiMessages,
        /**
         * Confirme no painel Aiosell: hotelCode, URLs e códigos de quarto/tarifa
         * devem ser os fornecidos no onboarding (paths /sample-pms são os da documentação).
         */
        syncHints: {
          hotelCode,
          establishmentId,
          rateCalendarRows: rows.length,
          /** Linhas ARI `rate_sales_status` usadas para fechar inventário OTA (closed / restricted_ota / restricted_all). */
          rateSalesStatusRows: (rateSalesStatusRows || []).length,
          inventoryPath,
          ratesPath,
          /** Códigos enviados — devem coincidir com quartos/tarifas no Aiosell CM. */
          roomCodesSent: [...uniqueRoomCodes].slice(0, 30),
          rateplanCodesSent: [...uniqueRateplanCodes].slice(0, 30),
        },
        channel: updatedChannel,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("ota_channels")
      .update({ sync_status: "error", sync_error: message })
      .eq("id", channelId);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
