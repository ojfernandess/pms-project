import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Ban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logActivity, createBlockDescription } from "@/lib/activityLogger";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";

interface BlockRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialData: {
    category_id: string;
    room_id?: string;
    checkin_date: string;
    checkout_date: string;
  };
}

export const BlockRoomDialog = ({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: BlockRoomDialogProps) => {
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = String(dateStr).split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };

  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  // Buscar categoria e quarto
  const { data: category } = useQuery({
    queryKey: ["room_category", initialData.category_id],
    queryFn: async () => {
      if (!initialData.category_id) return null;
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("id", initialData.category_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!initialData.category_id && open,
  });

  const { data: room } = useQuery({
    queryKey: ["room", initialData.room_id],
    queryFn: async () => {
      if (!initialData.room_id) return null;
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", initialData.room_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!initialData.room_id && open,
  });

  // Resetar formulário quando abrir
  useEffect(() => {
    if (open) {
      setBlockReason("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar motivo do bloqueio
      if (!blockReason.trim()) {
        toast.error("Informe o motivo do bloqueio");
        setLoading(false);
        return;
      }

      if (!initialData.checkin_date || !initialData.checkout_date) {
        toast.error("Selecione as datas de bloqueio");
        setLoading(false);
        return;
      }

      if (parseLocalDate(initialData.checkout_date) <= parseLocalDate(initialData.checkin_date)) {
        toast.error("Data final deve ser posterior à data inicial");
        setLoading(false);
        return;
      }

      // Validar disponibilidade ANTES de bloquear
      if (initialData.room_id) {
        // Validar disponibilidade do quarto específico
        const { validateRoomAvailability } = await import("@/lib/reservationUtils");
        const availabilityCheck = await validateRoomAvailability(
          initialData.room_id,
          initialData.checkin_date,
          initialData.checkout_date
        );

        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível para bloqueio neste período");
          setLoading(false);
          return;
        }
      } else {
        // Validar disponibilidade por categoria (sem quarto específico)
        const { validateCategoryAvailability } = await import("@/lib/reservationUtils");
        const categoryAvailability = await validateCategoryAvailability(
          initialData.category_id,
          initialData.checkin_date,
          initialData.checkout_date
        );

        if (!categoryAvailability.available) {
          toast.error(categoryAvailability.reason || "Nenhum quarto disponível para bloqueio neste período");
          setLoading(false);
          return;
        }
      }

      // Obter usuário atual para created_by e establishment_id
      const { data: { user } } = await supabase.auth.getUser();
      const establishmentId = localStorage.getItem("selectedEstablishmentId");

      // Criar reserva com status "blocked" sem necessidade de cliente
      // client_id pode ser NULL para reservas bloqueadas
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .insert([{
          client_id: null, // NULL permitido para reservas bloqueadas
          category_id: initialData.category_id,
          room_id: initialData.room_id || null,
          checkin_date: initialData.checkin_date,
          checkout_date: initialData.checkout_date,
          adults: 0,
          children: 0,
          channel: "direct",
          notes: `Bloqueio: ${blockReason}`,
          total_amount: 0,
          status: "blocked",
          payment_status: "pending",
          paid_amount: 0,
          establishment_id: establishmentId || undefined,
          created_by: user?.id || null,
        }])
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .single();

      if (reservationError) {
        toast.error(reservationError.message || "Erro ao bloquear quarto");
        setLoading(false);
        return;
      }

      // Registrar log de atividade
      try {
        const roomName = roomDisplayName || category?.name || "N/A";
        await logActivity({
          actionType: "blocked",
          entityType: "block",
          entityId: reservation.id,
          entityCode: null, // Bloqueios não têm código de reserva
          description: createBlockDescription(
            roomName,
            formatDate(initialData.checkin_date),
            formatDate(initialData.checkout_date),
            blockReason
          ),
          newValues: {
            room_id: initialData.room_id,
            room_name: roomName,
            category_id: initialData.category_id,
            category_name: category?.name,
            checkin_date: initialData.checkin_date,
            checkout_date: initialData.checkout_date,
            reason: blockReason,
            status: "blocked",
          },
          metadata: {
            reservation_id: reservation.id,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de bloqueio:", logError);
        // Não interromper o fluxo principal
      }

      // Invalidar queries para atualizar a UI
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });

      const estId = String((reservation as { establishment_id?: string }).establishment_id ?? "").trim();
      scheduleChannelSyncAfterInventoryChange(estId || null);

      toast.success("Quarto bloqueado com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao bloquear quarto");
    } finally {
      setLoading(false);
    }
  };

  // Formatar datas para exibição
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      const date = parseLocalDate(dateString);
      return format(date, "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  // Obter nome do quarto (name ou room_number)
  const roomDisplayName = room ? (room.name || `Quarto ${room.room_number}`) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-slate-900">
            Bloquear Reserva
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Categoria - Read-only */}
          <div>
            <Label htmlFor="category" className="text-sm font-medium text-slate-700">
              Categoria
            </Label>
            <Input
              id="category"
              value={category?.name || ""}
              readOnly
              disabled
              className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
            />
          </div>

          {/* Unidade - Read-only */}
          {room && (
            <div>
              <Label htmlFor="unit" className="text-sm font-medium text-slate-700">
                Unidade
              </Label>
              <Input
                id="unit"
                value={roomDisplayName}
                readOnly
                disabled
                className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
              />
            </div>
          )}

          {/* Datas - Read-only */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="checkin_date" className="text-sm font-medium text-slate-700">
                Data Inicial
              </Label>
              <Input
                id="checkin_date"
                value={formatDate(initialData.checkin_date)}
                readOnly
                disabled
                className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <Label htmlFor="checkout_date" className="text-sm font-medium text-slate-700">
                Data Final
              </Label>
              <Input
                id="checkout_date"
                value={formatDate(initialData.checkout_date)}
                readOnly
                disabled
                className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
              />
            </div>
          </div>

          {/* Motivo do Bloqueio - Editável */}
          <div>
            <Label htmlFor="block_reason" className="text-sm font-medium text-slate-700">
              Motivo do Bloqueio
            </Label>
            <Textarea
              id="block_reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Digite o motivo do bloqueio..."
              rows={4}
              className="mt-1 resize-y"
              required
              disabled={loading}
            />
          </div>

          {/* Botões */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !blockReason.trim()}
              className="bg-slate-500 hover:bg-slate-600 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bloqueando...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Bloquear
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
