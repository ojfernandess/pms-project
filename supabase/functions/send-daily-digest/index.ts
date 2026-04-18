import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function getDayRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatDateBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Envia mensagem para uma conversa existente no Chatwoot (ex.: grupo). */
async function sendChatwootConversationMessage(
  channelConfig: Record<string, unknown>,
  conversationId: number,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = (channelConfig.base_url as string) || "";
  const accountId = (channelConfig.account_id as number) || 0;
  const apiKey = (channelConfig.api_key as string) || "";
  if (!baseUrl || !apiKey || !conversationId) {
    return { ok: false, error: "Chatwoot: URL, API Key ou ID da conversa ausente" };
  }
  const apiBase = baseUrl.replace(/\/$/, "");
  const headers = {
    "api_access_token": apiKey,
    "Content-Type": "application/json",
  };
  try {
    const res = await fetch(
      `${apiBase}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ content: message }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || data?.errors?.[0]?.message || String(res.status) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Envia mensagem de texto via WhatsApp Cloud API. */
async function sendWhatsAppCloudText(
  channelConfig: Record<string, unknown>,
  to: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const phoneId = (channelConfig.phone_id as string) || "";
  const token = (channelConfig.access_token as string) || "";
  if (!token || !to) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
  const cleanPhone = to.replace(/\D/g, "");
  if (!cleanPhone) return { ok: false, error: "Número inválido" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || res.statusText };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let establishmentId: string | null = null;
  let dateStr: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    establishmentId = body.establishment_id ?? null;
    dateStr = body.date ?? null;
  } catch {
    // empty
  }

  if (!establishmentId) {
    return new Response(
      JSON.stringify({ error: "establishment_id é obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const today = new Date();
  const targetDate = dateStr || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const dayRange = getDayRange(targetDate);

  const { data: siteSettings } = await supabase
    .from("site_settings")
    .select("features_enabled")
    .eq("id", SITE_SETTINGS_ID)
    .single();

  const { data: establishment } = await supabase
    .from("establishments")
    .select("company_id, name")
    .eq("id", establishmentId)
    .single();

  const companyId = establishment?.company_id;
  const establishmentName = (establishment?.name as string) || "Estabelecimento";

  const fe = (siteSettings?.features_enabled as Record<string, unknown>)?.checkin_charge_enabled as { enabled?: boolean; company_ids?: string[] } | undefined;
  const featureEnabled = fe?.enabled === true && (!fe?.company_ids?.length || fe.company_ids.includes(companyId));
  if (!featureEnabled) {
    return new Response(
      JSON.stringify({ error: "Mensagens & Cobranças não está habilitado para esta empresa" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: config, error: configErr } = await supabase
    .from("checkin_charge_config")
    .select("*")
    .eq("establishment_id", establishmentId)
    .single();

  if (configErr || !config || !config.enabled) {
    return new Response(
      JSON.stringify({ error: "Configuração de Mensagens & Cobranças não ativa ou não encontrada" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const channel = config.channel as string;
  const channelConfig = (config.channel_config as Record<string, unknown>) ?? {};

  // Checkouts do dia: reservas com checkout_date no dia e status confirmado ou com check-in
  const { data: checkoutReservations } = await supabase
    .from("reservations")
    .select(`
      id, reservation_code, guest_name, checkout_date,
      rooms ( name, room_number ),
      room_categories ( name )
    `)
    .eq("establishment_id", establishmentId)
    .gte("checkout_date", dayRange.start)
    .lt("checkout_date", dayRange.end)
    .in("status", ["confirmed", "checkedin"]);

  // Manutenções criadas no dia (opened_at ou created_at no intervalo do dia)
  const { data: maintenanceTickets } = await supabase
    .from("maintenance_tickets")
    .select(`
      id, title, status, opened_at,
      rooms ( name, room_number )
    `)
    .eq("establishment_id", establishmentId)
    .gte("opened_at", dayRange.start)
    .lt("opened_at", dayRange.end);

  // Bloqueios de quarto criados no dia (reservations status=blocked, created_at no dia)
  const { data: blockReservations } = await supabase
    .from("reservations")
    .select(`
      id, checkin_date, checkout_date, notes,
      rooms ( name, room_number ),
      room_categories ( name )
    `)
    .eq("establishment_id", establishmentId)
    .eq("status", "blocked")
    .gte("created_at", dayRange.start)
    .lt("created_at", dayRange.end);

  const lines: string[] = [];
  lines.push(`📋 *Resumo do dia – ${formatDateBr(targetDate + "T12:00:00")}*`);
  lines.push(`_${establishmentName}_`);
  lines.push("");

  lines.push("🚪 *Checkouts do dia*");
  if (checkoutReservations && checkoutReservations.length > 0) {
    for (const r of checkoutReservations as any[]) {
      const roomName = r.rooms?.name || r.rooms?.room_number || r.room_categories?.name || "—";
      const guest = r.guest_name || "—";
      lines.push(`• ${roomName} | ${guest} | ${r.reservation_code || "—"}`);
    }
  } else {
    lines.push("Nenhum checkout previsto.");
  }
  lines.push("");

  lines.push("🔧 *Manutenções abertas no dia*");
  if (maintenanceTickets && maintenanceTickets.length > 0) {
    for (const t of maintenanceTickets as any[]) {
      const roomName = t.rooms?.name || t.rooms?.room_number || "—";
      lines.push(`• ${roomName}: ${t.title} (${t.status || "open"})`);
    }
  } else {
    lines.push("Nenhuma manutenção aberta no dia.");
  }
  lines.push("");

  lines.push("🚫 *Bloqueios de quarto criados no dia*");
  if (blockReservations && blockReservations.length > 0) {
    for (const r of blockReservations as any[]) {
      const roomName = r.rooms?.name || r.rooms?.room_number || r.room_categories?.name || "—";
      const period = `${formatDateBr(r.checkin_date)} a ${formatDateBr(r.checkout_date)}`;
      const note = r.notes ? ` – ${r.notes}` : "";
      lines.push(`• ${roomName} | ${period}${note}`);
    }
  } else {
    lines.push("Nenhum bloqueio criado no dia.");
  }

  const message = lines.join("\n");
  const result: { ok: boolean; sent_chatwoot?: boolean; sent_whatsapp?: number; errors?: string[] } = {
    ok: false,
    errors: [],
  };

  // Chatwoot: enviar para a conversa/grupo configurado
  const rawConvId = channelConfig.daily_digest_conversation_id;
  const conversationId =
    rawConvId != null && rawConvId !== "" && Number(rawConvId) > 0
      ? Number(rawConvId)
      : null;

  if (channel === "chatwoot" && conversationId) {
    const cw = await sendChatwootConversationMessage(channelConfig, conversationId, message);
    if (cw.ok) {
      result.sent_chatwoot = true;
      result.ok = true;
    } else {
      (result.errors as string[]).push(`Chatwoot: ${cw.error || "erro desconhecido"}`);
    }
  } else if (channel === "chatwoot" && !conversationId) {
    (result.errors as string[]).push("Configure o ID da conversa (grupo) no Chatwoot em Configuração → Resumo do dia.");
  }

  // WhatsApp Cloud API: enviar para números adicionais (daily_digest_phones)
  if (channel === "whatsapp_cloud") {
    let phones: string[] = [];
    const raw = channelConfig.daily_digest_phones;
    if (Array.isArray(raw)) {
      phones = raw.filter((p) => typeof p === "string" && p.trim());
    } else if (typeof raw === "string") {
      phones = raw.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    }
    let sentCount = 0;
    for (const phone of phones) {
      const w = await sendWhatsAppCloudText(channelConfig, phone, message);
      if (w.ok) sentCount++;
      else (result.errors as string[]).push(`WhatsApp ${phone}: ${w.error}`);
    }
    if (sentCount > 0) {
      result.sent_whatsapp = sentCount;
      result.ok = true;
    }
  }

  if (channel === "whatsapp_cloud" && (result.sent_whatsapp ?? 0) === 0 && !result.errors?.length) {
    (result.errors as string[]).push("Informe ao menos um número em Configuração → Resumo do dia (WhatsApp Cloud).");
  }

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
