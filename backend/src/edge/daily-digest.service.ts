import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SITE_SETTINGS_ID } from "./robots.service";

const TIMEZONE = "America/Sao_Paulo";

@Injectable()
export class DailyDigestService {
  constructor(private readonly prisma: PrismaService) {}

  async send(body: { establishment_id?: string; date?: string }) {
    if (!body.establishment_id) return { status: 400, body: { error: "establishment_id é obrigatório" } };
    const targetDate = body.date || localDate(new Date());
    const range = dayRange(targetDate);
    const settings = await this.prisma.site_settings.findUnique({ where: { id: SITE_SETTINGS_ID }, select: { features_enabled: true } });
    const establishment = await this.prisma.establishments.findUnique({ where: { id: body.establishment_id }, select: { company_id: true, name: true } });
    const feature = ((settings?.features_enabled as Record<string, unknown> | null)?.checkin_charge_enabled || {}) as { enabled?: boolean; company_ids?: string[] };
    const enabled = feature.enabled === true && (!feature.company_ids?.length || feature.company_ids.includes(establishment?.company_id || ""));
    if (!enabled) return { status: 403, body: { error: "Mensagens & Cobranças não está habilitado para esta empresa" } };
    const config = await this.prisma.checkin_charge_config.findUnique({ where: { establishment_id: body.establishment_id } });
    if (!config?.enabled) return { status: 400, body: { error: "Configuração de Mensagens & Cobranças não ativa ou não encontrada" } };
    const channelConfig = (config.channel_config || {}) as Record<string, unknown>;
    const [checkouts, tickets, blocks] = await Promise.all([
      this.prisma.reservations.findMany({
        where: { establishment_id: body.establishment_id, checkout_date: { gte: range.start, lt: range.end }, status: { in: ["confirmed", "checkedin"] } },
        select: { reservation_code: true, guest_name: true, rooms: { select: { name: true, room_number: true } }, room_categories: { select: { name: true } } },
      }),
      this.prisma.maintenance_tickets.findMany({
        where: { establishment_id: body.establishment_id, opened_at: { gte: range.start, lt: range.end } },
        select: { title: true, status: true, rooms: { select: { name: true, room_number: true } } },
      }),
      this.prisma.reservations.findMany({
        where: { establishment_id: body.establishment_id, status: "blocked", created_at: { gte: range.start, lt: range.end } },
        select: { checkin_date: true, checkout_date: true, notes: true, rooms: { select: { name: true, room_number: true } }, room_categories: { select: { name: true } } },
      }),
    ]);
    const lines = [
      `📋 *Resumo do dia – ${formatDateBr(`${targetDate}T12:00:00`)}*`,
      `_${establishment?.name || "Estabelecimento"}_`,
      "",
      "🚪 *Checkouts do dia*",
      ...(checkouts.length ? checkouts.map((row) => `• ${row.rooms?.name || row.rooms?.room_number || row.room_categories?.name || "—"} | ${row.guest_name || "—"} | ${row.reservation_code || "—"}`) : ["Nenhum checkout previsto."]),
      "",
      "🔧 *Manutenções abertas no dia*",
      ...(tickets.length ? tickets.map((row) => `• ${row.rooms?.name || row.rooms?.room_number || "—"}: ${row.title} (${row.status || "open"})`) : ["Nenhuma manutenção aberta no dia."]),
      "",
      "🚫 *Bloqueios de quarto criados no dia*",
      ...(blocks.length ? blocks.map((row) => `• ${row.rooms?.name || row.rooms?.room_number || row.room_categories?.name || "—"} | ${formatDateBr(row.checkin_date)} a ${formatDateBr(row.checkout_date)}${row.notes ? ` – ${row.notes}` : ""}`) : ["Nenhum bloqueio criado no dia."]),
    ];
    const message = lines.join("\n");
    const result: { ok: boolean; sent_chatwoot?: boolean; sent_whatsapp?: number; errors: string[] } = { ok: false, errors: [] };
    const conversationId = Number(channelConfig.daily_digest_conversation_id || 0);
    if (config.channel === "chatwoot" && conversationId > 0) {
      const sent = await sendChatwoot(channelConfig, conversationId, message);
      if (sent.ok) {
        result.sent_chatwoot = true;
        result.ok = true;
      } else result.errors.push(`Chatwoot: ${sent.error || "erro desconhecido"}`);
    } else if (config.channel === "chatwoot") {
      result.errors.push("Configure o ID da conversa (grupo) no Chatwoot em Configuração → Resumo do dia.");
    }
    if (config.channel === "whatsapp_cloud") {
      const phones = phonesFrom(channelConfig.daily_digest_phones);
      let sentCount = 0;
      for (const phone of phones) {
        const sent = await sendWhatsapp(channelConfig, phone, message);
        if (sent.ok) sentCount += 1;
        else result.errors.push(`WhatsApp ${phone}: ${sent.error}`);
      }
      if (sentCount > 0) {
        result.sent_whatsapp = sentCount;
        result.ok = true;
      }
      if (sentCount === 0 && result.errors.length === 0) result.errors.push("Informe ao menos um número em Configuração → Resumo do dia (WhatsApp Cloud).");
    }
    return { status: 200, body: result };
  }

