import { invokePmsFunction } from "@/lib/pmsApi";
import { toast } from "sonner";

export type BuklySyncPayload = {
  success?: boolean;
  error?: string;
  details?: string[];
  ratesMessages?: number;
  availMessages?: number;
  ratesPosts?: number;
  availPosts?: number;
  skippedUnmapped?: string[];
  syncHints?: {
    hotelCode?: string;
    establishmentId?: string;
    apiUrl?: string;
    requestorId?: string;
    mappingCount?: number;
  };
};

/**
 * Chama a Edge Function `bukly-sync` (OTA XML → https://pms.bukly.com).
 * Lança Error se a sincronização falhar.
 */
export async function invokeBuklySync(
  channelId: string,
  establishmentId: string,
  opts?: { silent?: boolean }
): Promise<BuklySyncPayload> {
  const { data, error } = await invokePmsFunction<BuklySyncPayload>("bukly-sync", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
    },
  });

  const payload = data;

  const errMsg =
    payload?.error || (error as { message?: string } | null)?.message || null;

  const detailsBlock =
    payload?.details?.length && payload.details.length > 0
      ? "\n\n" + payload.details.slice(0, 12).join("\n")
      : "";

  const fail = (base: string) => {
    throw new Error((errMsg || base) + detailsBlock);
  };

  if (payload?.success === false) {
    fail("Falha na sincronização Bukly");
  }
  if (error) {
    fail("Erro ao chamar sincronização Bukly");
  }
  if (!payload?.success) {
    fail("Resposta inválida do servidor ao sincronizar Bukly");
  }

  if (!opts?.silent) {
    const rates = payload?.ratesMessages ?? 0;
    const avail = payload?.availMessages ?? 0;
    const skipped = payload?.skippedUnmapped?.length ?? 0;
    toast.success(
      `Bukly sincronizado: ${rates} bloco(s) de tarifa, ${avail} de disponibilidade` +
        (skipped > 0 ? ` (${skipped} mapeamento(s) ignorado(s))` : "")
    );
  }

  return payload as BuklySyncPayload;
}
