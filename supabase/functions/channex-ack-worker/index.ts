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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearerToken = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!serviceRoleKey || bearerToken !== serviceRoleKey) {
      return json({ success: false, error: "Não autorizado" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as { channel_id?: string; establishment_id?: string };
    const channelId = String(body.channel_id ?? "").trim();
    const establishmentId = String(body.establishment_id ?? "").trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let channelQuery = supabase.from("ota_channels").select("*").eq("channel_manager_type", "channex");
    if (channelId) channelQuery = channelQuery.eq("id", channelId);
    if (establishmentId) channelQuery = channelQuery.eq("establishment_id", establishmentId);
    const { data: channels } = await channelQuery;

    let acked = 0;
    let failed = 0;

    for (const c of channels ?? []) {
      const channel = c as AnyObj;
      const apiKey = String(channel.channex_api_key ?? "").trim();
      const baseUrl = String(channel.channex_base_url ?? "https://staging.channex.io").trim().replace(/\/$/, "");
      if (!apiKey) continue;

      const { data: queueRows } = await supabase
        .from("channex_ack_queue")
        .select("*")
        .eq("ota_channel_id", String(channel.id))
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(50);

      for (const q of queueRows ?? []) {
        const row = q as AnyObj;
        const revisionId = String(row.revision_id ?? "").trim();
        if (!revisionId) continue;

        try {
          const resp = await fetch(`${baseUrl}/api/v1/booking_revisions/${revisionId}/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "user-api-key": apiKey },
          });
          if (!resp.ok) throw new Error(`ACK HTTP ${resp.status}`);

          acked += 1;
          await supabase
            .from("channex_ack_queue")
            .update({ status: "acked", attempts: Number(row.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
            .eq("id", row.id);

          await supabase
            .from("channex_booking_revisions")
            .update({
              process_status: "acked",
              acked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("ota_channel_id", channel.id)
            .eq("revision_id", revisionId);
        } catch (e) {
          failed += 1;
          const attempts = Number(row.attempts ?? 0) + 1;
          const waitMinutes = Math.min(60, 2 ** Math.min(6, attempts));
          const next = new Date(Date.now() + waitMinutes * 60 * 1000).toISOString();
          const status = attempts >= 10 ? "failed" : "pending";
          await supabase
            .from("channex_ack_queue")
            .update({
              attempts,
              status,
              next_attempt_at: next,
              last_error: e instanceof Error ? e.message : "Falha no ACK",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }

    return json({ success: true, acked, failed });
  } catch (error) {
    console.error("channex-ack-worker error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
