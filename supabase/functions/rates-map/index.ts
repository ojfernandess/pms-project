// Edge Function: GET /rates/map
// Retorna rate_calendar otimizado para Mapa de Tarifas e Grade ARI
// Com Redis (Upstash): enriquece preços calculados quando auto_apply_dynamic_rules está ativo
// Parâmetros: establishment_id (obrigatório), start_date, end_date (opcionais)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://esm.sh/@upstash/redis@1.28.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REDIS_TTL_SEC = 900; // 15 minutos
const MAX_ENRICH = 300; // Limite para evitar timeout
const MAX_VIRTUAL_BASE_PLAN = 200; // Máximo de entradas virtuais (Tarifa Base + Flutuação)
const BATCH_SIZE = 25; // Maior = menos round-trips, resposta mais rápida

async function getCalculatedPriceWithCache(
  supabase: ReturnType<typeof createClient>,
  redis: Redis | null,
  estId: string,
  planId: string,
  catId: string,
  dateStr: string
): Promise<number> {
  const key = `rate:${estId}:${planId}:${catId}:${dateStr}`;

  if (redis) {
    try {
      const cached = await redis.get<number>(key);
      if (cached !== null && cached > 0) return cached;
    } catch (e) {
      console.warn("[rates-map] Redis get error:", e);
    }
  }

  const { data, error } = await supabase.rpc("calculate_rate_price", {
    p_establishment_id: estId,
    p_category_id: catId,
    p_pricing_plan_id: planId,
    p_date: dateStr,
    p_adults: 2,
    p_children: 0,
  });

  if (error) return 0;
  const price = Number(data ?? 0);

  if (redis && price > 0) {
    try {
      await redis.set(key, price, { ex: REDIS_TTL_SEC });
    } catch (e) {
      console.warn("[rates-map] Redis set error:", e);
    }
  }

  return price;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Autorização obrigatória" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const establishmentId = url.searchParams.get("establishment_id");
    if (!establishmentId) {
      return new Response(
        JSON.stringify({ error: "establishment_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase
      .from("rate_calendar")
      .select("*")
      .eq("establishment_id", establishmentId);

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data: rateCalendar, error } = await query.order("date", { ascending: true });

    if (error) throw error;

    const entries = rateCalendar ?? [];

    const { data: settings } = await supabase
      .from("hotel_settings")
      .select("rate_system_settings")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const persistDynamic =
      settings?.rate_system_settings?.persist_dynamic_rates === true ||
      settings?.rate_system_settings?.persist_dynamic_rates === "true";
    const autoApply =
      settings?.rate_system_settings?.auto_apply_dynamic_rules === true ||
      settings?.rate_system_settings?.auto_apply_dynamic_rules === "true";

    let enriched = false;
    const today = new Date().toISOString().split("T")[0];
    const defaultEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const dateMin = startDate || (entries[0] as Record<string, unknown> | undefined)?.date as string || today;
    const dateMax = endDate || (entries[entries.length - 1] as Record<string, unknown> | undefined)?.date as string || defaultEnd;

    // Persistência (persist_dynamic_rates): NUNCA recalcular. Apenas ler dynamic_pricing_results.
    // Cada usuário que entra NÃO dispara processamento — nível enterprise.
    const dynMap = new Map<string, { base_price: number; final_price: number }>();

    if (persistDynamic && autoApply) {
      const { data: dynResults } = await supabase
        .from("dynamic_pricing_results")
        .select("category_id, rate_plan_id, date, base_price, final_price")
        .eq("establishment_id", establishmentId)
        .gte("date", dateMin)
        .lte("date", dateMax);

      for (const r of dynResults ?? []) {
        dynMap.set(`${r.category_id}:${r.rate_plan_id}:${r.date}`, {
          base_price: Number(r.base_price),
          final_price: Number(r.final_price),
        });
      }

      for (const entry of entries as Record<string, unknown>[]) {
        const key = `${entry.category_id}:${entry.pricing_plan_id}:${entry.date}`;
        const dyn = dynMap.get(key);
        if (dyn && dyn.final_price > 0 && Math.abs(dyn.final_price - Number(entry.base_price ?? 0)) > 0.01) {
          entry.original_base_price = dyn.base_price;
          entry.base_price = dyn.final_price;
          enriched = true;
        }
      }
      // NUNCA chamar calculate_rate_price quando persist=ON. Entradas virtuais usam dynMap abaixo.
    } else if (autoApply && entries.length > 0) {
      const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
      const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
      const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
      const toEnrich = entries.slice(0, MAX_ENRICH);
      for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
        const batch = toEnrich.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (entry: Record<string, unknown>) => {
            const originalBase = Number(entry.base_price ?? 0);
            const price = await getCalculatedPriceWithCache(
              supabase,
              redis,
              establishmentId,
              entry.pricing_plan_id as string,
              entry.category_id as string,
              entry.date as string
            );
            if (price > 0 && Math.abs(price - originalBase) > 0.01) {
              entry.original_base_price = originalBase;
              entry.base_price = price;
              enriched = true;
            }
          })
        );
      }
    }

    // Materializar entradas virtuais para planos com Tarifa Base (base_plan_id_for_rate)
    const existingKeys = new Set<string>();
    for (const e of entries as Record<string, unknown>[]) {
      existingKeys.add(`${e.pricing_plan_id}:${e.category_id}:${e.date}`);
    }

    const { data: plansWithBase } = await supabase
      .from("pricing_plans")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .not("base_plan_id_for_rate", "is", null);

    if (plansWithBase && plansWithBase.length > 0) {
      const { data: planCategories } = await supabase
        .from("pricing_plan_categories")
        .select("pricing_plan_id, category_id")
        .in("pricing_plan_id", plansWithBase.map((p: { id: string }) => p.id));

      const virtualTasks: Array<{ planId: string; catId: string; dateStr: string }> = [];
      const start = new Date(dateMin).getTime();
      const end = new Date(dateMax).getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      for (const pc of planCategories ?? []) {
        const planId = pc.pricing_plan_id;
        const catId = pc.category_id;
        for (let t = start; t <= end && virtualTasks.length < MAX_VIRTUAL_BASE_PLAN; t += dayMs) {
          const dateStr = new Date(t).toISOString().split("T")[0];
          if (!existingKeys.has(`${planId}:${catId}:${dateStr}`)) {
            virtualTasks.push({ planId, catId, dateStr });
            existingKeys.add(`${planId}:${catId}:${dateStr}`);
          }
        }
        if (virtualTasks.length >= MAX_VIRTUAL_BASE_PLAN) break;
      }

      if (persistDynamic) {
        // Persist=ON: NUNCA calcular. Usar dynamic_pricing_results ou base da categoria.
        const catIds = [...new Set(virtualTasks.map((v) => v.catId))];
        const { data: categoriesBase } = await supabase
          .from("room_categories")
          .select("id, base_price")
          .in("id", catIds);
        const baseByCat = new Map<string, number>();
        for (const c of categoriesBase ?? []) {
          baseByCat.set(c.id, Number(c.base_price ?? 0));
        }
        for (const { planId, catId, dateStr } of virtualTasks) {
          const key = `${catId}:${planId}:${dateStr}`;
          const dyn = dynMap.get(key);
          const price = dyn?.final_price ?? baseByCat.get(catId) ?? 0;
          if (price > 0) {
            (entries as Record<string, unknown>[]).push({
              id: crypto.randomUUID(),
              establishment_id: establishmentId,
              pricing_plan_id: planId,
              category_id: catId,
              date: dateStr,
              base_price: price,
              ...(dyn && { original_base_price: dyn.base_price }),
            });
            if (dyn) enriched = true;
          }
        }
      } else {
        // Persist=OFF: calcular com Redis (cache compartilhado entre usuários)
        const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
        const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
        const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
        for (let i = 0; i < Math.min(virtualTasks.length, MAX_VIRTUAL_BASE_PLAN); i += BATCH_SIZE) {
          const batch = virtualTasks.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async ({ planId, catId, dateStr }) => {
              const price = await getCalculatedPriceWithCache(supabase, redis, establishmentId, planId, catId, dateStr);
              return price > 0 ? { planId, catId, dateStr, price } : null;
            })
          );
          for (const r of results) {
            if (r) {
              (entries as Record<string, unknown>[]).push({
                id: crypto.randomUUID(),
                establishment_id: establishmentId,
                pricing_plan_id: r.planId,
                category_id: r.catId,
                date: r.dateStr,
                base_price: r.price,
              });
            }
          }
        }
      }
      if (virtualTasks.length > 0) {
        (entries as Record<string, unknown>[]).sort((a, b) =>
          String(a.date).localeCompare(String(b.date))
        );
      }
    }

    return new Response(
      JSON.stringify({
        rateCalendar: entries,
        ...(enriched && { _enriched: true }),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[rates-map]", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro interno",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
