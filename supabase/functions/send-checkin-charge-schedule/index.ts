import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Retorna início e fim do dia para uma data (YYYY-MM-DD) em UTC. */
function getDayRange(dateStr: string): { start: string; end: string } {
  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Configuração Supabase ausente" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const establishmentIdParam = url.searchParams.get("establishment_id") || undefined;

    const allReservationIds: string[] = [];

    // 1) send_timing = 'days_before_checkin'
    const { data: configsDays } = await supabase
      .from("checkin_charge_config")
      .select("establishment_id, days_before_checkin")
      .eq("enabled", true)
      .eq("send_timing", "days_before_checkin")
      .not("days_before_checkin", "is", null);

    if (configsDays?.length) {
      const today = new Date();
      for (const config of configsDays) {
        if (establishmentIdParam && config.establishment_id !== establishmentIdParam) continue;
        const days = Number(config.days_before_checkin) || 0;
        const target = new Date(today);
        target.setUTCDate(target.getUTCDate() + days);
        const targetStr = target.toISOString().split("T")[0];
        const range = getDayRange(targetStr);

        const { data: chargesSent } = await supabase
          .from("checkin_charges")
          .select("reservation_id")
          .eq("establishment_id", config.establishment_id)
          .not("sent_at", "is", null);

        const sentIds = new Set((chargesSent ?? []).map((c) => c.reservation_id));

        const { data: reservations } = await supabase
          .from("reservations")
          .select("id")
          .eq("establishment_id", config.establishment_id)
          .gte("checkin_date", range.start)
          .lt("checkin_date", range.end)
          .in("status", ["pending", "unpaid", "confirmed"]);

        for (const r of reservations ?? []) {
          if (!sentIds.has(r.id)) allReservationIds.push(r.id);
        }
      }
    }

    // 2) send_timing = 'after_ota' — reservas criadas recentemente com canal OTA
    const { data: configsOta } = await supabase
      .from("checkin_charge_config")
      .select("establishment_id")
      .eq("enabled", true)
      .eq("send_timing", "after_ota");

    if (configsOta?.length) {
      const since = new Date();
      since.setUTCHours(since.getUTCHours() - 48);

      for (const config of configsOta) {
        if (establishmentIdParam && config.establishment_id !== establishmentIdParam) continue;

        const { data: chargesSent } = await supabase
          .from("checkin_charges")
          .select("reservation_id")
          .eq("establishment_id", config.establishment_id)
          .not("sent_at", "is", null);
        const sentIds = new Set((chargesSent ?? []).map((c) => c.reservation_id));

        const { data: reservations } = await supabase
          .from("reservations")
          .select("id")
          .eq("establishment_id", config.establishment_id)
          .gte("created_at", since.toISOString())
          .in("status", ["pending", "unpaid", "confirmed"])
          .in("channel", ["booking", "expedia", "ota"]);

        for (const r of reservations ?? []) {
          if (!sentIds.has(r.id)) allReservationIds.push(r.id);
        }
      }
    }

    const uniqueIds = [...new Set(allReservationIds)];

    if (uniqueIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: "Nenhuma reserva elegível para envio automático.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_ids: uniqueIds, intent: "checkin_reminder" }),
    });

    const resData = await res.json().catch(() => ({}));
    const results = resData?.results ?? [];
    const sent = results.filter((r: { success: boolean }) => r.success).length;
    const errors = results.filter((r: { success: boolean }) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: res.ok,
        sent,
        errors,
        total: uniqueIds.length,
        results: resData?.results,
      }),
      { status: res.ok ? 200 : res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-checkin-charge-schedule:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
