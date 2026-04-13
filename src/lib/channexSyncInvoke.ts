import { supabase } from "@/integrations/supabase/client";
import { postPmsApiAuth } from "@/lib/pmsApi";

export type ChannexSyncPayload = {
  success?: boolean;
  error?: string;
  hint?: string;
  message?: string;
  availabilityTasks?: string[];
  restrictionTasks?: string[];
};

export function validateChannexChannelForSync(channel: {
  channel_manager_type?: string | null;
  channex_api_key?: string | null;
  channex_property_id?: string | null;
} | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!channel || channel.channel_manager_type !== "channex") {
    return { ok: false, message: "Canal Channex não encontrado." };
  }
  const missing: string[] = [];
  if (!String(channel.channex_api_key ?? "").trim()) missing.push("API key");
  if (!String(channel.channex_property_id ?? "").trim()) missing.push("Property ID");
  if (missing.length) {
    return {
      ok: false,
      message: `Preencha no canal: ${missing.join(", ")}.`,
    };
  }
  return { ok: true };
}

export async function invokeChannexSync(
  channelId: string,
  establishmentId: string
): Promise<ChannexSyncPayload> {
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) throw new Error("Sessão inválida");
  let error: { message?: string } | null = null;
  let data: unknown = null;
  try {
    data = await postPmsApiAuth(
      "/api/integrations/channex-sync",
      {
        channel_id: channelId,
        establishment_id: establishmentId,
      },
      jwt,
    );
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  let payload = data as ChannexSyncPayload | null;
  const errMsg = payload?.error || error?.message || null;
  const hint = payload?.hint;
  const combined = [errMsg, hint].filter(Boolean).join(" — ");
  if (payload?.success === false) throw new Error(combined || "Falha na sincronização Channex");
  if (error) throw new Error(combined || "Erro ao sincronizar Channex");
  if (!payload) throw new Error("Resposta inválida da sincronização Channex");
  return payload;
}
