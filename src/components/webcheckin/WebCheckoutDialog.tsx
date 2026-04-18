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
      // Buscar dados completos da reserva antes de atualizar para obter room_id
      const { data: currentReservation } = await supabase
        .from("reservations")
        .select("room_id, establishment_id")
        .eq("id", reservation.id)
        .single();

      // Atualizar status da reserva para checkedout
      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          status: "checkedout",
          checkout_time: new Date().toTimeString().substring(0, 5),
        })
        .eq("id", reservation.id);

      if (updateError) throw updateError;

      // Atualizar status do quarto para cleaning
      if (currentReservation?.room_id) {
        await supabase
          .from("rooms")
          .update({ status: "cleaning" })
          .eq("id", currentReservation.room_id);
      }

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
      // Invalidar query do mapa de ocupação para atualizar informações dos hóspedes (próximas entradas)
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      
      // Criar notificação de limpeza imediatamente após check-out
      if (currentReservation?.room_id && currentReservation?.establishment_id) {
        try {
          // Buscar dados completos da reserva para obter informações do hóspede e quarto
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

          if (fullReservation) {
            const guestName = fullReservation.guest?.full_name || 
                             fullReservation.financial_responsible?.full_name || 
                             "Hóspede";
            const roomNumber = fullReservation.rooms?.room_number || 
                              fullReservation.rooms?.name || 
                              "N/A";

            // Verificar se notificações de limpeza estão habilitadas
            const { data: hotelSettings } = await (supabase as any)
              .from("hotel_settings")
              .select("enable_cleaning_notifications")
              .eq("establishment_id", currentReservation.establishment_id)
              .single();

            const isCleaningNotificationsEnabled = hotelSettings?.enable_cleaning_notifications !== false;

            if (isCleaningNotificationsEnabled) {
              // Verificar se já existe notificação recente (últimas 2 horas) para evitar duplicatas
              const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
              const { data: recentNotifications } = await (supabase as any)
                .from("notifications")
                .select("id, metadata")
                .eq("establishment_id", currentReservation.establishment_id)
                .eq("type", "cleaning_required")
                .eq("metadata->>room_id", currentReservation.room_id)
                .gte("created_at", twoHoursAgo.toISOString())
                .limit(1);

              // Só criar notificação se não existir uma recente
              if (!recentNotifications || recentNotifications.length === 0) {
                await (supabase as any).rpc("create_notification_for_establishment", {
                  p_establishment_id: currentReservation.establishment_id,
                  p_type: "cleaning_required",
                  p_title: "Quarto Precisa de Limpeza",
                  p_message: `O quarto ${roomNumber} precisa de limpeza após check-out da reserva ${reservation.reservation_code || ""} (${guestName})`,
                  p_priority: "high",
                  p_metadata: {
                    room_id: currentReservation.room_id,
                    room_number: roomNumber,
                    reservation_id: reservation.id,
                    reservation_code: reservation.reservation_code || "",
                    guest_name: guestName,
                    checkout_date: reservation.checkout_date || format(new Date(), "yyyy-MM-dd"),
                    checkout_time: reservation.checkout_time || format(new Date(), "HH:mm"),
                    checkin_date: reservation.checkin_date,
                    checkout_via: "web_checkin",
                  },
                });

                console.log("[WebCheckoutDialog] Notificação de limpeza criada imediatamente após check-out");
                
                // Invalidar queries de notificações para atualizar a UI
                queryClient.invalidateQueries({ queryKey: ["notifications"] });
              }
            }

            // Criar notificação informando o check-out do hóspede
            await supabase.rpc("create_notification_for_establishment", {
              p_establishment_id: currentReservation.establishment_id,
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
          console.error("Erro ao criar notificações após check-out:", error);
          // Não bloquear o checkout se a notificação falhar
        }
      }
      
      // Disparar evento genérico de check-out concluído
      try {
        const { triggerEmail } = await import("@/lib/emailService");
        
        // Buscar dados completos da reserva atualizada
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
            // Verificar se a data de check-out já passou (incluindo hoje)
            const checkoutDate = fullReservation.checkout_date ? new Date(fullReservation.checkout_date) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (checkoutDate) {
              checkoutDate.setHours(0, 0, 0, 0);
              
              // Enviar se a data de check-out já passou ou é hoje
              if (checkoutDate <= today) {
                // Disparar evento genérico de check-out concluído
                await triggerEmail('checkout.completed', fullReservation);
              }
            }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao disparar evento de check-out concluído:", error);
        // Não bloquear o checkout se houver erro no envio de email
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
            // Verificar se a data de check-out já passou (incluindo hoje)
            const checkoutDate = fullReservation.checkout_date ? new Date(fullReservation.checkout_date) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (checkoutDate) {
              checkoutDate.setHours(0, 0, 0, 0);
              
              // Enviar se a data de check-out já passou ou é hoje
              if (checkoutDate <= today) {
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

