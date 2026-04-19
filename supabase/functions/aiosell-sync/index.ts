import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Parte `channel_rate_plan_code` em vários Rate Plan Codes (vírgula, `;`, newline). Inline: o deploy da função não inclui `../_shared`. */
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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Janela de sincronização (dias a partir de hoje).
 * Datas no `rate_calendar` fora deste intervalo **não** são enviadas ao CM.
 * Aumentar = mais linhas no POST (confirmar limites com a Aiosell se o push falhar).
 */
const SYNC_DAYS_AHEAD = 365;

/**
 * Integração **StayOS PMS → Aiosell Channel Manager (API v2)**, não a doc. genérica `POST /rates`
 * com `hotel_id` + `room_type_id` + `rate_plan_id` por linha (outro contrato / legado).
 *
 * Contrato real desta função (alinhado ao path configurável, ex. `…/update-rates/stayos-pms`):
 * - `Authorization: Basic`, corpo `{ hotelCode, updates: [ { startDate, endDate, rates: [...] } ] }`
 * - Cada linha em `rates`: `roomCode`, `rateplanCode`, `rate`, `restrictions` (CM).
 *
 * KB: https://support.aiosell.com/portal/en/kb/aiosell-kb/api-documentation — Rate Push, inventário, restrições.
 * Preços e restrições de tarifa vão no mesmo POST `rates[]` para o CM não sobrescrever o primeiro pedido.
 *
 * Precificação dinâmica: com `hotel_settings.rate_system_settings.auto_apply_dynamic_rules=true`, o BAR (x2)
 * usa `dynamic_pricing_results.final_price` (se `persist_dynamic_rates`) ou `calculate_rate_price` por célula;
 * com essa opção desligada, mantém-se o fluxo original (tarifário `rate_calendar` + planos derivados + Tarifas por canal).
 */

/**
 * Se "1" ou "true": não envia o POST de disponibilidade (inventário numérico) à Aiosell.
 * Útil para testar tarifas/restrições quando o CM ainda rejeita o payload de disponibilidade.
 * Supabase: Edge Function → Secrets → AIOSELL_SKIP_INVENTORY_AVAILABILITY=1
 *
 * AIOSELL_LOG_RATE_DEBUG=1 — regista em log cada linha de preço (limitado a ~200 por sync; uso pontual).
 */
