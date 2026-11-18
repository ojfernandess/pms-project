import { invokePmsFunction } from "@/lib/pmsApi";
import { toast } from "sonner";

export type BuklyReservationsPayload = {
  success?: boolean;
  error?: string;
  imported?: number;
  booked?: number;
  updated?: number;
  cancelled?: number;
  reservations_seen?: number;
  confirmed_messages?: number;
  errors?: string[];
  message?: string;
};

/** Pull OTA_ReadRQ (Undelivered) + confirmação OTA_NotifReportRQ. */
export async function invokeBuklyReservations(
  channelId: string,
  establishmentId: string,
  opts?: { silent?: boolean },
): Promise<BuklyReservationsPayload> {
  const { data, error } = await invokePmsFunction<BuklyReservationsPayload>("bukly-reservations", {
    body: {
      channel_id: channelId,
      establishment_id: establishmentId,
    },
  });

  const payload = data;
  const errMsg = payload?.error || (error as { message?: string } | null)?.message;

  if (payload?.success === false) {
    const detail = payload.errors?.length ? `\n${payload.errors.slice(0, 8).join("\n")}` : "";
    throw new Error((errMsg || "Falha ao importar reservas Bukly") + detail);
  }
  if (error) throw new Error(errMsg || "Erro ao chamar importação Bukly");

  if (!opts?.silent) {
    const seen = payload?.reservations_seen ?? 0;
    const imported = payload?.imported ?? 0;
    if (seen === 0) {
      toast.info(payload?.message || "Nenhuma reserva pendente no Bukly");
    } else {
      toast.success(
        `Bukly: ${seen} mensagem(ns), ${imported} linha(s) processada(s)` +
          (payload?.updated ? ` · ${payload.updated} alterada(s)` : "") +
          (payload?.cancelled ? ` · ${payload.cancelled} cancelada(s)` : ""),
      );
    }
    if (payload?.errors?.length) {
      toast.warning("Bukly: alguns itens falharam", {
        description: payload.errors.slice(0, 5).join(" · "),
        duration: 12_000,
      });
    }
  }

  return payload ?? { success: true };
}