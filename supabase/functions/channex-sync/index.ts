import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AnyObj = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function postChannex(baseUrl: string, apiKey: string, path: string, payload: unknown) {
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

async function postChannexWithRetry(
  baseUrl: string,
  apiKey: string,
  path: string,
  payload: unknown
): Promise<Response> {
  let lastResp: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resp = await postChannex(baseUrl, apiKey, path, payload);
    lastResp = resp;
    if (resp.status !== 429) return resp;
    const waitMs = Math.min(60000, 1000 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return lastResp as Response;
}

function toPositiveIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v > 0 ? v : null;
}

function toNonNegativeIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 0 ? v : null;
}

function rowToChannexRestrictionFields(row: AnyObj): {
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
  min_stay_arrival?: number;
  min_stay_through?: number;
  max_stay?: number;
} {
  const minStayRaw = row.min_stay ?? row.min_los;
  const maxStayRaw = row.max_stay ?? row.max_los;
  const ctaRaw = row.closed_to_arrival ?? row.cta;
  const ctdRaw = row.closed_to_departure ?? row.ctd;
  // Usa apenas stop_sell_ota; stop_sell_booking_engine aplica-se só ao motor de reservas
  // próprio e não deve fechar inventário no canal OTA/Channex.
  const stopSellRaw = row.stop_sell_ota ?? row.stop_sell;

  const minStay = toPositiveIntOrNull(minStayRaw);
  const maxStay = toNonNegativeIntOrNull(maxStayRaw);
  const cta = Boolean(ctaRaw);
  const ctd = Boolean(ctdRaw);
  const stopSell = Boolean(stopSellRaw);

  // Channex usa "Last Win logic": enviar sempre os booleanos (mesmo false) garante que o
  // Channex redefina corretamente quando uma restrição for desativada.
  // Doc: "Should be a non null value or not existed field" → false é válido, null gera warning.
  const payload: {
    closed_to_arrival: boolean;
    closed_to_departure: boolean;
    stop_sell: boolean;
    min_stay_arrival?: number;
    min_stay_through?: number;
    max_stay?: number;
  } = {
    closed_to_arrival: cta,
    closed_to_departure: ctd,
    stop_sell: stopSell,
  };

  // MSA/MST: só envia quando há valor positivo — omitir é correto quando não há restrição de estadia.
  if (minStay != null) {
    payload.min_stay_arrival = minStay;
    payload.min_stay_through = minStay;
  }
  if (maxStay != null) payload.max_stay = maxStay;

  return payload;
}