function envFlagTrue(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Path da doc. Aiosell com «sample-pms» — pode aceitar POST mas não atualizar o CM de produção do hotel. */
function pathLooksLikeAiosellSamplePms(path: string): boolean {
  return path.toLowerCase().includes("sample-pms");
}

/**
 * Preço enviado em `rates[].rate` — origem do valor para diagnóstico (logs).
 * `rate.base_price` aqui já reflete a ocupação x1–x4 (`pmsListPriceForAiosellOccupancy`) antes de
 * `fixed_price` / `price_multiplier` em Tarifas por canal.
 * `price_multiplier` 1,0 (padrão na BD) é tratado como tarifário direto (sem ramo «multiplier»).
 * Causas comuns de `rate === 1`: `channel_pricing.fixed_price = 1`, valores baixos no calendário,
 * ou `base_price * price_multiplier` com multiplicador ≠ 1 (ex.: 100 × 0,01 = 1).
 */
function computeAiosellRateFromRowAndChannelPricing(
  rate: Record<string, unknown>,
  cfg: Record<string, unknown> | null | undefined
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
      /** DEFAULT 1.0 em `channel_pricing` — matematicamente igual ao tarifário; não contar como override. */
      if (!Number.isFinite(mult) || mult <= 0) {
        breakdown.step = "base_only";
        finalPrice = baseOk;
        breakdown.computed_before_round = baseOk;
      } else if (Math.abs(mult - 1) < 1e-6) {
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

  const rounded = Number.isFinite(Math.round(finalPrice * 100) / 100)
    ? Math.round(finalPrice * 100) / 100
    : 0;

  return { rounded, breakdown };
}

function normPlanIdForPricing(p: unknown): string | null {
  return p == null || p === "" ? null : String(p);
}

/** Como a linha de Tarifas por canal foi escolhida (para logs). */
function channelPricingRowKind(
  cfg: Record<string, unknown> | null | undefined,
  planId: string | null
): "exact" | "category_fallback" | "none" {
  if (!cfg) return "none";
  const cfgPid = normPlanIdForPricing(cfg.pricing_plan_id);
  const want = normPlanIdForPricing(planId);
  if (cfgPid === want) return "exact";
  if (cfgPid === null && want !== null) return "category_fallback";
  return "exact";
}

/** Resumo legível do motivo do preço (para log). */
function summarizeRateOneReason(
  rounded: number,
  breakdown: ReturnType<typeof computeAiosellRateFromRowAndChannelPricing>["breakdown"],
  pricingKind: "exact" | "category_fallback" | "none"
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

function eachDateInRangeInclusiveAiosell(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let c = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  while (c.getTime() <= end.getTime()) {
    out.push(c.toISOString().slice(0, 10));
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

/** PostgREST limita a 1000 linhas por pedido; janela 365d × N planos/categorias excede e truncava o sync. */
const RATE_CALENDAR_PAGE_SIZE_AI = 1000;

async function fetchAllRateCalendarRowsAiosell(
  client: ReturnType<typeof createClient>,
  establishmentId: string,
  today: string,
  futureDateStr: string
): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
  const select = `
      *,
      pricing_plans (*),
      room_categories (*)
    `;
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("rate_calendar")
      .select(select)
      .eq("establishment_id", establishmentId)
      .gte("date", today)
      .lte("date", futureDateStr)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + RATE_CALENDAR_PAGE_SIZE_AI - 1);
    if (error) return { data: null, error };
    const batch = (data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < RATE_CALENDAR_PAGE_SIZE_AI) break;
    offset += RATE_CALENDAR_PAGE_SIZE_AI;
  }
  return { data: all, error: null };
}

/**
 * Índice `categoria|data|planId` → base_price no calendário (para recomputar planos derivados).
 * Deve incluir **todas** as linhas do `rate_calendar` na janela, não só as que têm mapeamento Aiosell:
 * se o plano base não estiver em Tarifas por canal, essas linhas são filtradas do sync mas o preço do
 * base é ainda necessário para calcular o derivado (evita enviar `1` por `base_price` desatualizado).
 */
function buildRateCalendarPriceIndex(rows: Record<string, unknown>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const cid = String(r.category_id ?? "").trim();
    const pidRaw = r.pricing_plan_id;
    if (!cid || pidRaw == null || pidRaw === "") continue;
    const pid = String(pidRaw).trim();
    const d = normalizeCalendarDate(r.date) ?? String(r.date).slice(0, 10);
    const bp = Number(r.base_price);
    m.set(`${cid}|${d}|${pid}`, Number.isFinite(bp) ? bp : 0);
  }
  return m;
}

type DerivedBaseResolve = {
  effectiveBase: number;
  source: "stored" | "recomputed_from_base_plan";
  storedBase: number;
  basePlanBase: number | null;
  basePlanId: string | null;
  /** true: plano com base+flutuação mas usámos `rate_calendar.base_price` (>2) em vez do recalculado. */
  trustCalendarOverRecompute?: boolean;
};

/** Linha `pricing_plans` correspondente a `rate.pricing_plan_id` (embed pode ser objeto ou array). */
function pickPricingPlanRow(rate: Record<string, unknown>): Record<string, unknown> | null {
  const ppRaw = rate.pricing_plans;
  const pid = rate.pricing_plan_id != null ? String(rate.pricing_plan_id).trim() : "";
  if (Array.isArray(ppRaw)) {
    if (pid) {
      const hit = ppRaw.find((p) => String((p as Record<string, unknown>).id ?? "") === pid);
      if (hit) return hit as Record<string, unknown>;
    }
    return (ppRaw[0] as Record<string, unknown>) ?? null;
  }
  return (ppRaw as Record<string, unknown>) ?? null;
}

/**
 * Planos com `base_plan_id_for_rate` + flutuação (ex. «Não Reembolsável» / CP vs «Reembolsável» / EP):
 * o valor **mostrado no PMS** vem de `rate_calendar.base_price` já persistido.
 * Recalcular aqui a partir do plano base + %/fixo pode divergir (edição manual, ordem de saves, arredondamentos).
 * Por defeito confiamos em `base_price` quando é um preço real (> 2); só recalculamos quando o guardado
 * parece placeholder (≤ 2) e existe base no índice — alinhado ao aviso «DB tinha valor baixo».
 * Secret opcional: `AIOSELL_RECOMPUTE_DERIVED_FROM_BASE_PLAN=true` — força sempre o recalculado (comportamento antigo).
 */
function resolveEffectiveBasePriceForSync(
  rate: Record<string, unknown>,
  priceIndex: Map<string, number>
): DerivedBaseResolve {
  const cid = String(rate.category_id ?? "").trim();
  const d = normalizeCalendarDate(rate.date) ?? String(rate.date).slice(0, 10);
  const storedBase = Number.isFinite(Number(rate.base_price)) ? Number(rate.base_price) : 0;

  const pp = pickPricingPlanRow(rate);
  const basePlanId = pp?.base_plan_id_for_rate != null ? String(pp.base_plan_id_for_rate) : null;
  const fTypeRaw = pp?.fluctuation_type;
  const fType = fTypeRaw == null ? null : String(fTypeRaw).trim().toLowerCase();
  const fVal = pp?.fluctuation_value;

  if (!basePlanId || fVal == null || fVal === "") {
    return {
      effectiveBase: storedBase,
      source: "stored",
      storedBase,
      basePlanBase: null,
      basePlanId: null,
    };
  }

  if (fType !== "percentage" && fType !== "fixed") {
    return {
      effectiveBase: storedBase,
      source: "stored",
      storedBase,
      basePlanBase: null,
      basePlanId,
    };
  }

  const basePlanIdKey = String(basePlanId).trim();
  const basePlanBase = priceIndex.get(`${cid}|${d}|${basePlanIdKey}`) ?? 0;

  if (basePlanBase <= 0) {
    return {
      effectiveBase: storedBase,
      source: "stored",
      storedBase,
      basePlanBase: basePlanBase || null,
      basePlanId,
    };
  }

  let recomputed = basePlanBase;
  if (fType === "percentage") {
    recomputed = basePlanBase * (1 + Number(fVal) / 100);
  } else if (fType === "fixed") {
    recomputed = basePlanBase + Number(fVal);
  }
  recomputed = Math.round(Math.max(0, recomputed) * 100) / 100;

  const forceRecomputeDerived = envFlagTrue("AIOSELL_RECOMPUTE_DERIVED_FROM_BASE_PLAN");

  if (!forceRecomputeDerived && storedBase > 2) {
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

/** Ocupação 1–4 configurável no canal OTA (colunas x1–x4 do ARI). */
function clampAiosellListOccupancy(raw: unknown): 1 | 2 | 3 | 4 {
  const n = Math.floor(Number(raw));
  if (Number.isFinite(n) && n >= 1 && n <= 4) return n as 1 | 2 | 3 | 4;
  return 2;
}

/**
 * Códigos CM tipo `deluxe-d-ep`, `standard-s-cp` incluem o segmento de ocupação (S/D/T/Q).
 * Usado só quando `AIOSELL_RATE_OCCUPANCY_MODE=infer` (opt-in): infere 1–4 a partir de `-s-`/`-d-`/`-t-`/`-q-`.
 * Por defeito o sync usa **só** `aiosell_list_rate_occupancy` para todas as linhas (modo `list`), para o valor
 * enviado coincidir com o BAR da coluna x1–x4 escolhida no canal (ex. duplo 220 em todas as linhas EP/CP).
 */
function inferOccupancyFromAiosellRateplanCode(rateplanCode: string): 1 | 2 | 3 | 4 | null {
  const lower = sanitizeAiosellCode(rateplanCode).toLowerCase();
  const m = lower.match(/-([sdqt])-(?:ep|cp|ro|bb|rb)/);
  if (!m) return null;
  switch (m[1]) {
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

/**
 * Mesma regra que `ARIGrid.calculatePriceForOccupancy`: preço por noite para a ocupação escolhida,
 * usando o preço «padrão / x2» (`effectiveBarOcc2`, já com plano base recalculado se aplicável) e `adult_price`.
 */
function pmsListPriceForAiosellOccupancy(
  rate: Record<string, unknown>,
  effectiveBarOcc2: number,
  occupancy: 1 | 2 | 3 | 4
): number {
  const basePrice = Number.isFinite(effectiveBarOcc2) ? effectiveBarOcc2 : 0;
  const adultPrice = Number.isFinite(Number(rate.adult_price)) ? Number(rate.adult_price) : 0;

  let baseCalculated: number;
  switch (occupancy) {
    case 1:
      baseCalculated = Math.max(0, basePrice - adultPrice);
      break;
    case 2:
      baseCalculated = basePrice;
      break;
    case 3:
      baseCalculated = basePrice + adultPrice;
      break;
    case 4:
      baseCalculated = basePrice + adultPrice * 2;
      break;
    default:
      baseCalculated = basePrice;
  }

  let finalPrice = baseCalculated;

  if (occupancy === 1) {
    const t = rate.occupancy_1_fluctuation_type;
    const typeOk = t === "fixed" || t === "percentage";
    const v = rate.occupancy_1_fluctuation_value;
    if (typeOk && v != null && v !== "" && !Number.isNaN(Number(v))) {
      const fv = Number(v);
      if (t === "percentage") finalPrice = baseCalculated * (1 + fv / 100);
      else finalPrice = baseCalculated + fv;
    }
  } else if (occupancy === 3) {
    const t = rate.occupancy_3_fluctuation_type;
    const typeOk = t === "fixed" || t === "percentage";
    const v = rate.occupancy_3_fluctuation_value;
    if (typeOk && v != null && v !== "" && !Number.isNaN(Number(v))) {
      const fv = Number(v);
      if (t === "percentage") finalPrice = baseCalculated * (1 + fv / 100);
      else finalPrice = baseCalculated + fv;
    }
  } else if (occupancy === 4) {
    const t = rate.occupancy_4_fluctuation_type;
    const typeOk = t === "fixed" || t === "percentage";
    const v = rate.occupancy_4_fluctuation_value;
    if (typeOk && v != null && v !== "" && !Number.isNaN(Number(v))) {
      const fv = Number(v);
      if (t === "percentage") finalPrice = baseCalculated * (1 + fv / 100);
      else finalPrice = baseCalculated + fv;
    }
  }

  return Math.max(0, Math.round(finalPrice * 100) / 100);
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
 * Pares únicos (roomCode, rateplanCode) no payload final de tarifas (Aiosell PMS→CM: POST
 * update-rates com `updates[].rates[]` por linha).
 */
function collectRatePairsFromPayload(
  updates: Record<string, unknown>[]
): { roomCode: string; rateplanCode: string }[] {
  const seen = new Set<string>();
  const pairs: { roomCode: string; rateplanCode: string }[] = [];
  for (const u of updates) {
    const rates = (u.rates as Record<string, unknown>[]) || [];
    for (const line of rates) {
      const rc = sanitizeAiosellCode(String(line.roomCode ?? ""));
      const rpc = sanitizeAiosellCode(String(line.rateplanCode ?? ""));
      if (!rc || !rpc) continue;
      const k = `${rc}\0${rpc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push({ roomCode: rc, rateplanCode: rpc });
    }
  }
  pairs.sort((a, b) =>
    `${a.roomCode}\0${a.rateplanCode}`.localeCompare(`${b.roomCode}\0${b.rateplanCode}`)
  );
  return pairs;
}

/** roomCode únicos no POST de inventário (`updates[].rooms[].roomCode`). */
function collectInventoryRoomCodesFromPayload(updates: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const u of updates) {
    const rooms = (u.rooms as Record<string, unknown>[]) || [];
    for (const r of rooms) {
      const c = sanitizeAiosellCode(String(r.roomCode ?? ""));
      if (c) seen.add(c);
    }
  }
  return [...seen].sort();
}

/** Heurística: nomes de plano PMS colocados por engano no campo «Room Code» do mapeamento. */
function looksLikePmsPlanLabelUsedAsRoomCode(roomCode: string): boolean {
  const r = roomCode
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "-");
  return r === "reembolsavel" || r === "nao-reembolsavel" || r === "teste";
}

/** Heurística: tokens típicos de rate plan ID no Channel Manager (ex. deluxe-s-ep). */
function looksLikeCmRatePlanId(rateplanCode: string): boolean {
  const t = rateplanCode.toLowerCase();
  return /-(s|d|t|q|bb|ep|ro|rb)(?:$|-)/.test(t) || /^(deluxe|executivo|standard)-/.test(t);
}

/**
 * Aviso quando roomCode parece rótulo de plano PMS e rateplanCode parece ID CM — possível troca de campos.
 */
function aiosellMappingSemanticsWarning(
  roomCodes: string[],
  rateplanCodes: string[]
): string | null {
  if (rateplanCodes.length === 0) return null;
  if (!roomCodes.some(looksLikePmsPlanLabelUsedAsRoomCode)) return null;
  if (!rateplanCodes.some(looksLikeCmRatePlanId)) return null;
  return (
    "Algum roomCode no payload parece nome de plano PMS (ex. nao-reembolsavel) e rateplanCode parece ID do CM " +
    "(ex. deluxe-s-ep). Na API Aiosell, roomCode deve ser o tipo de quarto no CM (deluxe, executivo, standard) " +
    "e rateplanCode o plano de tarifa no CM. Corrija em Tarifas por canal / Mapeamento Aiosell."
  );
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

/**
 * Formato de restrições inventário/tarifa (PMS → CM / OTA).
 *
 * Alinhado ao sample payload da doc. Aiosell «Inventory Restrictions POST from Aiosell to 3rd Party»:
 * {
 *   "stopSell": false,
 *   "exactStayArrival": null,
 *   "maximumStayArrival": null,
 *   "minimumAdvanceReservation": null,
 *   "minimumStay": 1,
 *   "closeOnArrival": false,
 *   "minimumStayArrival": null,
 *   "maximumStay": null,
 *   "maximumAdvanceReservation": null,
 *   "closeOnDeparture": false
 * }
 *
 * Campos não suportados pelo PMS (`exactStayArrival`, `maximumStayArrival`, `minimumStayArrival`)
 * permanecem explicitamente `null` para conformidade total com o schema.
 * LOS mínimo é enviado quando o PMS tem ≥ 1 noite; 0/null = sem regra explícita (`minimumStay: null`).
 */
function aiosellRestrictionShape(
  minStay: number | null,
  maxStay: number | null,
  closeOnArrival: boolean,
  closeOnDeparture: boolean,
  stopSell: boolean,
  minAdvanceDays: number | null = null,
  maxAdvanceDays: number | null = null
): Record<string, unknown> {
  const minStayOut =
    minStay != null && Number.isFinite(Number(minStay)) && Number(minStay) >= 1
      ? Math.floor(Number(minStay))
      : null;
  const minAdv =
    minAdvanceDays != null && Number(minAdvanceDays) > 0
      ? Math.floor(Number(minAdvanceDays))
      : null;
  const maxAdv =
    maxAdvanceDays != null && Number(maxAdvanceDays) > 0
      ? Math.floor(Number(maxAdvanceDays))
      : null;
  const maxStayVal =
    maxStay != null && Number.isFinite(Number(maxStay)) ? Number(maxStay) : null;

  // Ordem de chaves idêntica ao sample da documentação Aiosell (facilita comparação visual em logs).
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

function aggregateRowsToAiosellInvRestrictions(
  rows: Record<string, unknown>[]
): Record<string, unknown> | null {
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
    const ms = row.min_stay ?? row.min_los;
    const xs = row.max_stay ?? row.max_los;
    const cta = row.closed_to_arrival ?? row.cta;
    const ctd = row.closed_to_departure ?? row.ctd;
    // Usa apenas stop_sell_ota para canais OTA; stop_sell_booking_engine aplica-se
    // só ao motor de reservas próprio e não deve fechar o inventário OTA.
    const ss = row.stop_sell_ota;
    const mad = row.min_advance_days ?? row.min_advance_reservation;
    const xad = row.max_advance_days ?? row.max_advance_reservation;
    if (ms != null && Number(ms) >= 1) {
      const v = Math.floor(Number(ms));
      minStay = minStay == null ? v : Math.max(minStay, v);
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
    if (mad != null && Number(mad) > 0) {
      const v = Math.floor(Number(mad));
      minAdvanceAgg = minAdvanceAgg === null ? v : Math.max(minAdvanceAgg, v);
      hasAny = true;
    }
    if (xad != null && Number(xad) > 0) {
      const v = Math.floor(Number(xad));
      maxAdvanceAgg = maxAdvanceAgg === null ? v : Math.min(maxAdvanceAgg, v);
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return aiosellRestrictionShape(
    minStay,
    maxStay,
    closeOnArrival,
    closeOnDeparture,
    stopSell,
    minAdvanceAgg,
    maxAdvanceAgg
  );
}

function rowToAiosellRateRestrictions(row: Record<string, unknown>): Record<string, unknown> | null {
  const ms = row.min_stay ?? row.min_los;
  const xs = row.max_stay ?? row.max_los;
  const cta = row.closed_to_arrival ?? row.cta;
  const ctd = row.closed_to_departure ?? row.ctd;
  // Usa apenas stop_sell_ota; stop_sell_booking_engine não deve propagar-se ao canal OTA/CM.
  const ss = row.stop_sell_ota;
  const mad = row.min_advance_days ?? row.min_advance_reservation;
  const xad = row.max_advance_days ?? row.max_advance_reservation;
  const planTariffClosed = isPlanTariffClosedInCalendar(row);
  const minStayForApi =
    ms != null && Number(ms) >= 1 ? Math.floor(Number(ms)) : null;
  const maxStay = xs != null ? Number(xs) : null;
  const minAdvance =
    mad != null && Number(mad) > 0 ? Math.floor(Number(mad)) : null;
  const maxAdvance =
    xad != null && Number(xad) > 0 ? Math.floor(Number(xad)) : null;
  const has =
    planTariffClosed ||
    (ms != null && Number(ms) >= 1) ||
    xs != null ||
    cta ||
    ctd ||
    ss ||
    minAdvance != null ||
    maxAdvance != null;
  if (!has) return null;
  return aiosellRestrictionShape(
    minStayForApi,
    maxStay,
    !!cta,
    !!ctd,
    Boolean(ss) || planTariffClosed,
    minAdvance,
    maxAdvance
  );
}

/** Tarifa «aberta» no CM: sem LOS mínimo explícito (`minimumStay: null`), não forçar 1 noite. */
function defaultOpenAiosellRateRestrictions(): Record<string, unknown> {
  return aiosellRestrictionShape(null, null, false, false, false, null, null);
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

function mergeMinimumStayLos(a: unknown, b: unknown): number | null {
  const na =
    a != null && a !== "" && Number.isFinite(Number(a)) && Number(a) >= 1
      ? Math.floor(Number(a))
      : null;
  const nb =
    b != null && b !== "" && Number.isFinite(Number(b)) && Number(b) >= 1
      ? Math.floor(Number(b))
      : null;
  if (na != null && nb != null) return Math.max(na, nb);
  return na ?? nb ?? null;
}

function mergeTwoInvRestrictions(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const minStay = mergeMinimumStayLos(a.minimumStay, b.minimumStay);
  const am = a.maximumStay as number | null | undefined;
  const bm = b.maximumStay as number | null | undefined;
  let maxStay: number | null = null;
  if (am != null && bm != null) maxStay = Math.min(Number(am), Number(bm));
  else maxStay = (am != null ? Number(am) : null) ?? (bm != null ? Number(bm) : null);
  const minAdvA = a.minimumAdvanceReservation as number | undefined;
  const minAdvB = b.minimumAdvanceReservation as number | undefined;
  let minAdvanceMerged: number | null = null;
  const minAdvVals = [minAdvA, minAdvB].filter((v) => v != null && Number(v) > 0) as number[];
  if (minAdvVals.length > 0) {
    minAdvanceMerged = Math.max(...minAdvVals.map((v) => Math.floor(Number(v))));
  }
  const maxAdvA = a.maximumAdvanceReservation as number | undefined;
  const maxAdvB = b.maximumAdvanceReservation as number | undefined;
  let maxAdvanceMerged: number | null = null;
  const maxAdvVals = [maxAdvA, maxAdvB].filter((v) => v != null && Number(v) > 0) as number[];
  if (maxAdvVals.length === 2) {
    maxAdvanceMerged = Math.min(
      Math.floor(Number(maxAdvVals[0])),
      Math.floor(Number(maxAdvVals[1]))
    );
  } else if (maxAdvVals.length === 1) {
    maxAdvanceMerged = Math.floor(Number(maxAdvVals[0]));
  }
  return aiosellRestrictionShape(
    minStay,
    maxStay,
    Boolean(a.closeOnArrival) || Boolean(b.closeOnArrival),
    Boolean(a.closeOnDeparture) || Boolean(b.closeOnDeparture),
    Boolean(a.stopSell) || Boolean(b.stopSell),
    minAdvanceMerged,
    maxAdvanceMerged
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

  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  /** Chamada interna (Edge Functions / service role) — sem sessão de utilizador. */
  const internalServiceAuth = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

  let supabaseUser: ReturnType<typeof createClient>;
  /** Leituras críticas com service role (RLS não bloqueia dados na função). */
  let db: ReturnType<typeof createClient>;
  /** Utilizador autenticado (fluxo app); omitido em chamada interna com service role. */
  let authUserId: string | null = null;

  if (internalServiceAuth) {
    db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    supabaseUser = db;
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
      return new Response(JSON.stringify({ success: false, error: "Sessão inválida ou expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    authUserId = user.id;

    const supabaseAdmin = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    db = supabaseAdmin ?? supabaseUser;
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

  // Recua 1 dia para cobrir timezones como UTC-3 (Brasil): evita excluir "hoje local"
  // quando o UTC já virou para o dia seguinte (ex.: 22h BRT = 01h UTC do dia seguinte).
  const todayUtcMinus1 = new Date(Date.now() - 86_400_000);
  const today = todayUtcMinus1.toISOString().split("T")[0];
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

  /**
   * Evita tempestade de sync (ex.: várias alterações rápidas na grade ARI):
   * múltiplos POSTs quase simultâneos para o mesmo canal podem ser aceitos pela API
   * ("Request Received Successfully") mas processados fora de ordem no CM.
   */
  const isSyncing = String(channel.sync_status ?? "").toLowerCase() === "syncing";
  const lastSyncAtRaw = String(channel.last_sync_at ?? "");
  const lastSyncMs = lastSyncAtRaw ? Date.parse(lastSyncAtRaw) : NaN;
  const nowMs = Date.now();
  const THROTTLE_MS = 45_000;
  const recentlyStarted = Number.isFinite(lastSyncMs) && nowMs - lastSyncMs < THROTTLE_MS;
  if (isSyncing && recentlyStarted) {
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason:
          "Sincronização já em andamento para este canal. Ignorado para evitar concorrência e processamento fora de ordem no Aiosell.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

  if (!internalServiceAuth && authUserId) {
    const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
      p_user_id: authUserId,
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
  }

  if (!serviceRoleKey) {
    console.warn("[aiosell-sync] SUPABASE_SERVICE_ROLE_KEY ausente — usando JWT (RLS pode bloquear dados).");
  }

  const { data: rateCalendar, error: rateError } = await fetchAllRateCalendarRowsAiosell(
    db,
    establishmentId,
    today,
    futureDateStr
  );

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
    // "blocked", "noshow" e "preregistration" também consomem inventário
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "noshow", "preregistration"]);

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

  /**
   * Push PMS → Aiosell CM (esta função): Basic Auth + POST JSON com `hotelCode` e `updates[]`.
   * - `ratesPath`: tarifas e restrições por linha (`rates[].roomCode`, `rateplanCode`, `rate`, `restrictions`).
   * - `inventoryPath`: disponibilidade / inventário por quarto.
   * Não confundir com a doc. «FETCH Rates from Aiosell» (`…/api/v2/cm/data/{PARTNER}`, type=rates) — isso é
   * **ler** tarifas **desde** a Aiosell. «Rates Restrictions POST from Aiosell to 3rd Party» é **outro** sentido
   * (Aiosell → OTAs); aqui fazemos PMS → Aiosell, alinhado ao «Rate Push» / update-rates da KB.
   */
  const baseUrl = (channel.aiosell_base_url as string) || "https://live.aiosell.com";
  const inventoryPath =
    (channel.aiosell_inventory_path as string) || "/api/v2/cm/update/sample-pms";
  const ratesPath = (channel.aiosell_rates_path as string) || "/api/v2/cm/update-rates/sample-pms";
  const inventoryUrl = joinBaseUrlAndPath(baseUrl, inventoryPath);
  const ratesUrl = joinBaseUrlAndPath(baseUrl, ratesPath);
  const auth = basicAuthHeader(apiUser, apiPass);

  const normPlanId = (p: unknown) => (p == null || p === "" ? null : String(p));

  /** Room Code + pelo menos um Rate Plan Code — necessário para enviar à Aiosell. */
  function configHasCompleteAiosellMapping(cfg: Record<string, unknown> | undefined): boolean {
    if (!cfg) return false;
    const room = normalizeChannelCodeInput(cfg.channel_room_code);
    const rps = splitAiosellRatePlanCodes(cfg.channel_rate_plan_code).filter((c) => sanitizeAiosellCode(c));
    return !!(room && rps.length > 0);
  }

  /**
   * Preferir linha exata (categoria + plano). Se existir mas estiver sem códigos CM,
   * usar o mapeamento «só categoria» (pricing_plan_id null), como na UI de Tarifas por canal.
   * Evita ignorar o tarifário quando há linha vazia para o plano (ex.: Deluxe + «Teste»).
   */
  const findPricingConfig = (categoryId: string, planId: string | null) => {
    const list = channelPricingConfig || [];
    const want = normPlanId(planId);
    const exact = list.find(
      (c: Record<string, unknown>) =>
        c.category_id === categoryId && normPlanId(c.pricing_plan_id) === want
    );
    const categoryFallback = list.find(
      (c: Record<string, unknown>) => c.category_id === categoryId && normPlanId(c.pricing_plan_id) === null
    );
    if (exact && configHasCompleteAiosellMapping(exact)) return exact;
    if (categoryFallback && configHasCompleteAiosellMapping(categoryFallback)) return categoryFallback;
    return exact ?? categoryFallback;
  };

  const rateCalendarRowsAll = (rateCalendar || []) as Record<string, unknown>[];

  function rowHasCompleteMapping(rate: Record<string, unknown>): boolean {
    const cfg = findPricingConfig(
      rate.category_id as string,
      rate.pricing_plan_id as string | null
    );
    const room = normalizeChannelCodeInput(cfg?.channel_room_code);
    const rps = splitAiosellRatePlanCodes(cfg?.channel_rate_plan_code).filter(
      (c) => sanitizeAiosellCode(c)
    );
    return !!(cfg && room && rps.length > 0);
  }

  /** Pares (categoria+plano) no calendário sem Room/Rate Plan Code — não entram no payload Aiosell. */
  const skippedUnmappedPairs: string[] = [];
  {
    const seenPair = new Set<string>();
    for (const rate of rateCalendarRowsAll) {
      const categoryId = rate.category_id as string;
      const planId = rate.pricing_plan_id as string | null;
      const key = `${categoryId}\0${planId ?? ""}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      if (rowHasCompleteMapping(rate)) continue;
      const rc = rate.room_categories as Record<string, unknown> | null | undefined;
      const pp = pickPricingPlanRow(rate);
      const catName = (rc?.name as string)?.trim() || categoryId;
      const planLabel = planId
        ? String((pp?.code as string) || (pp?.name as string) || planId).trim() || planId
        : "sem plano";
      skippedUnmappedPairs.push(
        `"${catName}" + plano "${planLabel}" — ignorado (sem mapeamento Aiosell completo em Tarifas por canal).`
      );
    }
  }

  const rows = rateCalendarRowsAll.filter(rowHasCompleteMapping);

  const tariffCategoryDateKeysAiosell = new Set<string>();
  for (const rate of rateCalendarRowsAll) {
    const cid = String(rate.category_id ?? "").trim();
    const d = normalizeCalendarDate(rate.date) ?? String(rate.date).slice(0, 10);
    if (cid && d) tariffCategoryDateKeysAiosell.add(`${cid}|${d}`);
  }

  if (rateCalendarRowsAll.length > 0 && rows.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Nenhum par (categoria + plano de tarifa) no intervalo do calendário tem mapeamento Aiosell completo. Preencha Room Code e Rate Plan Code em Tarifas por canal, ou remova essas combinações do calendário tarifário.",
        details: skippedUnmappedPairs.slice(0, 40),
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (skippedUnmappedPairs.length > 0) {
    console.warn(
      "[aiosell-sync] sync_skipped_unmapped_pairs",
      JSON.stringify({
        skipped_pair_count: skippedUnmappedPairs.length,
        samples: skippedUnmappedPairs.slice(0, 15),
        rate_calendar_rows_all: rateCalendarRowsAll.length,
        rate_calendar_rows_synced: rows.length,
      })
    );
  }

  /** Qual coluna x1–x4 do ARI alimenta `rates[].rate` (config. canal `aiosell_list_rate_occupancy`). */
  const aiosellListRateOccupancy = clampAiosellListOccupancy(channel.aiosell_list_rate_occupancy);

  /**
   * `list` (predefinido): todas as linhas `rates[]` usam `aiosell_list_rate_occupancy` para o preço.
   * `infer`: infere 1–4 a partir do segmento `-s-`/`-d-`/`-t-`/`-q-` no `rateplanCode` (secret `AIOSELL_RATE_OCCUPANCY_MODE=infer`).
   */
  const rawOccMode = (Deno.env.get("AIOSELL_RATE_OCCUPANCY_MODE") ?? "").trim().toLowerCase();
  const aiosellRateOccupancyMode: "list" | "infer" =
    rawOccMode === "infer" || rawOccMode === "infer_from_rateplan" || rawOccMode === "rateplan"
      ? "infer"
      : "list";

  const { data: hotelRateSettings } = await db
    .from("hotel_settings")
    .select("rate_system_settings")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const rawRs = hotelRateSettings?.rate_system_settings as Record<string, unknown> | undefined;
  const autoApplyDynamicRules =
    rawRs?.auto_apply_dynamic_rules === true || String(rawRs?.auto_apply_dynamic_rules ?? "").toLowerCase() === "true";
  const persistDynamicRates =
    rawRs?.persist_dynamic_rates === true || String(rawRs?.persist_dynamic_rates ?? "").toLowerCase() === "true";

  /** Alinha ao mapa de tarifas / rates-map: BAR x2 (2 adultos) antes de ocupação x1–x4 e Tarifas por canal. */
  function dynamicPricingKey(catId: string, dateRaw: unknown, planId: unknown): string {
    const d = normalizeCalendarDate(dateRaw) ?? String(dateRaw ?? "").slice(0, 10);
    const pid = planId == null || planId === "" ? "" : String(planId);
    return `${String(catId).trim()}\0${d}\0${pid}`;
  }

  let dynamicBarOcc2ByKey = new Map<string, number>();
  let dynamicPersistRowsLoaded = 0;
  let dynamicRpcPrefetchKeys = 0;

  if (autoApplyDynamicRules) {
    if (persistDynamicRates) {
      const { data: dynRows, error: dynErr } = await db
        .from("dynamic_pricing_results")
        .select("category_id, rate_plan_id, date, final_price")
        .eq("establishment_id", establishmentId)
        .gte("date", today)
        .lte("date", futureDateStr);
      if (dynErr) {
        console.warn("[aiosell-sync] dynamic_pricing_results (fallback tarifário):", dynErr.message);
      } else {
        for (const r of dynRows ?? []) {
          const fp = Number((r as { final_price?: unknown }).final_price);
          if (!Number.isFinite(fp) || fp <= 0) continue;
          const k = dynamicPricingKey(
            String((r as { category_id: string }).category_id),
            (r as { date: unknown }).date,
            (r as { rate_plan_id: unknown }).rate_plan_id
          );
          dynamicBarOcc2ByKey.set(k, fp);
        }
        dynamicPersistRowsLoaded = dynamicBarOcc2ByKey.size;
      }
    } else {
      const uniqueKeys = new Set<string>();
      for (const rate of rows) {
        const pid = rate.pricing_plan_id;
        if (pid == null || pid === "") continue;
        uniqueKeys.add(
          dynamicPricingKey(rate.category_id as string, rate.date, pid)
        );
      }
      dynamicRpcPrefetchKeys = uniqueKeys.size;
      const RPC_BATCH = 50;
      const keysArr = [...uniqueKeys];
      const rawMax = (Deno.env.get("AIOSELL_DYNAMIC_RPC_MAX_KEYS") ?? "").trim();
      const parsedMax = parseInt(rawMax, 10);
      const maxKeys =
        Number.isFinite(parsedMax) && parsedMax > 0 ? Math.min(20_000, parsedMax) : 12_000;
      const limited = keysArr.length > maxKeys ? keysArr.slice(0, maxKeys) : keysArr;
      if (keysArr.length > maxKeys) {
        console.warn(
          "[aiosell-sync] dynamic_pricing_rpc_cap",
          JSON.stringify({
            keys_total: keysArr.length,
            keys_prefetched: maxKeys,
            hint:
              "Limite de chamadas calculate_rate_price no sync; ative «Persistir preços dinâmicos» e recalc-rates para usar tabela dynamic_pricing_results (mais rápido) ou aumente AIOSELL_DYNAMIC_RPC_MAX_KEYS.",
          })
        );
      }
      for (let i = 0; i < limited.length; i += RPC_BATCH) {
        const batch = limited.slice(i, i + RPC_BATCH);
        const results = await Promise.all(
          batch.map(async (key) => {
            const parts = key.split("\0");
            const catId = parts[0];
            const dateStr = parts[1];
            const planId = parts[2];
            if (!planId) return null;
            const { data, error } = await db.rpc("calculate_rate_price", {
              p_establishment_id: establishmentId,
              p_category_id: catId,
              p_pricing_plan_id: planId,
              p_date: dateStr,
              p_adults: 2,
              p_children: 0,
            });
            if (error) {
              console.warn("[aiosell-sync] calculate_rate_price:", error.message, key);
              return null;
            }
            const n = Number(data ?? 0);
            if (!Number.isFinite(n) || n <= 0) return null;
            return { key, price: n };
          })
        );
        for (const p of results) {
          if (p) dynamicBarOcc2ByKey.set(p.key, p.price);
        }
      }
    }
  }

  console.info(
    "[aiosell-sync] sync_start",
    JSON.stringify({
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
    })
  );

  const resolveRoomAndRateplanCodes = (rate: Record<string, unknown>) => {
    const cfg = findPricingConfig(rate.category_id as string, rate.pricing_plan_id as string | null);
    const roomCode = normalizeChannelCodeInput(cfg?.channel_room_code);
    const rateplanCodes = splitAiosellRatePlanCodes(cfg?.channel_rate_plan_code)
      .map((c) => sanitizeAiosellCode(c))
      .filter(Boolean);
    return { roomCode, rateplanCodes, cfg };
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
      // Usar UTC explícito para evitar ambiguidade de timezone nas comparações de data.
      const currentDate = new Date(date + "T12:00:00Z");
      const occupiedRooms = catRes.filter((r) => {
        const checkin = new Date(String(r.checkin_date).slice(0, 10) + "T00:00:00Z");
        const checkout = new Date(String(r.checkout_date).slice(0, 10) + "T00:00:00Z");
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
        const forced = aiosellRestrictionShape(null, null, false, false, true, null, null);
        agg = agg ? mergeTwoInvRestrictions(agg, forced) : forced;
      }

      const listC = invCombinedByCategory.get(categoryId) || [];
      listC.push({ date, available, restrictions: agg });
      invCombinedByCategory.set(categoryId, listC);
    });
  });

  /**
   * Datas sem linha em rate_calendar: inventário 0 + stopSell no CM (evita meses sem tarifário com stock/valor residual).
   * Só quando existe tarifário parcial (≥1 linha na janela); com calendário vazio mantém-se o erro «sem dados» mais abaixo.
   */
  if (tariffCategoryDateKeysAiosell.size > 0) {
    const mappedCategoryIdsForInventory = new Set<string>();
    for (const c of channelPricingConfig || []) {
      if (configHasCompleteAiosellMapping(c as Record<string, unknown>)) {
        mappedCategoryIdsForInventory.add(c.category_id as string);
      }
    }
    const datesInWindowAiosell = eachDateInRangeInclusiveAiosell(today, futureDateStr);
    for (const categoryId of mappedCategoryIdsForInventory) {
      for (const date of datesInWindowAiosell) {
        if (tariffCategoryDateKeysAiosell.has(`${categoryId}|${date}`)) continue;

        const rss = salesStatusByCategoryDate.get(`${categoryId}|${date}`) ?? null;
        let agg: Record<string, unknown> | null = aiosellRestrictionShape(null, null, false, false, true, null, null);
        if (isCategoryClosedForOtaChannel(rss)) {
          const forced = aiosellRestrictionShape(null, null, false, false, true, null, null);
          agg = agg ? mergeTwoInvRestrictions(agg, forced) : forced;
        }

        const listC = invCombinedByCategory.get(categoryId) || [];
        listC.push({ date, available: 0, restrictions: agg });
        invCombinedByCategory.set(categoryId, listC);
      }
    }
  }

  invCombinedByCategory.forEach((days) => {
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
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
    const sampleRate = rows.find((r) => r.category_id === catId);
    const rateLike = (sampleRate ?? {
      category_id: catId,
      pricing_plan_id: null,
    }) as Record<string, unknown>;
    const { roomCode } = resolveRoomAndRateplanCodes(rateLike);
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
  const priceIndex = buildRateCalendarPriceIndex(rateCalendarRowsAll);
  const logAllRates = envFlagTrue("AIOSELL_LOG_RATE_DEBUG");
  let logAllEmitted = 0;
  let suspectPriceEmitted = 0;
  let derivedRecomputedCount = 0;
  /** Linhas de calendário: plano derivado (base+flutuação) mas preço enviado = `base_price` guardado (>2). */
  let derivedTrustCalendarRows = 0;
  let sentRateEqOneCount = 0;
  const sentRateOneSamples: Record<string, unknown>[] = [];
  /** Linhas `rates[]` no payload cujo valor vem de Tarifas por canal (não do tarifário PMS). */
  let channelPricingFixedPriceLines = 0;
  let channelPricingMultiplierLines = 0;
  /** Linhas em que o BAR x2 veio de precificação dinâmica (antes de ocupação x1–x4 e Tarifas por canal). */
  let dynamicPricingRowsApplied = 0;
  const MAX_LOG_ALL_RATES = 200;
  const MAX_SUSPECT_PRICE_LOGS = 150;

  rows.forEach((rate) => {
    const { roomCode, rateplanCodes, cfg } = resolveRoomAndRateplanCodes(rate);
    const planId = rate.pricing_plan_id as string | null;
    if (!roomCode || rateplanCodes.length === 0) return;

    const derived = resolveEffectiveBasePriceForSync(rate, priceIndex);
    if (derived.trustCalendarOverRecompute) {
      derivedTrustCalendarRows++;
    }
    if (derived.source === "recomputed_from_base_plan") {
      derivedRecomputedCount++;
      if (
        Math.abs(derived.storedBase - derived.effectiveBase) > 0.01 &&
        derived.storedBase <= 2 &&
        derived.basePlanBase != null &&
        derived.basePlanBase > 2
      ) {
        console.warn(
          "[aiosell-sync][rate] preço derivado corrigido (DB tinha valor baixo; recalculado a partir do plano base)",
          JSON.stringify({
            date: normalizeCalendarDate(rate.date) ?? String(rate.date),
            category_id: rate.category_id,
            pricing_plan_id: planId,
            stored_base_in_db: derived.storedBase,
            base_plan_base: derived.basePlanBase,
            effective_base_used: derived.effectiveBase,
            base_plan_id: derived.basePlanId,
          })
        );
      }
    }

    let effectiveBarOcc2 = derived.effectiveBase;
    let dynamicApplied = false;
    if (autoApplyDynamicRules && planId) {
      const dk = dynamicPricingKey(rate.category_id as string, rate.date, planId);
      const dynBar = dynamicBarOcc2ByKey.get(dk);
      if (dynBar != null && dynBar > 0) {
        effectiveBarOcc2 = dynBar;
        dynamicApplied = true;
      }
    }
    if (dynamicApplied) {
      dynamicPricingRowsApplied++;
    }

    const pricingKind = channelPricingRowKind(cfg ?? null, planId);
    const dateStr = String(rate.date);
    const pp = pickPricingPlanRow(rate);
    const rc = rate.room_categories as Record<string, unknown> | null | undefined;

    const rcRoom = sanitizeAiosellCode(roomCode);
    for (let rpcIdx = 0; rpcIdx < rateplanCodes.length; rpcIdx++) {
      const rpc = rateplanCodes[rpcIdx];
      const inferredOcc = inferOccupancyFromAiosellRateplanCode(rpc);
      const occForLine =
        aiosellRateOccupancyMode === "infer"
          ? inferredOcc ?? aiosellListRateOccupancy
          : aiosellListRateOccupancy;
      const pmsListBeforeChannel = pmsListPriceForAiosellOccupancy(
        rate,
        effectiveBarOcc2,
        occForLine
      );
      const rateForChannel = { ...rate, base_price: pmsListBeforeChannel };
      const { rounded, breakdown } = computeAiosellRateFromRowAndChannelPricing(rateForChannel, cfg);

      /** Contadores por linha de calendário (evita ×8 quando há 8 rateplanCodes). */
      if (rpcIdx === 0) {
        if (breakdown.step === "fixed_override") channelPricingFixedPriceLines++;
        else if (breakdown.step === "multiplier") channelPricingMultiplierLines++;
      }

      const line: AiosellRateLine = {
        roomCode: rcRoom,
        rateplanCode: rpc,
        rate: rounded,
        restrictions: effectiveRateRestrictionsForRow(rate),
      };
      if (!line.roomCode || !line.rateplanCode) continue;

      const suspectPrice =
        rounded <= 0 || Math.abs(rounded - 1) < 0.005;

      if (suspectPrice) {
        sentRateEqOneCount++;
        if (sentRateOneSamples.length < 10) {
          sentRateOneSamples.push({
            date: normalizeCalendarDate(rate.date) ?? dateStr,
            category_id: rate.category_id,
            pricing_plan_id: planId,
            plan_label: pp
              ? String((pp.code as string) || (pp.name as string) || planId || "")
              : undefined,
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
        category_name: typeof rc?.name === "string" ? rc.name : undefined,
        plan_label: pp
          ? String((pp.code as string) || (pp.name as string) || planId || "")
          : undefined,
        trust_calendar_over_recompute: derived.trustCalendarOverRecompute === true,
        roomCode: line.roomCode,
        rateplanCode: line.rateplanCode,
        sent_rate: line.rate,
        aiosell_rate_occupancy_mode: aiosellRateOccupancyMode,
        list_occupancy: occForLine,
        list_occupancy_fallback_from_channel:
          aiosellRateOccupancyMode === "infer" && inferredOcc == null,
        pms_price_after_occupancy_before_channel: pmsListBeforeChannel,
        derived_base_source: derived.source,
        stored_base_in_db: derived.storedBase,
        base_plan_base: derived.basePlanBase,
        effective_base_occ2: effectiveBarOcc2,
        dynamic_pricing_applied: dynamicApplied,
        tariff_bar_occ2_before_dynamic: derived.effectiveBase,
        channel_pricing_match: pricingKind,
        channel_pricing_id: cfg?.id != null ? String((cfg as Record<string, unknown>).id) : undefined,
        pricing_step: breakdown.step,
        base_price_raw: breakdown.base_price_raw,
        base_num: breakdown.base_num,
        channel_pricing_fixed_price: breakdown.fixed_price,
        channel_pricing_multiplier: breakdown.price_multiplier,
        computed_before_round: breakdown.computed_before_round,
        reason_if_suspect: suspectPrice
          ? summarizeRateOneReason(rounded, breakdown, pricingKind)
          : undefined,
      };

      if (logAllRates && logAllEmitted < MAX_LOG_ALL_RATES) {
        logAllEmitted++;
        console.info("[aiosell-sync][rate]", JSON.stringify({ ...logPayload, mode: "debug_all" }));
      } else if (!logAllRates && suspectPrice && suspectPriceEmitted < MAX_SUSPECT_PRICE_LOGS) {
        suspectPriceEmitted++;
        console.warn(
          "[aiosell-sync][rate]",
          JSON.stringify({ ...logPayload, mode: "suspect_price", reason: summarizeRateOneReason(rounded, breakdown, pricingKind) })
        );
      }

      const list = ratesByDate.get(dateStr) || [];
      list.push(line);
      ratesByDate.set(dateStr, list);
    }
  });

  console.info(
    "[aiosell-sync] rate_build_summary",
    JSON.stringify({
      rate_calendar_rows: rows.length,
      /** Linhas usadas no índice base+planId+data (inclui pares sem mapeamento Aiosell). */
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
      /** Planos derivados (base+flutuação) em que o preço x2 foi o `base_price` guardado, não o recalculado. */
      derived_trust_calendar_rows: derivedTrustCalendarRows,
      aiosell_list_rate_occupancy: aiosellListRateOccupancy,
      aiosell_rate_occupancy_mode: aiosellRateOccupancyMode,
      suspect_price_lines_logged: suspectPriceEmitted,
      lines_with_sent_rate_zero_or_one: sentRateEqOneCount,
      sample_rates_still_one: sentRateOneSamples,
      /** Se >0: preço enviado ignora alterações ao tarifário PMS (ver Tarifas por canal). */
      channel_pricing_fixed_price_lines: channelPricingFixedPriceLines,
      channel_pricing_multiplier_lines: channelPricingMultiplierLines,
    })
  );

  if (channelPricingFixedPriceLines > 0 || channelPricingMultiplierLines > 0) {
    console.warn(
      "[aiosell-sync] channel_pricing_overrides_active",
      JSON.stringify({
        fixed_price_lines: channelPricingFixedPriceLines,
        multiplier_lines: channelPricingMultiplierLines,
        hint:
          "fixed_price ignora o tarifário; price_multiplier ≠ 1 escala o tarifário. " +
          "Multiplicador 1,0 (padrão) equivale ao tarifário — se o CM não muda, verifique API Aiosell ou datas na janela de sync.",
      })
    );
  }

  if (suspectPriceEmitted > 0) {
    console.warn(
      `[aiosell-sync][rate] ${suspectPriceEmitted} linha(s) com preço 0 ou ~1 (detalhe nos logs [aiosell-sync][rate] acima). ` +
        `Secret AIOSELL_LOG_RATE_DEBUG=1 lista até ${MAX_LOG_ALL_RATES} linhas por execução.`
    );
  }

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

  /** Pares room+rate plan **efetivamente** no JSON enviado a `update-rates` (após merge/dedupe). */
  const syncedRatePairs = collectRatePairsFromPayload(
    rateUpdatesPayload as unknown as Record<string, unknown>[]
  );
  const inventoryRoomCodesSent = collectInventoryRoomCodesFromPayload(
    inventoryCombinedPayload as unknown as Record<string, unknown>[]
  );
  const uniqueRoomCodesFromPayload = [...new Set(syncedRatePairs.map((p) => p.roomCode))].sort();
  const uniqueRateplanCodesFromPayload = [...new Set(syncedRatePairs.map((p) => p.rateplanCode))].sort();
  const mappingSemanticsWarning = aiosellMappingSemanticsWarning(
    uniqueRoomCodesFromPayload,
    uniqueRateplanCodesFromPayload
  );

  const SYNC_LOG_MAX_PAIRS = 150;
  console.info(
    "[aiosell-sync] sync_mapping_coverage",
    JSON.stringify({
      doc:
        "Aiosell PMS→CM: POST update-rates com hotelCode + updates[].rates[] (roomCode, rateplanCode, rate, restrictions); inventário com updates[].rooms[].roomCode.",
      unique_rate_pairs: syncedRatePairs.length,
      rate_pairs:
        syncedRatePairs.length > SYNC_LOG_MAX_PAIRS
          ? syncedRatePairs.slice(0, SYNC_LOG_MAX_PAIRS)
          : syncedRatePairs,
      rate_pairs_truncated: syncedRatePairs.length > SYNC_LOG_MAX_PAIRS,
      unique_room_codes: uniqueRoomCodesFromPayload,
      unique_rateplan_codes: uniqueRateplanCodesFromPayload,
      inventory_room_codes: inventoryRoomCodesSent,
      mapping_semantics_warning: mappingSemanticsWarning,
    })
  );
  if (mappingSemanticsWarning) {
    console.warn("[aiosell-sync] sync_mapping_semantics", mappingSemanticsWarning);
  }

  /**
   * A Aiosell pode responder HTTP 200 com JSON { success: false, message: "..." }.
   * Só tratar como sucesso quando o corpo não contradiz (doc: { success: true, message }).
   */
  async function postToAiosell(
    url: string,
    payload: Record<string, unknown>,
    label: string
  ): Promise<
    | { ok: true; aiosellMessage?: string; acceptedDespiteHttpError?: boolean }
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
    const parsedMessage =
      parsed && typeof parsed.message === "string" ? parsed.message.trim() : "";
    const acceptedDespiteHttpError =
      !res.ok &&
      parsed?.success === true &&
      /^request received successfully\.?$/i.test(parsedMessage);

    if (!res.ok && !acceptedDespiteHttpError) {
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
    const aiosellMessage = parsedMessage || undefined;
    if (acceptedDespiteHttpError) {
      console.warn(
        "[aiosell-sync] aiosell_http_error_but_acknowledged",
        JSON.stringify({
          label,
          status: res.status,
          statusText: res.statusText,
          message: aiosellMessage ?? null,
          hint:
            "Aiosell respondeu HTTP não-2xx, mas com payload de ACK (success=true, Request Received Successfully). O sync segue como aceite para evitar falso negativo no PMS.",
        })
      );
    }
    return { ok: true, aiosellMessage, acceptedDespiteHttpError };
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
    let aiosellRatePostMessage: string | undefined;
    let aiosellRatePostAckOnly = false;
    /** Metadados POST tarifas (lotes) — útil em diagnóstico quando o CM não reflete o tarifário. */
    let aiosellRatesPostRequests = 0;
    let aiosellRatesUpdateChunkSizeUsed = 0;

    /**
     * Lotes de disponibilidade: variável de ambiente opcional (predefinido 15; antes 25).
     * Ex.: AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE=10
     */
    const rawInvChunk = (Deno.env.get("AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE") ?? "").trim();
    const parsedInvChunk = parseInt(rawInvChunk, 10);
    const INV_AVAIL_CHUNK_SIZE =
      Number.isFinite(parsedInvChunk) && parsedInvChunk > 0 ? Math.min(100, parsedInvChunk) : 15;

    /**
     * Tarifas: enviar `updates[]` em vários POSTs se o payload for grande.
     * Um único corpo enorme pode exceder limites de gateway ou ser aceite (HTTP 200) sem aplicar tudo.
     * Predefinido: 40 blocos `startDate`–`endDate` por pedido. Ex.: AIOSELL_RATES_UPDATE_CHUNK_SIZE=25
     */
    const rawRatesChunk = (Deno.env.get("AIOSELL_RATES_UPDATE_CHUNK_SIZE") ?? "").trim();
    const parsedRatesChunk = parseInt(rawRatesChunk, 10);
    const RATES_UPDATE_CHUNK_SIZE =
      Number.isFinite(parsedRatesChunk) && parsedRatesChunk > 0
        ? Math.min(120, Math.max(1, parsedRatesChunk))
        : 40;

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
      const rateChunksTotal = Math.ceil(rateUpdatesPayload.length / RATES_UPDATE_CHUNK_SIZE);
      const rateMsgs: string[] = [];
      for (let off = 0; off < rateUpdatesPayload.length; off += RATES_UPDATE_CHUNK_SIZE) {
        const chunk = rateUpdatesPayload.slice(off, off + RATES_UPDATE_CHUNK_SIZE);
        const label =
          rateChunksTotal > 1
            ? `Aiosell tarifas (preço + restrições) lote ${Math.floor(off / RATES_UPDATE_CHUNK_SIZE) + 1}/${rateChunksTotal}`
            : "Aiosell tarifas (preço + restrições)";
        const r = await postToAiosell(ratesUrl, { hotelCode, updates: chunk }, label);
        if (!r.ok) {
          return new Response(JSON.stringify({ success: false, error: r.msg }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (r.aiosellMessage) rateMsgs.push(r.aiosellMessage);
        console.info(
          "[aiosell-sync] aiosell_rate_post_ok",
          JSON.stringify({
            hotelCode,
            rates_path: ratesPath,
            rates_url_host: (() => {
              try {
                return new URL(ratesUrl).host;
              } catch {
                return null;
              }
            })(),
            http_ok: true,
            api_message: r.aiosellMessage ?? null,
            sample_pms_path: pathLooksLikeAiosellSamplePms(ratesPath),
            chunk_index: rateChunksTotal > 1 ? Math.floor(off / RATES_UPDATE_CHUNK_SIZE) + 1 : null,
            chunk_of: rateChunksTotal > 1 ? rateChunksTotal : null,
            updates_blocks_in_chunk: chunk.length,
          })
        );
        const ackMsg = (r.aiosellMessage ?? "").trim();
        // "Request Received Successfully" é a resposta normal da Aiosell em produção —
        // não aciona o aviso ACK-only (seria ruído em cada sync).
        // Só aciona quando não há mensagem nenhuma (resposta inesperada).
        if (!ackMsg) {
          aiosellRatePostAckOnly = true;
        }
      }
      aiosellRatePostMessage = rateMsgs.length > 0 ? rateMsgs.join(" · ") : undefined;
      if (rateMsgs.length > 0) aiosellApiMessages.push(`Tarifas: ${rateMsgs.join(" · ")}`);
      if (rateChunksTotal > 1) {
        console.info(
          "[aiosell-sync] aiosell_rate_post_chunks_done",
          JSON.stringify({
            total_update_blocks: rateUpdatesPayload.length,
            chunk_size: RATES_UPDATE_CHUNK_SIZE,
            requests_sent: rateChunksTotal,
          })
        );
      }
      if (aiosellRatePostAckOnly) {
        console.warn(
          "[aiosell-sync] aiosell_rate_post_ack_only",
          JSON.stringify({
            api_messages_sample: rateMsgs.slice(0, 3),
            rate_chunks: rateChunksTotal,
            hint:
              "A resposta só confirma receção do pedido. A atualização visível no Channel Manager pode demorar ou depender de processamento na Aiosell — se o tarifário não refletir as alterações, confirme com o suporte Aiosell.",
          })
        );
      }
      aiosellRatesPostRequests = rateChunksTotal;
      aiosellRatesUpdateChunkSizeUsed = RATES_UPDATE_CHUNK_SIZE;
      if (pathLooksLikeAiosellSamplePms(ratesPath)) {
        console.warn(
          "[aiosell-sync] sample_pms_path_rates",
          JSON.stringify({
            hint:
              "O path de tarifas contém «sample-pms» (exemplo da documentação). A API pode responder HTTP 200 mas o painel Aiosell do hotel em produção pode não refletir alterações. Peça à Aiosell o path de produção do endpoint update-rates e configure em Channel Manager → Editar canal → Path de tarifas.",
            ratesPath,
          })
        );
      }
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
        // Aiosell responde "Request Received Successfully" em produção (doc indica "Inventory Updated
        // Successfully", mas ambas confirmam receção/aceitação do payload).
        const invAckMsg = (r.aiosellMessage ?? "").trim();
        if (invAckMsg) {
          const inventory_accepted =
            /inventory updated successfully/i.test(invAckMsg) ||
            /request received successfully/i.test(invAckMsg) ||
            /received successfully/i.test(invAckMsg);
          console.info(
            "[aiosell-sync] aiosell_inventory_post_ok",
            JSON.stringify({
              hotelCode,
              inventory_path: inventoryPath,
              http_ok: true,
              api_message: invAckMsg,
              inventory_accepted,
              chunk_index: totalChunks > 1 ? Math.floor(off / INV_AVAIL_CHUNK_SIZE) + 1 : null,
              chunk_of: totalChunks > 1 ? totalChunks : null,
            })
          );
        }
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
        /** Pares únicos (roomCode + rateplanCode) no payload de tarifas enviado à Aiosell (update-rates). */
        syncedRatePairs,
        syncedRatePairsCount: syncedRatePairs.length,
        /** roomCode únicos no payload de inventário (se aplicável). */
        inventoryRoomCodesSent,
        /** Mensagens retornadas pela API Aiosell (quando existem). */
        aiosellApiMessages,
        /**
         * Confirme no painel Aiosell: hotelCode, URLs e códigos de quarto/tarifa
         * devem ser os fornecidos no onboarding (paths /sample-pms são os da documentação).
         */
        syncHints: {
          hotelCode,
          establishmentId,
          /** Linhas de calendário com mapeamento completo (enviadas à Aiosell). */
          rateCalendarRows: rows.length,
          /** Total de linhas no `rate_calendar` na janela (inclui pares sem mapeamento, ignorados). */
          rateCalendarRowsAll: rateCalendarRowsAll.length,
          /** Pares (categoria+plano) no calendário sem Room/Rate Plan Code — não sincronizados. */
          skippedUnmappedPairCount: skippedUnmappedPairs.length,
          skippedUnmappedPairDetails:
            skippedUnmappedPairs.length > 0 ? skippedUnmappedPairs.slice(0, 40) : [],
          /** Linhas ARI `rate_sales_status` usadas para fechar inventário OTA (closed / restricted_ota / restricted_all). */
          rateSalesStatusRows: (rateSalesStatusRows || []).length,
          inventoryPath,
          ratesPath,
          /** Códigos únicos no POST de tarifas (payload final, após merge). */
          roomCodesSent: uniqueRoomCodesFromPayload,
          rateplanCodesSent: uniqueRateplanCodesFromPayload,
          /** Heurística: roomCode parece plano PMS e rateplanCode parece ID CM — possível troca de campos. */
          mappingSemanticsWarning,
          /** 1–4: coluna x1–x4 do tarifário ARI cujo preço alimenta `rates[].rate`. */
          aiosellListRateOccupancy,
          /**
           * `list_column_only`: todas as linhas usam `aiosellListRateOccupancy` (predefinido).
           * `infer_from_rateplan_code`: ocupação inferida de `-s-`/`-d-`/`-t-`/`-q-` no código (secret `AIOSELL_RATE_OCCUPANCY_MODE=infer`).
           */
          aiosellRateOccupancyMode:
            aiosellRateOccupancyMode === "infer" ? "infer_from_rateplan_code" : "list_column_only",
          /** Linhas do POST `rates[]` cujo valor vem de `channel_pricing.fixed_price` (substitui o tarifário). */
          channelPricingFixedPriceLineCount: channelPricingFixedPriceLines,
          /** Linhas de calendário com `price_multiplier` ≠ 1 (≠ tarifário direto). */
          channelPricingMultiplierLineCount: channelPricingMultiplierLines,
          /** true se `aiosell_rates_path` contém sample-pms (sandbox/doc — ver aviso nos logs). */
          aiosellSamplePmsPathRates: pathLooksLikeAiosellSamplePms(ratesPath),
          /** true se `aiosell_inventory_path` contém sample-pms. */
          aiosellSamplePmsPathInventory: pathLooksLikeAiosellSamplePms(inventoryPath),
          /** Mensagem opcional no JSON de resposta da API Aiosell após POST de tarifas. */
          aiosellRatePostMessage: aiosellRatePostMessage ?? null,
          /**
           * true quando a mensagem da API é só confirmação de receção (ex.: «Request Received Successfully»).
           * Não garante que o painel CM já mostre os novos tarifários.
           */
          aiosellRatePostAckOnly,
          /** Nº de pedidos HTTP de tarifas (1 por lote de blocos `updates`). */
          aiosellRatesPostRequests,
          /** Blocos `startDate`–`endDate` por pedido (secret AIOSELL_RATES_UPDATE_CHUNK_SIZE). */
          aiosellRatesUpdateChunkSizeUsed,
          /** Regras dinâmicas: com `auto_apply_dynamic_rules` desligado, o envio segue só o tarifário (`rate_calendar`). */
          autoApplyDynamicRules,
          persistDynamicRates,
          dynamicPricingSyncMode: autoApplyDynamicRules
            ? persistDynamicRates
              ? "persisted_results"
              : "rpc_calculate_rate_price"
            : "tariff_only",
          dynamicPricingRowsApplied: dynamicPricingRowsApplied,
        },
        /**
         * Diagnóstico de preço (resposta HTTP — não depende dos logs do Supabase).
         * `derivedPricesRecomputed`: planos «base + flutuação» recalculados a partir do plano base no mesmo sync.
         */
        ratePriceDiagnostics: {
          autoApplyDynamicRules,
          persistDynamicRates,
          dynamicPricingSyncMode: autoApplyDynamicRules
            ? persistDynamicRates
              ? "persisted_results"
              : "rpc_calculate_rate_price"
            : "tariff_only",
          dynamicPricingRowsApplied: dynamicPricingRowsApplied,
          derivedPricesRecomputed: derivedRecomputedCount,
          /** Planos derivados em que o preço enviado seguiu `rate_calendar.base_price` guardado (>2). */
          derivedTrustCalendarRows: derivedTrustCalendarRows,
          linesWithSentRateZeroOrOne: sentRateEqOneCount,
          samples: sentRateOneSamples,
          channelPricingFixedPriceLineCount: channelPricingFixedPriceLines,
          channelPricingMultiplierLineCount: channelPricingMultiplierLines,
          logsHint:
            "Logs: procure sync_start, rate_build_summary, channel_pricing_overrides_active e [aiosell-sync][rate] (Supabase → Edge Functions → aiosell-sync → Logs).",
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
