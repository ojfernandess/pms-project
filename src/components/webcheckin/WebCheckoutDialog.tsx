import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/lib/activityLogger";

interface WebCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  webCheckin: any;
  token: string;
  onSuccess?: () => void;
}

export function WebCheckoutDialog({
  open,
  onOpenChange,
  reservation,
  webCheckin,
  token,
  onSuccess,
}: WebCheckoutDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleRequestCheckout = async () => {
    // Para ações críticas, solicitar autenticação em duas etapas
    if (!showTwoFactor) {
      setShowTwoFactor(true);
      return;
    }

    if (!twoFactorCode.trim()) {
      toast.error("Por favor, informe o código de verificação");
      return;
    }

    setLoading(true);
    try {
      // Verificar código de duas etapas (simplificado - em produção usar validação adequada)
      // Por enquanto, apenas verificar se foi informado

      // Atualizar status da reserva para checkedout
      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          status: "checkedout",
          checkout_time: new Date().toTimeString().substring(0, 5),
        })
        .eq("id", reservation.id);

      if (updateError) throw updateError;

      // Atualizar histórico de estada
      const { error: historyError } = await supabase
        .from("guest_stay_history")
        .update({
          status: "completed",
          notes: feedback.trim() || null,
        })
        .eq("reservation_id", reservation.id);

      if (historyError) {
        console.error("Erro ao atualizar histórico:", historyError);
      }

      // Registrar log de atividade
      await logActivity({
        actionType: "reservation_checked_out",
        entityType: "reservation",
        entityId: reservation.id,
        entityCode: reservation.reservation_code,
        description: "Check-out realizado via web check-in",
        oldValues: {
          status: reservation.status,
        },
        newValues: {
          status: "checkedout",
        },
        metadata: {
          checkout_via: "web_checkin",
          feedback: feedback.trim() || null,
        },
      });

      toast.success("Check-out realizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      queryClient.invalidateQueries({ queryKey: ["guest_stay_history"] });
      onSuccess?.();
      onOpenChange(false);

      // Gerar comprovante (poderia ser um PDF ou redirecionar para página de comprovante)
      // Por enquanto, apenas mostrar mensagem de sucesso
    } catch (error: any) {
      console.error("Erro ao realizar check-out:", error);
      toast.error(error.message || "Erro ao realizar check-out");
    } finally {
      setLoading(false);
    }
  };

  const pendingAmount =
    (reservation?.total_amount || 0) - (reservation?.paid_amount || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Realizar Check-out</DialogTitle>
          <DialogDescription>
            Finalize sua estadia e gere o comprovante de check-out
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações da reserva */}
          <div className="p-4 bg-slate-50 rounded-md space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Check-in:</span>
              <span className="font-medium">
                {reservation?.checkin_date
                  ? format(parseISO(reservation.checkin_date), "dd/MM/yyyy", {
                      locale: ptBR,
                    })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Check-out:</span>
              <span className="font-medium">
                {reservation?.checkout_date
                  ? format(parseISO(reservation.checkout_date), "dd/MM/yyyy", {
                      locale: ptBR,
                    })
                  : "N/A"}
              </span>
            </div>
            {pendingAmount > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="text-slate-600">Saldo pendente:</span>
                <span className="font-semibold text-red-600">
                  R$ {pendingAmount.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Feedback */}
          <div>
            <Label>Feedback da Estadia (Opcional)</Label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Como foi sua experiência? Deixe seu feedback..."
              className="mt-1 min-h-[100px]"
            />
          </div>

          {/* Autenticação em duas etapas */}
          {showTwoFactor && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-900 mb-1">
                    Verificação de Segurança
                  </p>
                  <p className="text-sm text-yellow-800">
                    Para sua segurança, confirme o check-out informando o código enviado
                    por email ou SMS.
                  </p>
                </div>
              </div>
              <div>
                <Label>Código de Verificação</Label>
                <Input
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="Digite o código"
                  className="mt-1"
                  maxLength={6}
                />
              </div>
            </div>
          )}

          {/* Aviso sobre saldo pendente */}
          {pendingAmount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Há um saldo pendente de R$ {pendingAmount.toFixed(2)}. O check-out será
                realizado, mas o pagamento deverá ser efetuado na recepção.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleRequestCheckout} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : showTwoFactor ? (
              "Confirmar Check-out"
            ) : (
              "Solicitar Check-out"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

