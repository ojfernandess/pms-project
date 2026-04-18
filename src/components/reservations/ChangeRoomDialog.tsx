import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Loader2, Bed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/reservationUtils";
import { useReservations } from "@/hooks/useReservations";
import { validateRoomAvailability } from "@/lib/reservationUtils";

interface ChangeRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  availableRooms: any[];
  preselectedRoomId?: string;
  onSuccess?: () => void;
}

export const ChangeRoomDialog = ({
  open,
  onOpenChange,
  reservation,
  availableRooms,
  preselectedRoomId,
  onSuccess,
}: ChangeRoomDialogProps) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [otherCategories, setOtherCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [otherCategoryRooms, setOtherCategoryRooms] = useState<any[]>([]);
  const { updateReservation } = useReservations();

  // Buscar outras categorias
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
      setSelectedCategory(reservation.category_id || "");
      
      // Pré-selecionar quarto se fornecido, senão selecionar o primeiro se houver apenas um
      if (preselectedRoomId) {
        setSelectedRoomId(preselectedRoomId);
      } else if (availableRooms.length === 1) {
        setSelectedRoomId(availableRooms[0].id);
      } else {
        setSelectedRoomId("");
      }
    }
  }, [open, reservation, availableRooms, preselectedRoomId]);

  // Buscar quartos da categoria selecionada
  useEffect(() => {
    const fetchCategoryRooms = async () => {
      if (!selectedCategory || !reservation?.establishment_id) {
        setOtherCategoryRooms([]);
        return;
      }

      if (selectedCategory === reservation.category_id) {
        // Usar quartos disponíveis da categoria atual
        setOtherCategoryRooms(availableRooms);
        return;
      }

      // Buscar quartos de outra categoria
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
        .neq("id", reservation.id) // Excluir a reserva atual
        .or(
          `and(checkin_date.lt.${format(checkout, "yyyy-MM-dd")},checkout_date.gt.${format(checkin, "yyyy-MM-dd")})`
        );

      const occupiedRoomIds = new Set(
        (conflictingReservations || [])
          .map((r) => r.room_id)
          .filter((id): id is string => id !== null)
      );

      const availableRoomsInCategory = (data || []).filter(
        (room: any) => !occupiedRoomIds.has(room.id) && room.is_blocked !== true
      );

      setOtherCategoryRooms(availableRoomsInCategory);
    };

    if (open) {
      fetchCategoryRooms();
    }
  }, [selectedCategory, reservation, availableRooms, open]);

  const allAvailableRooms = selectedCategory === reservation.category_id 
    ? availableRooms 
    : otherCategoryRooms;

  const handleChangeRoom = async () => {
    if (!selectedRoomId) {
      toast.error("Selecione um quarto");
      return;
    }

    setIsLoading(true);

    try {
      // Validar disponibilidade do quarto selecionado
      const availabilityCheck = await validateRoomAvailability(
        selectedRoomId,
        reservation.checkin_date,
        reservation.checkout_date,
        reservation.id // Excluir a reserva atual da verificação
      );

      if (!availabilityCheck.available) {
        toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
        setIsLoading(false);
        return;
      }

      // Buscar informações do quarto selecionado
      const { data: selectedRoom, error: roomError } = await supabase
        .from("rooms")
        .select("category_id")
        .eq("id", selectedRoomId)
        .single();

      if (roomError) throw roomError;

      // Atualizar a reserva com o novo quarto
      await updateReservation({
        id: reservation.id,
        room_id: selectedRoomId,
        category_id: selectedRoom?.category_id || reservation.category_id,
      });

      toast.success("Quarto alterado com sucesso!");
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao trocar quarto:", error);
      toast.error(error.message || "Erro ao trocar quarto");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trocar Quarto da Reserva</DialogTitle>
          <DialogDescription>
            Selecione um quarto disponível para substituir o quarto atual da reserva.
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
                <p>
                  Hóspede:{" "}
                  {reservation.guest?.full_name ||
                    reservation.financial_responsible?.full_name ||
                    "N/A"}
                </p>
                <p>
                  Período: {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <p>Quarto Atual: {reservation.rooms?.name || reservation.rooms?.room_number || "N/A"}</p>
                <p>Valor: {formatCurrency(reservation.total_amount || 0)}</p>
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

          {/* Seleção de quarto */}
          <div className="space-y-2">
            <Label>Quartos Disponíveis</Label>
            {allAvailableRooms.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Não há quartos disponíveis nesta categoria para o período da reserva.
                  Selecione outra categoria.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {allAvailableRooms.map((room: any) => (
                  <Card
                    key={room.id}
                    data-room-id={room.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedRoomId === room.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bed className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{room.name || room.room_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {room.room_number}
                          </p>
                        </div>
                      </div>
                      {selectedRoomId === room.id && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleChangeRoom} disabled={isLoading || !selectedRoomId}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Trocar Quarto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

