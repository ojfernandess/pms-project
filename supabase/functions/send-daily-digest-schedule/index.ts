import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "America/Sao_Paulo";

/** Retorna a hora atual no fuso informado: "HH:mm" e a hora numérica (0-23) para matching. */
function getCurrentTime(tz: string): { timeStr: string; hour: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hourStr = (parts.find((p) => p.type === "hour")?.value ?? "00").padStart(2, "0");
  const minute = (parts.find((p) => p.type === "minute")?.value ?? "00").padStart(2, "0");
  return { timeStr: `${hourStr}:${minute}`, hour: parseInt(hourStr, 10) };
}

/** Extrai a hora (0-23) de uma string "HH:mm" ou "H:mm". */
function parseConfigHour(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0], 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

/** Retorna a data atual (YYYY-MM-DD) no fuso informado. */
function getTodayStr(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(now); // "YYYY-MM-DD"
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
  const { timeStr: currentTime, hour: currentHour } = getCurrentTime(TIMEZONE);
  const todayStr = getTodayStr(TIMEZONE);

  try {
    const { data: configs, error: configError } = await supabase
      .from("checkin_charge_config")
      .select("establishment_id, channel_config")
      .eq("enabled", true);

    if (configError || !configs?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: "Nenhum estabelecimento com resumo do dia agendado.",
          current_time: currentTime,
          current_hour: currentHour,
          date: todayStr,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channelConfigs = configs as { establishment_id: string; channel_config: Record<string, unknown> }[];
    // Matching por hora: o envio é disparado quando a hora atual (Brasília) coincide com a hora configurada (ex.: 08:00 = qualquer execução entre 08:00 e 08:59).
    const toRun = channelConfigs.filter((c) => {
      const cc = c.channel_config ?? {};
      const automate = cc.daily_digest_automate === true || cc.daily_digest_automate === "true";
      const configHour = parseConfigHour((cc.daily_digest_time as string) ?? "");
      return automate && configHour !== null && configHour === currentHour;
    });

    if (toRun.length === 0) {
      const withAutomate = channelConfigs.filter((c) => {
        const cc = c.channel_config ?? {};
        return cc.daily_digest_automate === true || cc.daily_digest_automate === "true";
      });
      const configuredTimes = [...new Set(withAutomate.map((c) => (c.channel_config?.daily_digest_time as string) ?? "").filter(Boolean))];
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: `Nenhum estabelecimento com envio agendado para a hora ${currentHour}h (agora ${currentTime}). Configure em Mensagens & Cobranças → Configuração → Resumo do dia o horário desejado (ex.: ${String(currentHour).padStart(2, "0")}:00).`,
          current_time: currentTime,
          current_hour: currentHour,
          date: todayStr,
          configured_times: configuredTimes.length ? configuredTimes : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { establishment_id: string; ok: boolean; error?: string }[] = [];
    for (const { establishment_id } of toRun) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-daily-digest`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ establishment_id, date: todayStr }),
        });
        const data = await res.json().catch(() => ({}));
        const ok = res.ok && (data?.ok === true || data?.sent_chatwoot === true || (data?.sent_whatsapp ?? 0) > 0);
        results.push({
          establishment_id,
          ok,
          error: ok ? undefined : (data?.errors?.join?.(" ") ?? data?.error ?? res.statusText),
        });
      } catch (e) {
        results.push({ establishment_id, ok: false, error: (e as Error).message });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({
        success: true,
        sent,
        total: toRun.length,
        current_time: currentTime,
        current_hour: currentHour,
        date: todayStr,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-daily-digest-schedule:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