/** Mesma chave que aiosell-sync / rates-map: preço BAR com 2 adultos por (categoria, data, plano). */
function dynamicPricingKeyChannex(catId: string, dateRaw: unknown, planId: unknown): string {
  const d = String(dateRaw ?? "").slice(0, 10);
  const pid = planId == null || planId === "" ? "" : String(planId);
  return `${String(catId).trim()}\0${d}\0${pid}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalServiceAuth = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

    let supabaseUser: ReturnType<typeof createClient>;
    let authUserId: string | null = null;

    if (internalServiceAuth) {
      supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const {
        data: { user },
        error: userErr,
      } = await supabaseUser.auth.getUser();
      if (userErr || !user) {
        return json({ success: false, error: "Sessão inválida ou expirada" }, 401);
      }
      authUserId = user.id;
    }

    let body: { channel_id?: string; establishment_id?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ success: false, error: "JSON inválido" }, 400);
    }

    const channelId = String(body?.channel_id ?? "").trim();
    const establishmentId = String(body?.establishment_id ?? "").trim();
    if (!channelId || !establishmentId) {
      return json({ success: false, error: "channel_id e establishment_id são obrigatórios" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: channel, error: channelErr } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle();
    if (channelErr || !channel) return json({ success: false, error: "Canal não encontrado" }, 404);

    if (String((channel as AnyObj).establishment_id ?? "").trim() !== establishmentId) {
      return json({ success: false, error: "Canal não pertence ao estabelecimento informado" }, 403);
    }

    if (!internalServiceAuth && authUserId) {
      const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
        p_user_id: authUserId,
        p_establishment_id: establishmentId,
      });
      if (accessRpcError) {
        return json(
          { success: false, error: `Não foi possível validar permissão: ${accessRpcError.message}` },
          500,
        );
      }
      if (canAccess !== true) {
        return json({ success: false, error: "Sem permissão para este estabelecimento" }, 403);
      }
    }

    if (String((channel as AnyObj).channel_manager_type ?? "") !== "channex") {
      return json({ success: false, error: "Canal informado não é do tipo Channex" }, 400);
    }

    const apiKey = String((channel as AnyObj).channex_api_key ?? "").trim();
    const propertyId = String((channel as AnyObj).channex_property_id ?? "").trim();
    const baseUrl = String((channel as AnyObj).channex_base_url ?? "https://staging.channex.io").trim();
    if (!apiKey || !propertyId) {
      return json({ success: false, error: "Canal sem channex_api_key/channex_property_id configurados" }, 400);
    }

    await supabase
      .from("ota_channels")
      .update({ channex_sync_status: "syncing", channex_last_sync_at: new Date().toISOString() })
      .eq("id", channelId);

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date();
    future.setDate(future.getDate() + 365);
    const futureDate = future.toISOString().slice(0, 10);

    const [
      { data: rateCalendar, error: rcErr },
      { data: mappingRows, error: mapErr },
      { data: rooms, error: roomsErr },
      { data: roomCategories, error: categoriesErr },
      { data: reservations, error: reservationsErr },
      { data: hotelSettings },
    ] = await Promise.all([
      supabase
        .from("rate_calendar")
        .select(
          "date, category_id, pricing_plan_id, base_price, adult_price, child_price, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell_ota, stop_sell_booking_engine, min_advance_days, max_advance_days"
        )
        .eq("establishment_id", establishmentId)
        .gte("date", today)
        .lte("date", futureDate),
      supabase.from("channel_pricing").select("*").eq("ota_channel_id", channelId).eq("is_active", true),
      supabase
        .from("rooms")
        .select("id, category_id, status, is_blocked")
        .eq("establishment_id", establishmentId),
      supabase
        .from("room_categories")
        .select("id, base_price")
        .eq("establishment_id", establishmentId),
      supabase
        .from("reservations")
        .select("id, category_id, room_id, checkin_date, checkout_date, status, channel")
        .eq("establishment_id", establishmentId)
        .gte("checkout_date", today)
        .lte("checkin_date", futureDate),
      supabase.from("hotel_settings").select("rate_system_settings").eq("establishment_id", establishmentId).maybeSingle(),
    ]);
    if (rcErr) throw rcErr;
    if (mapErr) throw mapErr;
    if (roomsErr) throw roomsErr;
    if (categoriesErr) throw categoriesErr;
    if (reservationsErr) throw reservationsErr;

    const availabilityMap = new Map<string, AnyObj>();
    const availabilityValues: AnyObj[] = [];
    const restrictionValues: AnyObj[] = [];
    const missingMappings: Array<{ category_id: string; pricing_plan_id: string }> = [];
    const missingMappingsSet = new Set<string>();
    const roomAvailabilityByCategory = new Map<string, number>();
    for (const room of rooms ?? []) {
      const rr = room as AnyObj;
      const categoryId = String(rr.category_id ?? "");
      if (!categoryId) continue;
      const status = String(rr.status ?? "").toLowerCase();
      const isBlocked = rr.is_blocked === true;
      const isUnavailable = isBlocked || status === "maintenance" || status === "blocked";
      const current = roomAvailabilityByCategory.get(categoryId) ?? 0;
      roomAvailabilityByCategory.set(categoryId, current + (isUnavailable ? 0 : 1));
    }

    // Ocupação enviada ao Channex segue o PMS: só deixa de contar quando a reserva está inativa aqui
    // (ex.: cancelada). Cancelamentos no Channex atualizam o status no PMS imediatamente via webhook/sync,
    // portanto reservas canceladas NUNCA devem reduzir a disponibilidade enviada ao Channex.
    const bookedByCategoryDate = new Map<string, number>();
    const roomCategoryByRoomId = new Map<string, string>();
    for (const room of rooms ?? []) {
      const rr = room as AnyObj;
      const roomId = String(rr.id ?? "").trim();
      const categoryId = String(rr.category_id ?? "").trim();
      if (!roomId || !categoryId) continue;
      roomCategoryByRoomId.set(roomId, categoryId);
    }
    const inactiveReservationStatuses = new Set(["cancelled", "canceled", "checkedout", "checked_out"]);
    for (const reservation of reservations ?? []) {
      const rr = reservation as AnyObj;
      const roomId = String(rr.room_id ?? "").trim();
      const fallbackCategoryId = String(rr.category_id ?? "").trim();
      const effectiveCategoryId = roomId
        ? String(roomCategoryByRoomId.get(roomId) ?? fallbackCategoryId).trim()
        : fallbackCategoryId;
      if (!effectiveCategoryId) continue;

      const status = String(rr.status ?? "").toLowerCase();
      const channel = String(rr.channel ?? "").toLowerCase();
      // Reservas inativas (canceladas, checkout concluído) não consomem inventário.
      // A exceção anterior para "cancelada via channex" foi removida: causava disponibilidade
      // reduzida no Channex mesmo após o cancelamento ser processado, gerando o bug
      // "PMS mostra 2 disponíveis, Channex mostra 1".
      if (inactiveReservationStatuses.has(status)) continue;
      const isChannelReservation = channel === "ota" || channel === "channel_manager" || channel === "channel manager";
      const hasCrossCategoryRelocation =
        Boolean(fallbackCategoryId) &&
        Boolean(effectiveCategoryId) &&
        fallbackCategoryId !== effectiveCategoryId;

      const checkin = String(rr.checkin_date ?? "").slice(0, 10);
      const checkout = String(rr.checkout_date ?? "").slice(0, 10);
      if (!checkin || !checkout) continue;

      // Inventário usa noites: inclui checkin e exclui checkout.
      let cursor = new Date(`${checkin}T00:00:00.000Z`);
      const end = new Date(`${checkout}T00:00:00.000Z`);
      const min = new Date(`${today}T00:00:00.000Z`);
      const maxExclusive = addDays(new Date(`${futureDate}T00:00:00.000Z`), 1);
      if (cursor < min) cursor = min;
      const loopEnd = end < maxExclusive ? end : maxExclusive;
      while (cursor < loopEnd) {
        const d = toIsoDate(cursor);
        const key = `${effectiveCategoryId}::${d}`;
        bookedByCategoryDate.set(key, (bookedByCategoryDate.get(key) ?? 0) + 1);
        // Em realocacao entre categorias para reserva de canal, manter bloqueio
        // tambem na categoria original para evitar disponibilidade falsa/negativa no Channex
        // enquanto o booking original ainda referencia a categoria anterior no canal.
        if (isChannelReservation && hasCrossCategoryRelocation) {
          const originalKey = `${fallbackCategoryId}::${d}`;
          bookedByCategoryDate.set(originalKey, (bookedByCategoryDate.get(originalKey) ?? 0) + 1);
        }
        cursor = addDays(cursor, 1);
      }
    }

    // Diagnóstico: mostra disponibilidade base e ocupação por categoria para auditoria.
    const diagCategories: Record<string, { base: number; topBooked: number }> = {};
    for (const [catId, base] of roomAvailabilityByCategory.entries()) {
      diagCategories[catId] = { base, topBooked: 0 };
    }
    for (const [key, cnt] of bookedByCategoryDate.entries()) {
      const catId = key.split("::")[0];
      if (diagCategories[catId]) {
        diagCategories[catId].topBooked = Math.max(diagCategories[catId].topBooked, cnt);
      }
    }
    console.info(
      "[channex-sync] availability_debug",
      JSON.stringify({
        categories: Object.entries(diagCategories).map(([id, v]) => ({
          category_id: id,
          base_inventory: v.base,
          peak_booked: v.topBooked,
          min_net_availability: Math.max(0, v.base - v.topBooked),
        })),
      })
    );

    const useRateCalendar = Array.isArray(rateCalendar) && rateCalendar.length > 0;
    const categoryBasePriceMap = new Map<string, number>();
    for (const c of roomCategories ?? []) {
      const cc = c as AnyObj;
      const cid = String(cc.id ?? "");
      if (!cid) continue;
      categoryBasePriceMap.set(cid, Number(cc.base_price ?? 0));
    }

    const calendarLikeRows: AnyObj[] = [];
    if (useRateCalendar) {
      calendarLikeRows.push(...((rateCalendar ?? []) as AnyObj[]));
    } else {
      // Fallback: gerar diário (365 dias) a partir dos mapeamentos ativos e base_price da categoria.
      for (const m of mappingRows ?? []) {
        const mm = m as AnyObj;
        const categoryId = String(mm.category_id ?? "").trim();
        if (!categoryId) continue;
        for (let offset = 0; offset <= 365; offset += 1) {
          const d = new Date();
          d.setDate(d.getDate() + offset);
          calendarLikeRows.push({
            date: d.toISOString().slice(0, 10),
            category_id: categoryId,
            pricing_plan_id: String(mm.pricing_plan_id ?? ""),
            base_price: categoryBasePriceMap.get(categoryId) ?? 0,
          });
        }
      }
    }

    const rawRs = (hotelSettings as AnyObj | null | undefined)?.rate_system_settings as
      | Record<string, unknown>
      | undefined;
    const autoApplyDynamicRules =
      rawRs?.auto_apply_dynamic_rules === true ||
      String(rawRs?.auto_apply_dynamic_rules ?? "").toLowerCase() === "true";
    const persistDynamicRates =
      rawRs?.persist_dynamic_rates === true ||
      String(rawRs?.persist_dynamic_rates ?? "").toLowerCase() === "true";

    const dynamicPriceByKey = new Map<string, number>();
    let dynamicPersistRowsLoaded = 0;
    let dynamicRpcPrefetched = 0;

    if (autoApplyDynamicRules) {
      if (persistDynamicRates) {
        const { data: dynRows, error: dynErr } = await supabase
          .from("dynamic_pricing_results")
          .select("category_id, rate_plan_id, date, final_price")
          .eq("establishment_id", establishmentId)
          .gte("date", today)
          .lte("date", futureDate);
        if (dynErr) {
          console.warn("[channex-sync] dynamic_pricing_results:", dynErr.message);
        } else {
          for (const dr of dynRows ?? []) {
            const row = dr as AnyObj;
            const fp = Number(row.final_price);
            if (!Number.isFinite(fp) || fp <= 0) continue;
            const k = dynamicPricingKeyChannex(String(row.category_id), row.date, row.rate_plan_id);
            dynamicPriceByKey.set(k, fp);
          }
          dynamicPersistRowsLoaded = dynamicPriceByKey.size;
        }
      } else {
        const uniqueKeys = new Set<string>();
        for (const row of calendarLikeRows) {
          const rr = row as AnyObj;
          const pid = String(rr.pricing_plan_id ?? "").trim();
          if (!pid) continue;
          uniqueKeys.add(dynamicPricingKeyChannex(String(rr.category_id), rr.date, pid));
        }
        const rawMax = (Deno.env.get("CHANNEX_DYNAMIC_RPC_MAX_KEYS") ?? "").trim();
        const parsedMax = parseInt(rawMax, 10);
        const maxKeys =
          Number.isFinite(parsedMax) && parsedMax > 0 ? Math.min(20_000, parsedMax) : 12_000;
        const keysArr = [...uniqueKeys];
        const limited = keysArr.length > maxKeys ? keysArr.slice(0, maxKeys) : keysArr;
        if (keysArr.length > maxKeys) {
          console.warn(
            "[channex-sync] dynamic_pricing_rpc_cap",
            JSON.stringify({
              keys_total: keysArr.length,
              keys_prefetched: maxKeys,
              hint:
                "Ative «Persistir preços dinâmicos» e cron recalc-rates para usar dynamic_pricing_results, ou aumente CHANNEX_DYNAMIC_RPC_MAX_KEYS.",
            }),
          );
        }
        const RPC_BATCH = 50;
        for (let i = 0; i < limited.length; i += RPC_BATCH) {
          const batch = limited.slice(i, i + RPC_BATCH);
          const results = await Promise.all(
            batch.map(async (key) => {
              const parts = key.split("\0");
              const catId = parts[0];
              const dateStr = parts[1];
              const planId = parts[2];
              if (!planId) return null;
              const { data, error: rpcErr } = await supabase.rpc("calculate_rate_price", {
                p_establishment_id: establishmentId,
                p_category_id: catId,
                p_pricing_plan_id: planId,
                p_date: dateStr,
                p_adults: 2,
                p_children: 0,
              });
              if (rpcErr) {
                console.warn("[channex-sync] calculate_rate_price:", rpcErr.message, key);
                return null;
              }
              const n = Number(data ?? 0);
              if (!Number.isFinite(n) || n <= 0) return null;
              return { key, price: n };
            }),
          );
          for (const p of results) {
            if (p) dynamicPriceByKey.set(p.key, p.price);
          }
        }
        dynamicRpcPrefetched = dynamicPriceByKey.size;
      }
    }

    if (autoApplyDynamicRules) {
      console.info(
        "[channex-sync] dynamic_pricing",
        JSON.stringify({
          persist_dynamic_rates: persistDynamicRates,
          map_size: dynamicPriceByKey.size,
          persist_rows_loaded: dynamicPersistRowsLoaded,
          rpc_keys_prefetched: dynamicRpcPrefetched,
        }),
      );
    }

    for (const row of calendarLikeRows) {
      const r = row as AnyObj;
      const categoryId = String(r.category_id ?? "");
      const pricingPlanId = String(r.pricing_plan_id ?? "");
      const candidates = (mappingRows ?? []).filter((m) => {
        const mm = m as AnyObj;
        return String(mm.category_id ?? "") === categoryId;
      }) as AnyObj[];

      // Prioridade:
      // 1) mapeamento exato categoria+plano
      // 2) mapeamento "geral" da categoria (pricing_plan_id vazio/null)
      // 3) qualquer mapeamento da categoria (fallback defensivo)
      const mappingExact = candidates.find(
        (mm) => String(mm.pricing_plan_id ?? "").trim() === pricingPlanId
      );
      const mappingGeneric = candidates.find(
        (mm) => !String(mm.pricing_plan_id ?? "").trim()
      );
      const mapping = (mappingExact ?? mappingGeneric ?? candidates[0]) as AnyObj | undefined;
      if (!mapping) {
        const key = `${categoryId}::${pricingPlanId}`;
        if (!missingMappingsSet.has(key)) {
          missingMappingsSet.add(key);
          missingMappings.push({
            category_id: categoryId,
            pricing_plan_id: pricingPlanId,
          });
        }
        continue;
      }

      const roomTypeId = String(mapping.channel_room_code ?? "").trim();
      const ratePlanId = String(mapping.channel_rate_plan_code ?? "").trim();
      if (!roomTypeId || !ratePlanId) continue;

      let basePrice = Number(r.base_price ?? 0);
      const planForDyn = String(r.pricing_plan_id ?? "").trim();
      if (autoApplyDynamicRules && planForDyn) {
        const dk = dynamicPricingKeyChannex(categoryId, r.date, planForDyn);
        const dynBar = dynamicPriceByKey.get(dk);
        if (dynBar != null && dynBar > 0) {
          basePrice = dynBar;
        }
      }
      const multiplier = Number(mapping.price_multiplier ?? 1);
      const fixedPrice = mapping.fixed_price != null ? Number(mapping.fixed_price) : null;
      const finalPrice = fixedPrice != null && !Number.isNaN(fixedPrice) ? fixedPrice : basePrice * multiplier;
      const cents = Math.max(0, Math.round(finalPrice * 100));

      const date = String(r.date ?? "");
      if (date) {
        const availabilityKey = `${roomTypeId}::${date}`;
        if (!availabilityMap.has(availabilityKey)) {
          const totalInventory = Math.max(0, roomAvailabilityByCategory.get(categoryId) ?? 0);
          const booked = bookedByCategoryDate.get(`${categoryId}::${date}`) ?? 0;
          const netAvailability = Math.max(0, totalInventory - booked);
          availabilityMap.set(availabilityKey, {
            property_id: propertyId,
            room_type_id: roomTypeId,
            date,
            availability: netAvailability,
          });
        }
      }
      restrictionValues.push({
        ...rowToChannexRestrictionFields(r),
        property_id: propertyId,
        rate_plan_id: ratePlanId,
        date,
        rate: cents,
      });
    }

    availabilityValues.push(...availabilityMap.values());

    if (availabilityValues.length === 0 || restrictionValues.length === 0) {
      const hint =
        "Sem payload ARI para envio. Verifique mapeamentos ativos em Tarifas por Canal e IDs Channex (room_type_id/rate_plan_id).";
      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        direction: "push_ari",
        status: "warning",
        endpoint: "/api/v1/availability + /api/v1/restrictions",
        request_payload: {
          source: useRateCalendar ? "rate_calendar" : "fallback_channel_pricing",
          dynamic_pricing: autoApplyDynamicRules
            ? persistDynamicRates
              ? { mode: "dynamic_pricing_results", rows_loaded: dynamicPersistRowsLoaded }
              : { mode: "calculate_rate_price", keys_prefetched: dynamicRpcPrefetched }
            : { mode: "off" },
          supportedCodes: ["RATE", "AVL", "CTA", "CTD", "SS", "MSA", "MST", "MXS"],
          readOnlyCodesIgnored: ["AVO", "MAL"],
          availabilityCount: availabilityValues.length,
          restrictionsCount: restrictionValues.length,
          missingMappings: missingMappings.slice(0, 20),
        },
        message: hint,
      });
      await supabase
        .from("ota_channels")
        .update({
          channex_sync_status: "error",
          sync_status: "error",
          sync_error: hint,
          channex_last_sync_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", channelId);
      return json({
        success: false,
        error: hint,
        availabilityValues: availabilityValues.length,
        restrictionValues: restrictionValues.length,
        missingMappings: missingMappings.slice(0, 20),
      }, 400);
    }

    const availabilityResp = await postChannexWithRetry(
      baseUrl,
      apiKey,
      "/api/v1/availability",
      { values: availabilityValues }
    );
    const restrictionsResp = await postChannexWithRetry(
      baseUrl,
      apiKey,
      "/api/v1/restrictions",
      { values: restrictionValues }
    );

    const availabilityJson = availabilityResp ? await availabilityResp.json().catch(() => ({})) : {};
    const restrictionsJson = restrictionsResp ? await restrictionsResp.json().catch(() => ({})) : {};

    if (!availabilityResp.ok || !restrictionsResp.ok) {
      const errMessage = `Erro no envio ARI (availability=${availabilityResp.status}, restrictions=${restrictionsResp.status})`;
      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        direction: "push_ari",
        status: "error",
        endpoint: "/api/v1/availability + /api/v1/restrictions",
        request_payload: { availabilityCount: availabilityValues.length, restrictionsCount: restrictionValues.length },
        response_payload: { availabilityJson, restrictionsJson },
        message: errMessage,
      });
      await supabase
        .from("ota_channels")
        .update({
          channex_sync_status: "error",
          sync_status: "error",
          sync_error: errMessage,
          channex_last_sync_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", channelId);
      return json({ success: false, error: errMessage, availabilityJson, restrictionsJson }, 502);
    }

    const availabilityTasks = Array.isArray((availabilityJson as AnyObj).data)
      ? ((availabilityJson as AnyObj).data as AnyObj[]).map((x) => String(x.id ?? "")).filter(Boolean)
      : [];
    const restrictionTasks = Array.isArray((restrictionsJson as AnyObj).data)
      ? ((restrictionsJson as AnyObj).data as AnyObj[]).map((x) => String(x.id ?? "")).filter(Boolean)
      : [];

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channelId,
      establishment_id: establishmentId,
      direction: "push_ari",
      status: "success",
      endpoint: "/api/v1/availability + /api/v1/restrictions",
      request_payload: {
        availabilityCount: availabilityValues.length,
        restrictionsCount: restrictionValues.length,
        dynamic_pricing: autoApplyDynamicRules
          ? persistDynamicRates
            ? { mode: "dynamic_pricing_results", rows_loaded: dynamicPersistRowsLoaded }
            : { mode: "calculate_rate_price", keys_prefetched: dynamicRpcPrefetched }
          : { mode: "off" },
      },
      response_payload: {
        availabilityStatus: availabilityResp?.status ?? null,
        restrictionsStatus: restrictionsResp?.status ?? null,
        supportedCodes: ["RATE", "AVL", "CTA", "CTD", "SS", "MSA", "MST", "MXS"],
        readOnlyCodesIgnored: ["AVO", "MAL"],
        availabilityWarnings: (availabilityJson as AnyObj)?.meta ?? null,
        restrictionsWarnings: (restrictionsJson as AnyObj)?.meta ?? null,
      },
      task_id: [...availabilityTasks, ...restrictionTasks].join(","),
      message: "ARI push concluído",
    });

    await supabase
      .from("ota_channels")
      .update({
        channex_sync_status: "success",
        channex_last_sync_at: new Date().toISOString(),
        sync_status: "success",
        sync_error: null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", channelId);

    return json({
      success: true,
      availabilityTasks,
      restrictionTasks,
      message: "ARI enviado para o Channex",
    });
  } catch (error) {
    console.error("channex-sync error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
