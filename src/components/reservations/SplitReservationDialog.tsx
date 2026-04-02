import { useState, useEffect, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO, eachDayOfInterval, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { format as formatDate } from "date-fns";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/reservationUtils";
import { logActivity } from "@/lib/activityLogger";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";

interface SplitReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overbooking: {
    reservation: any;
    conflictingReservations: any[];
    conflictDates: string[];
    availableRooms: any[];
    categoryRooms: any[];
  };
  onSuccess?: () => void;
}

interface DayAllocation {
  date: string;
  roomId: string;
  roomName: string;
  amount: number;
}

export const SplitReservationDialog = ({
  open,
  onOpenChange,
  overbooking,
  onSuccess,
}: SplitReservationDialogProps) => {
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [dayAllocations, setDayAllocations] = useState<DayAllocation[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [otherCategories, setOtherCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [otherCategoryRooms, setOtherCategoryRooms] = useState<any[]>([]);

  const reservation = overbooking.reservation;

  // Calcular dias da reserva
  const reservationDays = useMemo(() => {
    if (!reservation?.checkin_date || !reservation?.checkout_date) return [];
    
    const checkin = parseISO(reservation.checkin_date);
    const checkout = parseISO(reservation.checkout_date);
    
    return eachDayOfInterval({
      start: checkin,
      end: checkout,
    }).map((date) => format(date, "yyyy-MM-dd"));
  }, [reservation]);

  // Buscar outras categorias quando necessário
  useEffect(() => {
    const fetchOtherCategories = async () => {
      if (!reservation?.establishment_id) return;

      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", reservation.establishment_id)
        .order("name");

      if (error) {
        console.error("Erro ao buscar categorias:", error);
        return;
      }

      setOtherCategories(data || []);
    };

    if (open) {
      fetchOtherCategories();
      // Inicializar com quartos disponíveis da categoria atual
      const initialRooms = overbooking.availableRooms.slice(0, Math.ceil(reservationDays.length / 2));
      setSelectedRooms(initialRooms.map((r: any) => r.id));
      setSelectedCategory(reservation.category_id || "");
      setTotalAmount(reservation.total_amount || 0);
    }
  }, [open, reservation, overbooking, reservationDays]);

  // Atualizar alocações quando quartos ou categoria mudarem
  useEffect(() => {
    if (selectedRooms.length === 0 || reservationDays.length === 0) {
      setDayAllocations([]);
      return;
    }

    // Buscar informações dos quartos selecionados
    const updateAllocations = async () => {
      const roomsToUse = selectedCategory === reservation.category_id
        ? overbooking.availableRooms.filter((r: any) => selectedRooms.includes(r.id))
        : [];

      if (selectedCategory !== reservation.category_id && selectedCategory) {
        // Buscar quartos da outra categoria
        const { data } = await supabase
          .from("rooms")
          .select("*")
          .eq("category_id", selectedCategory)
          .in("id", selectedRooms);

        if (data) {
          roomsToUse.push(...data);
        }
      }

      // Distribuir dias entre os quartos
      const allocations: DayAllocation[] = [];
      const amountPerDay = totalAmount / reservationDays.length;

      reservationDays.forEach((date, index) => {
        const roomIndex = index % roomsToUse.length;
        const room = roomsToUse[roomIndex];
        
        if (room) {
          allocations.push({
            date,
            roomId: room.id,
            roomName: room.name || room.room_number || `Quarto ${roomIndex + 1}`,
            amount: amountPerDay,
          });
        }
      });

      setDayAllocations(allocations);
    };

    updateAllocations();
  }, [selectedRooms, selectedCategory, reservationDays, totalAmount, overbooking, reservation, otherCategoryRooms]);

  const handleAutoSplit = () => {
    if (overbooking.availableRooms.length === 0) {
      toast.error("Não há quartos disponíveis na categoria atual");
      return;
    }

    // Distribuir automaticamente entre os quartos disponíveis
    const roomsToUse = overbooking.availableRooms.slice(0, Math.min(overbooking.availableRooms.length, reservationDays.length));
    setSelectedRooms(roomsToUse.map((r: any) => r.id));
    setSelectedCategory(reservation.category_id || "");
  };

  const handleSplitReservation = async () => {
    if (dayAllocations.length === 0) {
      toast.error("Configure a distribuição das diárias");
      return;
    }

    setIsLoading(true);

    try {
      // Agrupar alocações por quarto
      const allocationsByRoom = new Map<string, DayAllocation[]>();
      dayAllocations.forEach((allocation) => {
        if (!allocationsByRoom.has(allocation.roomId)) {
          allocationsByRoom.set(allocation.roomId, []);
        }
        allocationsByRoom.get(allocation.roomId)!.push(allocation);
      });

      // Criar reservas separadas para cada quarto
      const newReservations = [];
      let reservationIndex = 0;

      for (const [roomId, allocations] of allocationsByRoom.entries()) {
        const sortedAllocations = allocations.sort((a, b) => 
          a.date.localeCompare(b.date)
        );

        const firstDate = sortedAllocations[0].date;
        const lastDate = sortedAllocations[sortedAllocations.length - 1].date;
        const roomAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

        // Buscar informações do quarto
        const { data: room } = await supabase
          .from("rooms")
          .select("category_id")
          .eq("id", roomId)
          .single();

        const newReservation = {
          establishment_id: reservation.establishment_id,
          client_id: reservation.client_id,
          guest_id: reservation.guest_id,
          category_id: room?.category_id || reservation.category_id,
          room_id: roomId,
          checkin_date: firstDate,
          checkout_date: lastDate,
          adults: reservation.adults || 1,
          children: reservation.children || 0,
          total_amount: roomAmount,
          paid_amount: reservationIndex === 0 ? reservation.paid_amount || 0 : 0, // Manter pagamento apenas na primeira
          payment_status: reservationIndex === 0 ? reservation.payment_status : "pending",
          status: reservation.status,
          channel: reservation.channel,
          pricing_plan_id: reservation.pricing_plan_id,
          notes: reservation.notes ? `${reservation.notes}\n[Reserva dividida automaticamente]` : "[Reserva dividida automaticamente]",
        };

        const { data: createdReservation, error } = await supabase
          .from("reservations")
          .insert(newReservation)
          .select()
          .single();

        if (error) throw error;

        newReservations.push(createdReservation);
        reservationIndex++;
      }

      // Cancelar reserva original
      await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", reservation.id);

      toast.success(`Reserva dividida em ${newReservations.length} reservas`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao dividir reserva:", error);
      toast.error(error.message || "Erro ao dividir reserva");
    } finally {
      setIsLoading(false);
    }
  };

  const updateDayAllocation = (date: string, field: "roomId" | "amount", value: string | number) => {
    setDayAllocations((prev) =>
      prev.map((allocation) =>
        allocation.date === date
          ? { ...allocation, [field]: value }
          : allocation
      )
    );
  };

  // Buscar quartos da categoria selecionada quando mudar
  useEffect(() => {
    const fetchCategoryRooms = async () => {
      if (!selectedCategory || selectedCategory === reservation.category_id) {
        setOtherCategoryRooms([]);
        return;
      }

      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("category_id", selectedCategory)
        .eq("establishment_id", reservation.establishment_id)
        .in("status", ["available", "cleaning"]);

      if (error) {
        console.error("Erro ao buscar quartos da categoria:", error);
        return;
      }

      // Filtrar quartos que não têm conflito no período da reserva
      const checkin = parseISO(reservation.checkin_date);
      const checkout = parseISO(reservation.checkout_date);

      const { data: conflictingReservations } = await supabase
        .from("reservations")
        .select("room_id")
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
        .or(`and(checkin_date.lte.${formatDate(checkout, "yyyy-MM-dd")},checkout_date.gte.${formatDate(checkin, "yyyy-MM-dd")})`);

      const occupiedRoomIds = new Set(
        (conflictingReservations || [])
          .map((r) => r.room_id)
          .filter((id): id is string => id !== null)
      );

      const availableRooms = (data || []).filter(
        (room: any) => !occupiedRoomIds.has(room.id)
      );

      setOtherCategoryRooms(availableRooms);
    };

    fetchCategoryRooms();
  }, [selectedCategory, reservation]);

  const allRooms = useMemo(() => {
    if (selectedCategory === reservation.category_id) {
      return overbooking.availableRooms;
    }
    return otherCategoryRooms;
  }, [selectedCategory, overbooking, otherCategoryRooms, reservation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dividir Reserva - Overbooking</DialogTitle>
          <DialogDescription>
            Distribua as diárias da reserva entre múltiplos quartos para resolver o conflito.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Informações da reserva */}
          <Card className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Reserva: {reservation.reservation_code}</h3>
                <Badge variant="destructive">Overbooking</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Hóspede: {reservationGuestDisplayName(reservation, "—")}</p>
                <p>
                  Período: {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <p>Total: {formatCurrency(reservation.total_amount || 0)}</p>
                <p>Dias: {reservationDays.length}</p>
              </div>
            </div>
          </Card>

          {/* Seleção de categoria */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={reservation.category_id || ""}>
                  {reservation.room_categories?.name || "Categoria Atual"}
                </SelectItem>
                {otherCategories
                  .filter((c) => c.id !== reservation.category_id)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de quartos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Quartos Disponíveis</Label>
              <Button variant="outline" size="sm" onClick={handleAutoSplit}>
                Distribuir Automaticamente
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {allRooms.map((room: any) => (
                <Card
                  key={room.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedRooms.includes(room.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    if (selectedRooms.includes(room.id)) {
                      setSelectedRooms(selectedRooms.filter((id) => id !== room.id));
                    } else {
                      setSelectedRooms([...selectedRooms, room.id]);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{room.name || room.room_number}</p>
                      <p className="text-xs text-muted-foreground">{room.room_number}</p>
                    </div>
                    {selectedRooms.includes(room.id) && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
            {allRooms.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Não há quartos disponíveis nesta categoria. Selecione outra categoria.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Valor total */}
          <div className="space-y-2">
            <Label>Valor Total</Label>
            <Input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(Number(e.target.value))}
              step="0.01"
            />
          </div>

          {/* Distribuição de diárias */}
          {dayAllocations.length > 0 && (
            <div className="space-y-2">
              <Label>Distribuição de Diárias</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {dayAllocations.map((allocation) => (
                  <Card key={allocation.date} className="p-3">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {format(parseISO(allocation.date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <Select
                        value={allocation.roomId}
                        onValueChange={(value) => updateDayAllocation(allocation.date, "roomId", value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allRooms.map((room: any) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name || room.room_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={allocation.amount.toFixed(2)}
                        onChange={(e) =>
                          updateDayAllocation(allocation.date, "amount", Number(e.target.value))
                        }
                        className="w-32"
                        step="0.01"
                      />
                    </div>
                  </Card>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                Total distribuído: {formatCurrency(dayAllocations.reduce((sum, a) => sum + a.amount, 0))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSplitReservation} disabled={isLoading || dayAllocations.length === 0}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dividir Reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

