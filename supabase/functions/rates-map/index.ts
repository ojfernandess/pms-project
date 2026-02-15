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
const BATCH_SIZE = 10;

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

    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    const redis =
      redisUrl && redisToken
        ? new Redis({ url: redisUrl, token: redisToken })
        : null;

    let enriched = false;
    if (redis && entries.length > 0) {
      const { data: settings } = await supabase
        .from("hotel_settings")
        .select("rate_system_settings")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      const autoApply =
        settings?.rate_system_settings?.auto_apply_dynamic_rules === true ||
        settings?.rate_system_settings?.auto_apply_dynamic_rules === "true";

      if (autoApply) {
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
