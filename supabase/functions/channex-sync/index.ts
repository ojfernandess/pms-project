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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as { channel_id?: string; establishment_id?: string };
    const channelId = String(body?.channel_id ?? "").trim();
    const establishmentId = String(body?.establishment_id ?? "").trim();
    if (!channelId || !establishmentId) {
      return json({ success: false, error: "channel_id e establishment_id são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: channel, error: channelErr } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle();
    if (channelErr || !channel) return json({ success: false, error: "Canal não encontrado" }, 404);

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
    ] = await Promise.all([
      supabase
        .from("rate_calendar")
        .select("date, category_id, pricing_plan_id, base_price, adult_price, child_price")
        .eq("establishment_id", establishmentId)
        .gte("date", today)
        .lte("date", futureDate),
      supabase.from("channel_pricing").select("*").eq("ota_channel_id", channelId).eq("is_active", true),
      supabase.from("rooms").select("id, category_id, status"),
      supabase.from("room_categories").select("id, base_price"),
    ]);
    if (rcErr) throw rcErr;
    if (mapErr) throw mapErr;
    if (roomsErr) throw roomsErr;
    if (categoriesErr) throw categoriesErr;

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
      const isUnavailable = status === "maintenance" || status === "blocked";
      const current = roomAvailabilityByCategory.get(categoryId) ?? 0;
      roomAvailabilityByCategory.set(categoryId, current + (isUnavailable ? 0 : 1));
    }

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

      const basePrice = Number(r.base_price ?? 0);
      const multiplier = Number(mapping.price_multiplier ?? 1);
      const fixedPrice = mapping.fixed_price != null ? Number(mapping.fixed_price) : null;
      const finalPrice = fixedPrice != null && !Number.isNaN(fixedPrice) ? fixedPrice : basePrice * multiplier;
      const cents = Math.max(0, Math.round(finalPrice * 100));

      availabilityValues.push({
        property_id: propertyId,
        room_type_id: roomTypeId,
        date: String(r.date ?? ""),
        availability: Math.max(0, roomAvailabilityByCategory.get(categoryId) ?? 0),
      });
      restrictionValues.push({
        property_id: propertyId,
        rate_plan_id: ratePlanId,
        date: String(r.date ?? ""),
        rate: cents,
      });
    }

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
      request_payload: { availabilityCount: availabilityValues.length, restrictionsCount: restrictionValues.length },
      response_payload: {
        availabilityStatus: availabilityResp?.status ?? null,
        restrictionsStatus: restrictionsResp?.status ?? null,
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
