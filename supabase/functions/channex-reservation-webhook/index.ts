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

function normalizeEvent(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const payload = (await req.json()) as AnyObj;
    const eventName = normalizeEvent(payload.event);
    const revisionId =
      String((payload.data as AnyObj)?.revision_id ?? (payload.data as AnyObj)?.booking_revision_id ?? "").trim() ||
      null;
    const propertyId = String(payload.property_id ?? "").trim();

    const isBookingTrigger =
      eventName === "booking" ||
      eventName === "booking_new" ||
      eventName === "booking_modification" ||
      eventName === "booking_cancellation";

    if (!isBookingTrigger) {
      return json({ success: true, ignored: true, reason: "Evento sem ação de reserva" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: channel } = await supabase
      .from("ota_channels")
      .select("id, establishment_id, channex_property_id, channex_use_webhook")
      .eq("channel_manager_type", "channex")
      .eq("channex_property_id", propertyId)
      .maybeSingle();
    if (!channel?.id) {
      return json({ success: true, ignored: true, reason: "Canal Channex não mapeado para property_id" });
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channel.id,
      establishment_id: channel.establishment_id,
      direction: "webhook",
      status: "info",
      endpoint: "channex-reservation-webhook",
      request_payload: payload,
      message: `Webhook recebido (${eventName})`,
    });

    if (channel.channex_use_webhook === false) {
      return json({ success: true, ignored: true, reason: "Webhook trigger desativado no canal" });
    }

    const invokeResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/channex-reservations-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        channel_id: channel.id,
        establishment_id: channel.establishment_id,
        revision_id: revisionId,
      }),
    });
    const invokePayload = await invokeResp.json().catch(() => ({}));
    return json({ success: invokeResp.ok, event: eventName, revision_id: revisionId, sync: invokePayload });
  } catch (error) {
    console.error("channex-reservation-webhook error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
