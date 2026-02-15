/**
 * Worker de recálculo de preços dinâmicos em background.
 * Invocado por Cron ou manualmente para pré-calcular preços com regras dinâmicas.
 *
 * Query params:
 * - establishment_id (opcional): UUID do estabelecimento. Se omitido, processa todos.
 * - days_ahead (opcional): Dias a recalcular a partir de hoje (default: 7)
 *
 * Requer autenticação (Bearer token) ou pode ser configurado como Cron com service key.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const establishmentIdParam = url.searchParams.get("establishment_id");
    const daysAhead = Math.min(parseInt(url.searchParams.get("days_ahead") || "7", 10), 30);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date().toISOString().split("T")[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead - 1);
    const endDateStr = endDate.toISOString().split("T")[0];

    let establishmentIds: string[] = [];
    if (establishmentIdParam) {
      establishmentIds = [establishmentIdParam];
    } else {
      const { data: establishments } = await supabase
        .from("establishments")
        .select("id")
        .eq("is_active", true);
      establishmentIds = (establishments || []).map((e: { id: string }) => e.id);
    }

    let totalUpdated = 0;
    const results: { establishment_id: string; updated: number }[] = [];

    for (const estId of establishmentIds) {
      const { data: settings } = await supabase
        .from("hotel_settings")
        .select("rate_system_settings")
        .eq("establishment_id", estId)
        .maybeSingle();

      const persistDynamic = settings?.rate_system_settings?.persist_dynamic_rates === true;
      if (!persistDynamic) continue;

      const { data: categories } = await supabase
        .from("room_categories")
        .select("id")
        .eq("establishment_id", estId);

      const { data: plans } = await supabase
        .from("pricing_plans")
        .select("id")
        .eq("establishment_id", estId)
        .eq("is_active", true);

      const catIds = (categories || []).map((c: { id: string }) => c.id);
      const planIds = (plans || []).map((p: { id: string }) => p.id);

      const entries: { establishment_id: string; category_id: string; pricing_plan_id: string; date: string; base_price: number }[] = [];
      const BATCH = 50;

      for (const catId of catIds.slice(0, 5)) {
        for (const planId of planIds.slice(0, 3)) {
          let d = new Date(today);
          const end = new Date(endDateStr);
          while (d <= end) {
            const dateStr = d.toISOString().split("T")[0];
            const { data: price } = await supabase.rpc("calculate_rate_price", {
              p_establishment_id: estId,
              p_category_id: catId,
              p_pricing_plan_id: planId,
              p_date: dateStr,
              p_adults: 2,
              p_children: 0,
            });
            const finalPrice = Number(price ?? 0);
            if (finalPrice > 0) {
              entries.push({
                establishment_id: estId,
                category_id: catId,
                pricing_plan_id: planId,
                date: dateStr,
                base_price: finalPrice,
              });
            }
            d.setDate(d.getDate() + 1);
          }
        }
      }

      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        await supabase.from("rate_calendar").upsert(batch, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        });
        totalUpdated += batch.length;
      }

      results.push({ establishment_id: estId, updated: entries.length });
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_updated: totalUpdated,
        establishments: results,
        period: { start: today, end: endDateStr },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[recalc-rates]", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro interno",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
