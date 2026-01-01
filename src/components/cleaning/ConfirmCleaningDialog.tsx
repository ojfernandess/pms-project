import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Info, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ConfirmCleaningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomNumber: string;
  reservationId?: string;
  reservationCode?: string;
  guestName?: string;
  checkinDate?: string;
  checkoutDate?: string;
  notificationId?: string; // ID da notificação para deletar/marcar como lida
  onSuccess?: () => void;
}

export function ConfirmCleaningDialog({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  reservationId,
  reservationCode,
  guestName,
  checkinDate,
  checkoutDate,
  notificationId,
  onSuccess,
}: ConfirmCleaningDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedEstablishment } = useEstablishment();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");

  // Verificar se o quarto já foi limpo quando o diálogo abre
  useEffect(() => {
    if (open && roomId && selectedEstablishment?.id) {
      const checkRoomStatus = async () => {
        const { data: room } = await supabase
          .from("rooms")
          .select("status")
          .eq("id", roomId)
          .single();

        // Se o quarto já está disponível (não é cleaning), deletar notificações de limpeza
        if (room && room.status !== "cleaning") {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Buscar todas as notificações de limpeza para este quarto
            const { data: cleaningNotifications } = await supabase
              .from("notifications")
              .select("id, metadata")
              .eq("user_id", user.id)
              .eq("type", "cleaning_required")
              .eq("establishment_id", selectedEstablishment.id);

            if (cleaningNotifications && cleaningNotifications.length > 0) {
              // Deletar notificações que são para este quarto
              const notificationsToDelete = cleaningNotifications.filter(
                (notif) => notif.metadata && (notif.metadata as any).room_id === roomId
              );

              for (const notif of notificationsToDelete) {
                await supabase
                  .from("notifications")
                  .delete()
                  .eq("id", notif.id);
              }

              // Invalidar queries
              queryClient.invalidateQueries({ queryKey: ["notifications"] });
            }
          }
          // Fechar diálogo se quarto já foi limpo
          onOpenChange(false);
          toast.info(`O quarto ${roomNumber} já foi limpo anteriormente.`);
        }
      };

      checkRoomStatus();
    }
  }, [open, roomId, selectedEstablishment?.id, roomNumber, onOpenChange, queryClient]);

  const handleViewReservationDetails = () => {
    if (!reservationCode || !selectedEstablishment) return;
    
    const establishmentId = selectedEstablishment.numeric_id || selectedEstablishment.id;
    navigate(`/${establishmentId}/reservas/${reservationCode}`);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);

    try {
      // SEMPRE marcar como "available" quando confirmar limpeza
      // O mapa de ocupação irá determinar automaticamente se precisa ficar como "dirty" 
      // baseado em próximas reservas
      const newStatus: "available" = "available";

      // Atualizar status do quarto para disponível
      const { error: roomError } = await supabase
        .from("rooms")
        .update({ 
          status: newStatus,
        })
        .eq("id", roomId);

      if (roomError) throw roomError;

      // Criar log de limpeza (opcional - pode ser armazenado em uma tabela de logs)
      if (notes.trim()) {
        // Aqui você pode criar um log de limpeza se tiver uma tabela para isso
        // Por enquanto, apenas logamos no console
        console.log("Notas de limpeza:", notes);
      }

      // Deletar notificações de limpeza para este quarto após confirmar
      if (selectedEstablishment?.id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Buscar todas as notificações de limpeza do usuário
          const { data: cleaningNotifications } = await supabase
            .from("notifications")
            .select("id, metadata")
            .eq("user_id", user.id)
            .eq("type", "cleaning_required")
            .eq("establishment_id", selectedEstablishment.id);

          if (cleaningNotifications && cleaningNotifications.length > 0) {
            // Deletar notificações que são para este quarto
            const notificationsToDelete = cleaningNotifications.filter(
              (notif) => notif.metadata && (notif.metadata as any).room_id === roomId
            );

            for (const notif of notificationsToDelete) {
              await supabase
                .from("notifications")
                .delete()
                .eq("id", notif.id);
            }
          }
        }
      }

      // Invalidar queries para atualizar o mapa e notificações
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      
      // Forçar refetch imediato do mapa de ocupação
      queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

      toast.success(`Limpeza do quarto ${roomNumber} confirmada! Status atualizado para disponível.`);
      onSuccess?.();
      onOpenChange(false);
      setNotes("");
    } catch (error: any) {
      console.error("Erro ao confirmar limpeza:", error);
      toast.error(error.message || "Erro ao confirmar limpeza");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Confirmar Limpeza do Quarto</DialogTitle>
          <DialogDescription>
            Confirme que a limpeza do quarto {roomNumber} foi realizada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações da Reserva */}
          {(reservationCode || guestName || checkinDate || checkoutDate) && (
            <Card className="p-4 bg-slate-50 border-slate-200">
              <div className="space-y-3">
                {reservationCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Reserva:</span>
                    <span className="text-sm font-semibold text-slate-900">{reservationCode}</span>
                  </div>
                )}
                
                {guestName && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Hóspede:</span>
                    <span className="text-sm text-slate-900">{guestName}</span>
                  </div>
                )}
                
                {checkinDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-600">Check-in: </span>
                      <span className="text-sm text-slate-900">
                        {checkinDate ? format(parseISO(checkinDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "N/A"}
                      </span>
                    </div>
                  </div>
                )}
                
                {checkoutDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-600">Check-out: </span>
                      <span className="text-sm text-slate-900">
                        {checkoutDate ? format(parseISO(checkoutDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "N/A"}
                      </span>
                    </div>
                  </div>
                )}
                
                {reservationCode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={handleViewReservationDetails}
                  >
                    <Info className="h-4 w-4 mr-2" />
                    Ver Detalhes da Reserva
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Opções de Limpeza */}
          <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                O quarto será marcado automaticamente como <strong>disponível</strong> após a confirmação.
              </p>
              <p className="text-xs text-blue-700 mt-1">
                O mapa de ocupação atualizará automaticamente o status baseado em próximas reservas.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Adicione observações sobre a limpeza..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Limpeza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

