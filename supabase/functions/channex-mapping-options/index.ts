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

async function fetchChannex(baseUrl: string, apiKey: string, path: string) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "user-api-key": apiKey,
      "x-api-key": apiKey,
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { resp, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalServiceAuth = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;

    let supabaseUser: ReturnType<typeof createClient>;
    let authUserId: string | null = null;

    if (internalServiceAuth) {
      supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const {
        data: { user },
        error: userErr,
      } = await supabaseUser.auth.getUser();
      if (userErr || !user) {
        return json({ success: false, error: "Sessão inválida ou expirada" }, 401);
      }
      authUserId = user.id;
    }

    let body: { channel_id?: string; establishment_id?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ success: false, error: "JSON inválido" }, 400);
    }

    const channelId = String(body?.channel_id ?? "").trim();
    const establishmentId = String(body?.establishment_id ?? "").trim();
    if (!channelId || !establishmentId) {
      return json({ success: false, error: "channel_id e establishment_id são obrigatórios" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: channel } = await supabase
      .from("ota_channels")
      .select("id, establishment_id, channex_base_url, channex_api_key, channex_property_id, channel_manager_type")
      .eq("id", channelId)
      .maybeSingle();
    if (!channel?.id) return json({ success: false, error: "Canal não encontrado" }, 404);
    if (channel.channel_manager_type !== "channex") {
      return json({ success: false, error: "Canal informado não é do tipo Channex" }, 400);
    }
    if (String(channel.establishment_id) !== establishmentId) {
      return json({ success: false, error: "Canal não pertence ao estabelecimento selecionado" }, 403);
    }

    if (!internalServiceAuth && authUserId) {
      const { data: canAccess, error: accessRpcError } = await supabaseUser.rpc("user_can_access_establishment", {
        p_user_id: authUserId,
        p_establishment_id: establishmentId,
      });
      if (accessRpcError) {
        return json(
          { success: false, error: `Não foi possível validar permissão: ${accessRpcError.message}` },
          500,
        );
      }
      if (canAccess !== true) {
        return json({ success: false, error: "Sem permissão para este estabelecimento" }, 403);
      }
    }

    const apiKey = String(channel.channex_api_key ?? "").trim();
    const propertyId = String(channel.channex_property_id ?? "").trim();
    const baseUrl = String(channel.channex_base_url ?? "https://staging.channex.io").trim();
    if (!apiKey || !propertyId) {
      return json({ success: false, error: "Canal sem API Key/Property ID do Channex" }, 400);
    }

    const roomTypesReq = `/api/v1/room_types/options?filter[property_id]=${encodeURIComponent(propertyId)}`;
    const ratePlansReq = `/api/v1/rate_plans/options?filter[property_id]=${encodeURIComponent(propertyId)}`;
    const [{ resp: roomResp, data: roomData }, { resp: rateResp, data: rateData }] = await Promise.all([
      fetchChannex(baseUrl, apiKey, roomTypesReq),
      fetchChannex(baseUrl, apiKey, ratePlansReq),
    ]);

    if (!roomResp.ok || !rateResp.ok) {
      return json(
        {
          success: false,
          error: `Falha ao buscar opções no Channex (room_types=${roomResp.status}, rate_plans=${rateResp.status})`,
          roomData,
          rateData,
        },
        502
      );
    }

    const roomTypes = (Array.isArray((roomData as AnyObj).data) ? ((roomData as AnyObj).data as AnyObj[]) : [])
      .map((x) => ({
        id: String(x.id ?? (x.attributes as AnyObj)?.id ?? ""),
        title: String((x.attributes as AnyObj)?.title ?? ""),
        property_id: String((x.attributes as AnyObj)?.property_id ?? ""),
      }))
      .filter((x) => x.id);

    const ratePlans = (Array.isArray((rateData as AnyObj).data) ? ((rateData as AnyObj).data as AnyObj[]) : [])
      .map((x) => ({
        id: String(x.id ?? (x.attributes as AnyObj)?.id ?? ""),
        title: String((x.attributes as AnyObj)?.title ?? ""),
        room_type_id: String((x.attributes as AnyObj)?.room_type_id ?? ""),
        property_id: String((x.attributes as AnyObj)?.property_id ?? ""),
      }))
      .filter((x) => x.id);

    return json({ success: true, room_types: roomTypes, rate_plans: ratePlans });
  } catch (error) {
    console.error("channex-mapping-options error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
