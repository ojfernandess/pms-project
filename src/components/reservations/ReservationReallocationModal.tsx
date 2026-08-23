import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { Loader2, Building2, ArrowRightLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logActivity } from "@/lib/activityLogger";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";
import { useQueryClient } from "@tanstack/react-query";

interface ReservationReallocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  onSuccess?: () => void;
}

export function ReservationReallocationModal({
  open,
  onOpenChange,
  reservation,
  onSuccess,
}: ReservationReallocationModalProps) {
  const queryClient = useQueryClient();
  const { establishments, selectedEstablishment } = useEstablishment();
  const [targetEstablishmentId, setTargetEstablishmentId] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [financePreview, setFinancePreview] = useState<{
    payments: number;
    receivables: number;
  } | null>(null);

  const sourceEstablishmentId = reservation?.establishment_id || selectedEstablishment?.id;

  const availableEstablishments = useMemo(() => {
    if (!sourceEstablishmentId) return [];
    const source = establishments.find((e) => e.id === sourceEstablishmentId);
    const companyId = source?.company_id;
    return establishments.filter(
      (e) =>
        e.id !== sourceEstablishmentId &&
        e.is_active !== false &&
        (!companyId || e.company_id === companyId)
    );
  }, [establishments, sourceEstablishmentId]);

  useEffect(() => {
    if (!open || !reservation) return;
    setTargetEstablishmentId("");
    setCategories([]);
    setRooms([]);
    setSelectedCategoryId("");
    setSelectedRoomId("");
    setNotes("");
    setFinancePreview(null);

    const loadFinancePreview = async () => {
      const [{ count: paymentsCount }, { count: arCount }] = await Promise.all([
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("reservation_id", reservation.id),
        supabase
          .from("accounts_receivable")
          .select("id", { count: "exact", head: true })
          .eq("reservation_id", reservation.id),
      ]);
      setFinancePreview({
        payments: paymentsCount || 0,
        receivables: arCount || 0,
      });
    };

    loadFinancePreview().catch(() => {
      setFinancePreview({ payments: 0, receivables: 0 });
    });
  }, [open, reservation]);

  useEffect(() => {
    if (!open || !targetEstablishmentId) {
      setCategories([]);
      setRooms([]);
      setSelectedCategoryId("");
      setSelectedRoomId("");
      return;
    }

    const loadCategories = async () => {
      setIsLoadingRooms(true);
      try {
        const { data, error } = await supabase
          .from("room_categories")
          .select("id, name")
          .eq("establishment_id", targetEstablishmentId)
          .order("name");
        if (error) throw error;
        setCategories(data || []);
        setSelectedCategoryId("");
        setSelectedRoomId("");
        setRooms([]);
      } catch (error: any) {
        toast.error(error.message || "Erro ao carregar categorias do destino");
      } finally {
        setIsLoadingRooms(false);
      }
    };

    loadCategories();
  }, [open, targetEstablishmentId]);

  useEffect(() => {
    if (!open || !targetEstablishmentId || !selectedCategoryId) {
      setRooms([]);
      setSelectedRoomId("");
      return;
    }

    const loadRooms = async () => {
      setIsLoadingRooms(true);
      try {
        const { data: roomsData, error } = await supabase
          .from("rooms")
          .select("id, room_number, name, status, is_blocked")
          .eq("establishment_id", targetEstablishmentId)
          .eq("category_id", selectedCategoryId)
          .order("room_number");
        if (error) throw error;

        const checkin = reservation.checkin_date;
        const checkout = reservation.checkout_date;

        let busyRoomIds = new Set<string>();
        if (checkin && checkout) {
          const { data: conflicts } = await supabase
            .from("reservations")
            .select("room_id")
            .neq("id", reservation.id)
            .neq("status", "cancelled")
            .not("room_id", "is", null)
            .lt("checkin_date", checkout)
            .gt("checkout_date", checkin);

          busyRoomIds = new Set(
            (conflicts || [])
              .map((c: any) => c.room_id)
              .filter(Boolean)
          );
        }

        const available = (roomsData || []).filter((room: any) => {
          if (room.is_blocked === true) return false;
          if (room.status === "maintenance") return false;
          if (busyRoomIds.has(room.id)) return false;
          return true;
        });

        setRooms(available);
        setSelectedRoomId("");
      } catch (error: any) {
        toast.error(error.message || "Erro ao carregar quartos do destino");
      } finally {
        setIsLoadingRooms(false);
      }
    };

    loadRooms();
  }, [open, targetEstablishmentId, selectedCategoryId, reservation]);

  const handleSubmit = async () => {
    if (!reservation?.id) return;
    if (!targetEstablishmentId) {
      toast.error("Selecione o estabelecimento de destino");
      return;
    }
    if (!selectedCategoryId) {
      toast.error("Selecione a categoria de destino");
      return;
    }
    if (!selectedRoomId) {
      toast.error("Selecione o quarto de destino");
      return;
    }

    setIsLoading(true);
    try {
      const noteLine = `Realocada em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}${
        notes.trim() ? `: ${notes.trim()}` : ""
      }`;

      const { data, error } = await supabase.rpc("reallocate_reservation", {
        p_reservation_id: reservation.id,
        p_target_establishment_id: targetEstablishmentId,
        p_target_room_id: selectedRoomId,
        p_target_category_id: selectedCategoryId,
        p_notes: noteLine,
      });

      if (error) throw error;

      const sourceName =
        establishments.find((e) => e.id === sourceEstablishmentId)?.name || "origem";
      const targetName =
        establishments.find((e) => e.id === targetEstablishmentId)?.name || "destino";
      const roomLabel =
        rooms.find((r) => r.id === selectedRoomId)?.name ||
        rooms.find((r) => r.id === selectedRoomId)?.room_number ||
        selectedRoomId;

      try {
        await logActivity({
          actionType: "moved",
          entityType: "reservation",
          entityId: reservation.id,
          entityCode: reservation.reservation_code || null,
          description: `Reserva realocada de ${sourceName} para ${targetName} (quarto ${roomLabel})`,
          oldValues: {
            establishment_id: sourceEstablishmentId,
            room_id: reservation.room_id,
            category_id: reservation.category_id,
          },
          newValues: {
            establishment_id: targetEstablishmentId,
            room_id: selectedRoomId,
            category_id: selectedCategoryId,
          },
          metadata: {
            reallocation: true,
            rpc_result: data,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de realocação:", logError);
      }

      scheduleChannelSyncAfterInventoryChange(sourceEstablishmentId || null);
      scheduleChannelSyncAfterInventoryChange(targetEstablishmentId);

      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });

      toast.success(
        `Reserva realocada para ${targetName}. Financeiro atualizado (${financePreview?.payments || 0} pagamento(s), ${financePreview?.receivables || 0} conta(s) a receber).`
      );

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Erro na realocação:", error);
      toast.error(error.message || "Erro ao realocar reserva");
    } finally {
      setIsLoading(false);
    }
  };

  if (!reservation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Realocar Reserva
          </DialogTitle>
          <DialogDescription>
            Remaneja a reserva para outro estabelecimento da empresa e atualiza o financeiro
            (Contas a Receber, Pagamentos e Fechamento).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-1">
            <div className="font-medium text-slate-900">
              {reservation.guest_name || reservation.reservation_code || "Reserva"}
            </div>
            <div className="text-slate-600">
              {reservation.checkin_date && reservation.checkout_date
                ? `${format(parseISO(reservation.checkin_date), "dd MMM yyyy", { locale: ptBR })} → ${format(
                    parseISO(reservation.checkout_date),
                    "dd MMM yyyy",
                    { locale: ptBR }
                  )}`
                : "Período não informado"}
            </div>
            {financePreview && (
              <div className="text-xs text-slate-500 pt-1">
                Serão movidos: {financePreview.payments} pagamento(s) e {financePreview.receivables}{" "}
                lançamento(s) em Contas a Receber
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Estabelecimento de destino</Label>
            <Select value={targetEstablishmentId} onValueChange={setTargetEstablishmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o estabelecimento" />
              </SelectTrigger>
              <SelectContent>
                {availableEstablishments.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Nenhum outro estabelecimento disponível
                  </SelectItem>
                ) : (
                  availableEstablishments.map((est) => (
                    <SelectItem key={est.id} value={est.id}>
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {est.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoria no destino</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
              disabled={!targetEstablishmentId || isLoadingRooms}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quarto disponível no destino</Label>
            <Select
              value={selectedRoomId}
              onValueChange={setSelectedRoomId}
              disabled={!selectedCategoryId || isLoadingRooms}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoadingRooms
                      ? "Carregando..."
                      : rooms.length === 0
                      ? "Nenhum quarto disponível no período"
                      : "Selecione o quarto"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name || room.room_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reallocation-notes">Observações (opcional)</Label>
            <Textarea
              id="reallocation-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo da realocação..."
              rows={3}
            />
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Após confirmar, a reserva e os registros financeiros vinculados deixam de aparecer no
            estabelecimento atual e passam a constar no destino (Contas a Receber, Últimos Pagamentos
            e Relatório de Fechamento).
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !targetEstablishmentId || !selectedRoomId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Realocando...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Confirmar Realocação
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
