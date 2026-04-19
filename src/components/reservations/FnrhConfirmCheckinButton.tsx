import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFnrhSettings } from "@/hooks/useFnrhSettings";
import { shouldShowFnrhGuestFields } from "@/lib/fnrh/fnrhCategoryScope";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/** Corpo JSON da Edge Function (ex.: { error: "..." }) quando HTTP ≠ 2xx */
async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const j = (await ctx.json()) as { error?: string; message?: string };
        if (typeof j?.error === "string" && j.error.trim()) return j.error;
        if (typeof j?.message === "string" && j.message.trim()) return j.message;
      } catch {
        /* ignore */
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Falha ao chamar FNRH";
}

type Props = {
  reservationId: string | undefined;
  /** Localizador — refetch da reserva após FNRH (atualiza fnrh_registered_at e rótulo Ver check-in) */
  reservationCode?: string;
  establishmentId: string | undefined;
  /** Categoria da reserva — usado com escopo FNRH por categoria nas configurações */
  categoryId?: string | null;
  /** Web check-in concluído (pré-check-in) — habilita confirmação presencial na FNRH */
  webCheckinCompleted: boolean;
  /** Preenchido após envio bem-sucedido à FNRH (evita botão redundante após auto-submit manual) */
  fnrhRegisteredAt?: string | null;
  disabled?: boolean;
  className?: string;
};

/**
 * Confirma o check-in presencial na API FNRH (CHECKIN_REALIZADO).
 * O web check-in no app é apenas pré-check-in; o envio à Polícia Federal ocorre aqui na recepção.
 */
export function FnrhConfirmCheckinButton({
  reservationId,
  reservationCode,
  establishmentId,
  categoryId,
  webCheckinCompleted,
  fnrhRegisteredAt,
  disabled,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const { data: fnrhSettings } = useFnrhSettings(establishmentId);

  const { data: fnrhSuccess } = useQuery({
    queryKey: ["fnrh_submission_success", reservationId],
    enabled: !!reservationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fnrh_submission_log")
        .select("id, status")
        .eq("reservation_id", reservationId!)
        .eq("operation", "hospedagem_registrar")
        .eq("status", "success")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const enabledFnrh = !!fnrhSettings?.enabled;
  const alreadySent = !!fnrhSuccess;
  const alreadyRegisteredOnCheckin = !!fnrhRegisteredAt?.trim();
  const categoryOk = shouldShowFnrhGuestFields(fnrhSettings, categoryId);
  const visible =
    enabledFnrh &&
    webCheckinCompleted &&
    !alreadySent &&
    !alreadyRegisteredOnCheckin &&
    !!reservationId &&
    categoryOk;

  const handleClick = async () => {
    if (!reservationId) return;
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const access = sess?.session?.access_token;
      if (!access) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("fnrh-submit", {
        body: {
          reservation_id: reservationId,
          source: "staff",
          commit_checkin: true,
          confirm_explicit: true,
        },
        headers: { Authorization: `Bearer ${access}` },
      });
      if (error) {
        toast.error(await edgeFunctionErrorMessage(error));
        return;
      }
      const payload = data as {
        success?: boolean;
        skipped?: boolean;
        error?: string;
        reason?: string;
      };
      if (payload?.skipped) {
        toast.message(
          payload.reason === "already_synced"
            ? "Check-in já registrado na FNRH para esta reserva."
            : (payload.error || "Envio ignorado pelas configurações."),
        );
        queryClient.invalidateQueries({
          queryKey: ["fnrh_submission_success", reservationId],
        });
        queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
        queryClient.invalidateQueries({ queryKey: ["reservation"] });
        if (reservationCode) {
          void queryClient.refetchQueries({ queryKey: ["reservation", reservationCode] });
        } else {
          void queryClient.refetchQueries({ queryKey: ["reservation"] });
        }
        return;
      }
      if (payload?.success === false && payload?.error) {
        toast.error(payload.error);
        return;
      }
      toast.success("Check-in confirmado na FNRH.");
      queryClient.invalidateQueries({
        queryKey: ["fnrh_submission_success", reservationId],
      });
      queryClient.invalidateQueries({ queryKey: ["fnrh_settings", establishmentId] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      queryClient.invalidateQueries({ queryKey: ["reservation"] });
      if (reservationCode) {
        void queryClient.refetchQueries({ queryKey: ["reservation", reservationCode] });
      } else {
        void queryClient.refetchQueries({ queryKey: ["reservation"] });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao confirmar na FNRH";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className={cn(
        "h-9 gap-2 rounded-xl border border-slate-800/20 bg-gradient-to-b from-slate-800 to-slate-900 px-3.5 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition-all hover:from-slate-700 hover:to-slate-800 hover:shadow-lg",
        className,
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      title="Registra o check-in presencial na Ficha Nacional (FNRH), após o pré-check-in online."
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ShieldCheck className="h-4 w-4" />
      )}
      Confirmar check-in na FNRH
    </Button>
  );
}
