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

function ensureString(v: unknown): string {
  return String(v ?? "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as AnyObj;
    const reservationId = ensureString(body.reservation_id);
    const categoryId = ensureString(body.category_id);
    const overbookingContext = body.overbooking_context === true;
    if (!reservationId || !categoryId) {
      return json({ success: false, error: "reservation_id e category_id são obrigatórios" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: otaRow } = await supabase
      .from("ota_reservations")
      .select("ota_channel_id")
      .eq("reservation_id", reservationId)
      .maybeSingle();
    const channelId = ensureString((otaRow as AnyObj | null)?.ota_channel_id);
    if (!channelId) return json({ success: true, skipped: true, reason: "Reserva sem vínculo OTA" });

    const { data: channel } = await supabase
      .from("ota_channels")
      .select("id, name, channel_manager_type, channex_api_key, channex_property_id, channex_base_url")
      .eq("id", channelId)
      .maybeSingle();
    const ch = (channel ?? {}) as AnyObj;
    if (ensureString(ch.channel_manager_type) !== "channex") {
      return json({ success: true, skipped: true, reason: "Canal não é Channex" });
    }
    const apiKey = ensureString(ch.channex_api_key);
    const propertyId = ensureString(ch.channex_property_id);
    const baseUrl = ensureString(ch.channex_base_url) || "https://staging.channex.io";
    if (!apiKey || !propertyId) {
      return json({ success: true, skipped: true, reason: "Canal sem API key/property id Channex" });
    }

    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, establishment_id, pricing_plan_id")
      .eq("id", reservationId)
      .maybeSingle();
    const pricingPlanId = ensureString((reservation as AnyObj | null)?.pricing_plan_id);

    const { data: latestRevision } = await supabase
      .from("channex_booking_revisions")
      .select("booking_id, payload")
      .eq("ota_channel_id", channelId)
      .eq("reservation_id", reservationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const bookingId = ensureString((latestRevision as AnyObj | null)?.booking_id);
    if (!bookingId) return json({ success: true, skipped: true, reason: "Booking id Channex não encontrado" });

    const basePayload = (((latestRevision as AnyObj | null)?.payload ?? {}) as AnyObj) || {};
    const rooms = Array.isArray(basePayload.rooms) ? (basePayload.rooms as AnyObj[]) : [];
    const firstRoom = (rooms[0] ?? {}) as AnyObj;

    let mappingQuery = supabase
      .from("channel_pricing")
      .select("channel_room_code, channel_rate_plan_code, pricing_plan_id")
      .eq("ota_channel_id", channelId)
      .eq("category_id", categoryId)
      .eq("is_active", true);

    if (pricingPlanId) {
      mappingQuery = mappingQuery.eq("pricing_plan_id", pricingPlanId);
    }
    let { data: mapping } = await mappingQuery.limit(1).maybeSingle();

    if (!mapping) {
      const fallback = await supabase
        .from("channel_pricing")
        .select("channel_room_code, channel_rate_plan_code, pricing_plan_id")
        .eq("ota_channel_id", channelId)
        .eq("category_id", categoryId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      mapping = fallback.data;
    }

    const mappedRoomType = ensureString((mapping as AnyObj | null)?.channel_room_code);
    const mappedRatePlan = ensureString((mapping as AnyObj | null)?.channel_rate_plan_code);
    if (!mappedRoomType || !mappedRatePlan) {
      return json({ success: true, skipped: true, reason: "Mapeamento Channex da categoria não encontrado" });
    }

    const bookingPayload: AnyObj = {
      ...basePayload,
      status: "modified",
      property_id: propertyId,
      meta: {
        ...((basePayload.meta as AnyObj | undefined) ?? {}),
        ...(overbookingContext
          ? {
              pms_overbooking_reallocation: true,
              pms_overbooking_reallocation_at: new Date().toISOString(),
              pms_source: "pms_project_main",
            }
          : {}),
      },
      rooms: [
        {
          ...firstRoom,
          meta: {
            ...((firstRoom.meta as AnyObj | undefined) ?? {}),
            ...(overbookingContext ? { pms_overbooking_reallocation: true } : {}),
          },
          room_type_id: mappedRoomType,
          room_type_code: mappedRoomType,
          rate_plan_id: mappedRatePlan,
          rate_plan_code: mappedRatePlan,
        },
      ],
    };

    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/bookings/${bookingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "user-api-key": apiKey,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ booking: bookingPayload }),
    });

    const respJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: ensureString((reservation as AnyObj | null)?.establishment_id) || null,
        direction: "push_booking",
        status: "error",
        endpoint: "/api/v1/bookings/:booking_id",
        request_payload: { reservation_id: reservationId, category_id: categoryId, booking_id: bookingId },
        response_payload: respJson,
        message: `Falha ao atualizar categoria da reserva no Channex (HTTP ${resp.status})`,
      });
      return json({ success: false, error: `HTTP ${resp.status}`, response: respJson }, 502);
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channelId,
      direction: "push_booking",
      status: "success",
      endpoint: "/api/v1/bookings/:booking_id",
      request_payload: { reservation_id: reservationId, category_id: categoryId, booking_id: bookingId },
      response_payload: respJson,
      message: "Categoria da reserva atualizada no Channex via CRS API",
    });

    return json({ success: true, booking_id: bookingId, response: respJson });
  } catch (e) {
    console.error("channex-booking-crs-update error", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
