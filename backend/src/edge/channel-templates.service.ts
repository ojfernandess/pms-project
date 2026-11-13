import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChannelTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(establishmentId: string | undefined) {
    if (!establishmentId) return { status: 400, body: { error: "Informe establishment_id no body" } };
    const config = await this.prisma.checkin_charge_config.findUnique({
      where: { establishment_id: establishmentId },
      select: { channel: true, channel_config: true },
    });
    if (!config) return { status: 200, body: { error: "Configuração de cobrança de check-in não encontrada", internal: [] } };
    const channelConfig = (config.channel_config || {}) as Record<string, unknown>;
    const internal = await this.prisma.checkin_charge_templates.findMany({
      where: { establishment_id: establishmentId },
      select: { id: true, name: true, body: true },
      orderBy: { name: "asc" },
    });
    const result: Record<string, unknown> = { channel: config.channel, internal };
    if (config.channel === "whatsapp_cloud") {
      result.meta = await metaTemplates(String(channelConfig.waba_id || channelConfig.phone_id || ""), String(channelConfig.access_token || ""));
    }
    if (config.channel === "chatwoot") {
      Object.assign(result, await chatwootTemplates(channelConfig));
    }
    return { status: 200, body: result };
  }
}

async function metaTemplates(wabaId: string, token: string) {
  if (!wabaId || !token) return [];
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${wabaId}/message_templates?fields=name,language,status,components`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => ({}))) as { data?: Array<{ name: string; language?: string; status?: string }> };
    if (!response.ok) return [];
    return (data.data || []).map((item) => ({ name: item.name, language: item.language ?? "pt_BR", status: item.status }));
  } catch {
    return [];
  }
}

async function chatwootTemplates(config: Record<string, unknown>) {
  const baseUrl = String(config.base_url || "");
  const accountId = Number(config.account_id || 0);
  const inboxId = Number(config.inbox_id || 0);
  const apiKey = String(config.api_key || "");
  if (!baseUrl || !apiKey) {
    return { chatwoot: [], meta: [], chatwoot_inbox: { id: inboxId, is_whatsapp_cloud: false } };
  }
  const apiBase = baseUrl.replace(/\/$/, "");
  const headers = { api_access_token: apiKey, "Content-Type": "application/json" };
  const result: Record<string, unknown> = {};
  try {
    if (accountId && inboxId) {
      const inboxResponse = await fetch(`${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, { headers });
      const inboxData = (await inboxResponse.json().catch(() => ({}))) as { payload?: { id?: number; channel_type?: string; provider?: string }; id?: number; channel_type?: string; provider?: string };
      const inbox = inboxData.payload ?? inboxData;
      const provider = String(inbox.provider || "").toLowerCase();
      const channelType = String(inbox.channel_type || "");
      result.chatwoot_inbox = {
        id: Number(inbox.id ?? inboxId),
        channel_type: channelType || undefined,
        provider: provider || undefined,
        is_whatsapp_cloud: provider === "whatsapp_cloud" || (channelType === "Channel::Whatsapp" && (provider === "" || provider === "cloud")),
      };
    } else {
      result.chatwoot_inbox = { id: inboxId, is_whatsapp_cloud: false };
    }
    const response = await fetch(`${apiBase}/api/v1/accounts/${accountId}/canned_responses`, { headers });
    const data = (await response.json().catch(() => ({}))) as { payload?: Array<{ id: number; short_code?: string; content?: string }> };
    const list = data.payload ?? (Array.isArray(data) ? data : []);
    result.chatwoot = response.ok && Array.isArray(list) ? list.map((item) => ({ id: item.id, short_code: item.short_code ?? String(item.id), content: item.content ?? "" })) : [];
    const inbox = result.chatwoot_inbox as { is_whatsapp_cloud?: boolean };
    if (inbox.is_whatsapp_cloud && accountId) {
      const endpoints = [
        `${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}/whatsapp_templates`,
        `${apiBase}/api/v1/accounts/${accountId}/whatsapp_templates`,
        `${apiBase}/api/v1/accounts/${accountId}/inboxes/${inboxId}/message_templates`,
      ];
      let templates: Array<{ name: string; language: string; status?: string }> = [];
      for (const endpoint of endpoints) {
        const templateResponse = await fetch(endpoint, { headers });
        const templateData = (await templateResponse.json().catch(() => ({}))) as { payload?: unknown[]; data?: unknown[] };
        if (!templateResponse.ok) continue;
        const items = (templateData.payload ?? templateData.data ?? templateData) as Array<{ name?: string; language?: string; locale?: string; status?: string }>;
        if (!Array.isArray(items) || !items.length) continue;
        templates = items.filter((item) => item.name).map((item) => ({ name: String(item.name), language: String(item.language ?? item.locale ?? "pt_BR"), status: item.status }));
        if (templates.length) break;
      }
      result.meta = templates;
    }
  } catch {
    result.chatwoot = [];
    result.meta = result.meta ?? [];
    result.chatwoot_inbox = result.chatwoot_inbox ?? { id: inboxId, is_whatsapp_cloud: false };
  }
  return result;
}
