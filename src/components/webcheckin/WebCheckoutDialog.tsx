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
  const [feedback, setFeedback] = useState("");

  const handleRequestCheckout = async () => {
    setLoading(true);
    try {
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
      
      // Criar notificação no sistema informando o check-out do hóspede
      try {
        // Buscar dados completos da reserva para obter nome do hóspede
        const { data: fullReservation } = await supabase
          .from("reservations")
          .select(`
            *,
            financial_responsible:clients!client_id(full_name, email),
            guest:clients!guest_id(full_name, email),
            rooms(room_number, name),
            establishment:establishments(name)
          `)
          .eq("id", reservation.id)
          .single();

        if (fullReservation && fullReservation.establishment_id) {
          const guestName = fullReservation.guest?.full_name || 
                           fullReservation.financial_responsible?.full_name || 
                           "Hóspede";
          const roomNumber = fullReservation.rooms?.room_number || 
                            fullReservation.rooms?.name || 
                            "N/A";
          const establishmentName = fullReservation.establishment?.name || 
                                   "Estabelecimento";

          await supabase.rpc("create_notification_for_establishment", {
            p_establishment_id: fullReservation.establishment_id,
            p_type: "checkout_today",
            p_title: "Check-out Realizado",
            p_message: `${guestName} realizou check-out da reserva ${reservation.reservation_code || ''} (Quarto: ${roomNumber})`,
            p_priority: "medium",
            p_metadata: {
              reservation_id: reservation.id,
              reservation_code: reservation.reservation_code,
              guest_name: guestName,
              room_number: roomNumber,
              checkout_via: "web_checkin",
            },
          });
        }
      } catch (error) {
        console.error("Erro ao criar notificação de check-out:", error);
        // Não bloquear o checkout se a notificação falhar
      }
      
      // Verificar se deve enviar email de solicitação de avaliação
      try {
        // Verificar feature flag para o estabelecimento
        const { data: siteSettings } = await supabase
          .from("site_settings")
          .select("features_enabled")
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();
        
        const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");
        const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
          siteSettings?.features_enabled?.stay_reviews,
          reservation.establishment_id
        );
        
        if (isStayReviewsEnabled) {
          const { sendStayReviewRequestEmail } = await import("@/lib/emailService");
          
          // Buscar dados completos da reserva
          const { data: fullReservation } = await supabase
            .from("reservations")
            .select(`
              *,
              financial_responsible:clients!client_id(*),
              guest:clients!guest_id(*),
              rooms (*),
              room_categories (*)
            `)
            .eq("id", reservation.id)
            .single();
          
          if (fullReservation) {
            // Buscar configurações de avaliação do estabelecimento
            const { data: reviewSettings } = await supabase
              .from("establishment_review_settings")
              .select("is_enabled, send_email_after_checkout, email_delay_hours")
              .eq("establishment_id", fullReservation.establishment_id)
              .maybeSingle();
            
            if (reviewSettings?.is_enabled && reviewSettings?.send_email_after_checkout) {
            // Gerar link de avaliação
            const baseUrl = typeof window !== 'undefined' 
              ? window.location.origin 
              : (import.meta.env.VITE_APP_URL || 'http://localhost:8080');
            
            // Usar reservation_code ou identification_number para o link
            const locator = fullReservation.identification_number || fullReservation.reservation_code;
            const reviewLink = `${baseUrl}/review/${locator}`;
            
            await sendStayReviewRequestEmail(fullReservation, reviewLink);
            }
          }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao enviar email de solicitação de avaliação:", error);
        // Não bloquear o checkout se houver erro no envio de email
      }
      
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
            ) : (
              "Confirmar Check-out"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