  async schedule() {
    const now = saoPauloNow();
    const configs = await this.prisma.checkin_charge_config.findMany({ where: { enabled: true }, select: { establishment_id: true, channel_config: true } });
    if (!configs.length) {
      return { status: 200, body: { success: true, sent: 0, message: "Nenhum estabelecimento com resumo do dia agendado.", current_time: now.time, current_hour: now.hour, date: now.date } };
    }
    const due = configs.filter((config) => {
      const channel = (config.channel_config || {}) as Record<string, unknown>;
      const automate = channel.daily_digest_automate === true || channel.daily_digest_automate === "true";
      return automate && hourOf(String(channel.daily_digest_time || "")) === now.hour;
    });
    if (!due.length) {
      const configured = [...new Set(configs.map((config) => String(((config.channel_config || {}) as Record<string, unknown>).daily_digest_time || "")).filter(Boolean))];
      return { status: 200, body: { success: true, sent: 0, message: `Nenhum estabelecimento com envio agendado para a hora ${now.hour}h (agora ${now.time}). Configure em Mensagens & Cobranças → Configuração → Resumo do dia o horário desejado (ex.: ${String(now.hour).padStart(2, "0")}:00).`, current_time: now.time, current_hour: now.hour, date: now.date, configured_times: configured.length ? configured : undefined } };
    }
    const results = [];
    for (const config of due) {
      try {
        const sent = await this.send({ establishment_id: config.establishment_id, date: now.date });
        const body = sent.body as { ok?: boolean; sent_chatwoot?: boolean; sent_whatsapp?: number; errors?: string[]; error?: string };
        const ok = sent.status < 300 && (body.ok === true || body.sent_chatwoot === true || (body.sent_whatsapp ?? 0) > 0);
        results.push({ establishment_id: config.establishment_id, ok, error: ok ? undefined : body.errors?.join(" ") || body.error });
      } catch (error) {
        results.push({ establishment_id: config.establishment_id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { status: 200, body: { success: true, sent: results.filter((row) => row.ok).length, total: due.length, current_time: now.time, current_hour: now.hour, date: now.date, results } };
  }
}

function dayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { start: new Date(year, month - 1, day), end: new Date(year, month - 1, day + 1) };
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateBr(value: Date | string): string {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const hour = (parts.find((part) => part.type === "hour")?.value || "00").padStart(2, "0");
  const minute = (parts.find((part) => part.type === "minute")?.value || "00").padStart(2, "0");
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { time: `${hour}:${minute}`, hour: Number(hour), date };
}

function hourOf(value: string): number | null {
  const hour = Number.parseInt(value.split(":")[0] || "", 10);
  return Number.isNaN(hour) || hour < 0 || hour > 23 ? null : hour;
}

function phonesFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

async function sendChatwoot(config: Record<string, unknown>, conversationId: number, message: string) {
  const baseUrl = String(config.base_url || "").replace(/\/$/, "");
  const accountId = Number(config.account_id || 0);
  const apiKey = String(config.api_key || "");
  if (!baseUrl || !apiKey || !conversationId) return { ok: false, error: "Chatwoot: URL, API Key ou ID da conversa ausente" };
  const response = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { api_access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; errors?: Array<{ message?: string }> };
  return response.ok ? { ok: true } : { ok: false, error: data.message || data.errors?.[0]?.message || String(response.status) };
}

async function sendWhatsapp(config: Record<string, unknown>, to: string, message: string) {
  const phoneId = String(config.phone_id || "");
  const token = String(config.access_token || "");
  const clean = to.replace(/\D/g, "");
  if (!token || !clean) return { ok: false, error: "WhatsApp Cloud: config ou destinatário ausente" };
  const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: clean, type: "text", text: { body: message } }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return response.ok ? { ok: true } : { ok: false, error: data.error?.message || response.statusText };
}
