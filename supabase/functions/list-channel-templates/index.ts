import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let establishmentId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        establishmentId = body.establishment_id ?? null;
      } catch {
        // empty
      }
    }

    if (!establishmentId) {
      return new Response(
        JSON.stringify({ error: "Informe establishment_id no body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config, error: configErr } = await supabase
      .from("checkin_charge_config")
      .select("channel, channel_config")
      .eq("establishment_id", establishmentId)
      .single();

    if (configErr || !config) {
      return new Response(
        JSON.stringify({ error: "Configuração de cobrança de check-in não encontrada", internal: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channel = config.channel as string;
    const channelConfig = (config.channel_config as Record<string, unknown>) || {};
    const result: {
      channel: string;
      internal: Array<{ id: string; name: string; body: string }>;
      meta?: Array<{ name: string; language: string; status?: string }>;
      chatwoot?: Array<{ id: number; short_code: string; content: string }>;
      chatwoot_inbox?: { id: number; channel_type?: string; provider?: string; is_whatsapp_cloud: boolean };
    } = {
      channel,
      internal: [],
    };

    // Sempre retornar templates internos (Evolution / sistema)
    const { data: internalTemplates } = await supabase
      .from("checkin_charge_templates")
      .select("id, name, body")
      .eq("establishment_id", establishmentId)
      .order("name");
    result.internal = (internalTemplates ?? []).map((t: { id: string; name: string; body: string }) => ({ id: t.id, name: t.name, body: t.body }));

    if (channel === "whatsapp_cloud") {
      const wabaId = (channelConfig.waba_id as string) || (channelConfig.phone_id as string);
      const token = (channelConfig.access_token as string) || "";
      if (wabaId && token) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${wabaId}/message_templates?fields=name,language,status,components`,
            {
              headers: { "Authorization": `Bearer ${token}` },
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            result.meta = [];
          } else {
            const list = (data?.data ?? []) as Array<{ name: string; language: string; status?: string }>;
            result.meta = list.map((t: { name: string; language: string; status?: string }) => ({
              name: t.name,
              language: t.language ?? "pt_BR",
              status: t.status,
            }));
          }
        } catch {
          result.meta = [];
        }
      } else {
        result.meta = [];
      }
    }

    if (channel === "chatwoot") {
      const baseUrl = (channelConfig.base_url as string) || "";
      const accountId = (channelConfig.account_id as number) || 0;
      const inboxId = (channelConfig.inbox_id as number) || 0;
      const apiKey = (channelConfig.api_key as string) || "";
      if (baseUrl && apiKey) {
        try {
          const apiBase = String(baseUrl).replace(/\/$/, "");
          if (accountId && inboxId) {
            const inboxRes = await fetch(`${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
              headers: {
                "api_access_token": apiKey,
                "Content-Type": "application/json",
              },
            });
            const inboxData = await inboxRes.json().catch(() => ({}));
            const inbox = (inboxData?.payload ?? inboxData) as {
              id?: number;
              channel_type?: string;
              provider?: string;
            };
            const provider = String(inbox?.provider ?? "").toLowerCase();
            const channelType = String(inbox?.channel_type ?? "");
            result.chatwoot_inbox = {
              id: Number(inbox?.id ?? inboxId),
              channel_type: channelType || undefined,
              provider: provider || undefined,
              is_whatsapp_cloud:
                provider === "whatsapp_cloud" ||
                (channelType === "Channel::Whatsapp" && (provider === "" || provider === "cloud")),
            };
          } else {
            result.chatwoot_inbox = { id: Number(inboxId || 0), is_whatsapp_cloud: false };
          }

          const res = await fetch(
            `${apiBase}/api/v1/accounts/${accountId}/canned_responses`,
            {
              headers: {
                "api_access_token": apiKey,
                "Content-Type": "application/json",
              },
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            result.chatwoot = [];
          } else {
            const list = (data?.payload ?? data ?? []) as Array<{ id: number; short_code: string; content: string }>;
            result.chatwoot = Array.isArray(list) ? list.map((c: { id: number; short_code: string; content: string }) => ({
              id: c.id,
              short_code: c.short_code ?? String(c.id),
              content: c.content ?? "",
            })) : [];
          }

          if (result.chatwoot_inbox?.is_whatsapp_cloud && accountId) {
            const templateEndpoints = [
              `${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}/whatsapp_templates`,
              `${apiBase}/api/v1/accounts/${accountId}/whatsapp_templates`,
              `${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}/message_templates`,
            ];
            let templates: Array<{ name: string; language: string; status?: string }> = [];
            for (const endpoint of templateEndpoints) {
              const tRes = await fetch(endpoint, {
                headers: {
                  "api_access_token": apiKey,
                  "Content-Type": "application/json",
                },
              });
              const tData = await tRes.json().catch(() => ({}));
              if (!tRes.ok) continue;
              const list = (tData?.payload ?? tData?.data ?? tData ?? []) as Array<{
                name?: string;
                language?: string;
                locale?: string;
                status?: string;
              }>;
              if (!Array.isArray(list) || list.length === 0) continue;
              templates = list
                .filter((t) => !!t?.name)
                .map((t) => ({
                  name: String(t.name),
                  language: String(t.language ?? t.locale ?? "pt_BR"),
                  status: t.status,
                }));
              if (templates.length > 0) break;
            }
            result.meta = templates;
          }
        } catch {
          result.chatwoot = [];
          if (!result.meta) result.meta = [];
          if (!result.chatwoot_inbox) result.chatwoot_inbox = { id: Number(inboxId || 0), is_whatsapp_cloud: false };
        }
      } else {
        result.chatwoot = [];
        result.meta = [];
        result.chatwoot_inbox = { id: Number(inboxId || 0), is_whatsapp_cloud: false };
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
