import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

interface ReservationTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  onSuccess?: () => void;
}

export function ReservationTransferModal({
  open,
  onOpenChange,
  reservation,
  onSuccess,
}: ReservationTransferModalProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [checkinDate, setCheckinDate] = useState<Date | undefined>(undefined);
  const [checkoutDate, setCheckoutDate] = useState<Date | undefined>(undefined);
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [observations, setObservations] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [numberOfNights, setNumberOfNights] = useState<number>(0);

  // Carregar categorias e quartos
  useEffect(() => {
    if (open && reservation) {
      loadCategoriesAndRooms();
      
      // Preencher dados iniciais
      const originalCheckin = parseISO(reservation.checkin_date);
      const originalCheckout = parseISO(reservation.checkout_date);
      const nights = differenceInDays(originalCheckout, originalCheckin);
      
      setCheckinDate(originalCheckin);
      setCheckoutDate(originalCheckout);
      setNumberOfNights(nights);
      setTotalAmount(Number(reservation.total_amount || 0).toFixed(2));
      setObservations(reservation.notes || "");
      
      if (reservation.category_id) {
        setSelectedCategoryId(reservation.category_id);
      }
      if (reservation.room_id) {
        setSelectedRoomId(reservation.room_id);
      }

      console.log("📅 Reserva original:", {
        checkin: format(originalCheckin, "dd/MM/yyyy"),
        checkout: format(originalCheckout, "dd/MM/yyyy"),
        noites: nights
      });
    }
  }, [open, reservation]);

  // Atualizar checkout automaticamente quando checkin mudar
  useEffect(() => {
    if (checkinDate && numberOfNights > 0) {
      const newCheckout = addDays(checkinDate, numberOfNights);
      setCheckoutDate(newCheckout);
      
      console.log("📅 Data de check-in alterada:", {
        novoCheckin: format(checkinDate, "dd/MM/yyyy"),
        novoCheckout: format(newCheckout, "dd/MM/yyyy"),
        noites: numberOfNights
      });
    }
  }, [checkinDate, numberOfNights]);

  // Carregar quartos quando categoria mudar
  useEffect(() => {
    if (selectedCategoryId) {
      loadRoomsByCategory(selectedCategoryId);
    } else {
      setRooms([]);
    }
  }, [selectedCategoryId]);

  const loadCategoriesAndRooms = async () => {
    const establishmentId = getSelectedEstablishmentId();
    if (!establishmentId) return;

    try {
      // Buscar categorias
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Se tem categoria selecionada, carregar seus quartos
      if (reservation?.category_id) {
        await loadRoomsByCategory(reservation.category_id);
      }
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
      toast.error("Erro ao carregar categorias");
    }
  };

  const loadRoomsByCategory = async (categoryId: string) => {
    const establishmentId = getSelectedEstablishmentId();
    if (!establishmentId) return;

    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("category_id", categoryId);

      if (roomsError) {
        console.error("Erro detalhado ao carregar quartos:", roomsError);
        throw roomsError;
      }

      // Filtrar quartos ativos manualmente (se a propriedade existir)
      const activeRooms = (roomsData || []).filter((room) => {
        // Se a coluna exists, usar, senão considerar ativo
        if ('is_active' in room) {
          return room.is_active !== false;
        }
        return true;
      });

      // Ordenar manualmente por room_number
      const sortedRooms = activeRooms.sort((a, b) => {
        return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
      });

      setRooms(sortedRooms);
      console.log(`✅ Carregados ${sortedRooms.length} quartos para categoria ${categoryId}`);
    } catch (error) {
      console.error("Erro ao carregar quartos:", error);
      toast.error("Erro ao carregar quartos da categoria");
    }
  };

  const handleTransfer = async () => {
    if (!selectedRoomId || !checkinDate || !checkoutDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setIsLoading(true);

    try {
      const originalRoomId = reservation.room_id as string | null;

      const { error } = await supabase
        .from("reservations")
        .update({
          category_id: selectedCategoryId,
          room_id: selectedRoomId,
          checkin_date: format(checkinDate, "yyyy-MM-dd"),
          checkout_date: format(checkoutDate, "yyyy-MM-dd"),
          total_amount: parseFloat(totalAmount),
          notes: observations,
        })
        .eq("id", reservation.id);

      if (error) throw error;

      if (originalRoomId && originalRoomId !== selectedRoomId) {
        await supabase
          .from("maintenance_tickets")
          .update({ room_id: originalRoomId })
          .eq("reservation_id", reservation.id)
          .eq("lock_room_on_transfer", true)
          .in("status", ["open", "in_progress"]);
      }

      toast.success("Reserva transferida com sucesso!");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao transferir reserva:", error);
      toast.error("Erro ao transferir reserva");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  if (!reservation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-slate-900">
              Transferir Reserva
            </DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Categoria e Unidade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-medium">
                Categoria <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedCategoryId}
                onValueChange={setSelectedCategoryId}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="room" className="text-sm font-medium">
                Selecione a Unidade <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedRoomId}
                onValueChange={setSelectedRoomId}
                disabled={!selectedCategoryId || rooms.length === 0}
              >
                <SelectTrigger id="room">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      Quarto {room.room_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Datas */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkin" className="text-sm font-medium">
                  Data Inicial <span className="text-red-500">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="checkin"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !checkinDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkinDate ? (
                        format(checkinDate, "dd/MM/yyyy", { locale: ptBR })
                      ) : (
                        <span>Selecione a data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkinDate}
                      onSelect={setCheckinDate}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkout" className="text-sm font-medium">
                  Data Final <span className="text-red-500">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="checkout"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-slate-50",
                        !checkoutDate && "text-muted-foreground"
                      )}
                      disabled
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkoutDate ? (
                        format(checkoutDate, "dd/MM/yyyy", { locale: ptBR })
                      ) : (
                        <span>Calculado automaticamente</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                </Popover>
              </div>
            </div>

            {/* Indicador de noites */}
            {numberOfNights > 0 && (
              <div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-blue-700">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="font-semibold">
                    {numberOfNights} {numberOfNights === 1 ? "noite" : "noites"}
                  </span>
                </div>
                <span className="text-blue-600 text-xs">
                  (check-out calculado automaticamente)
                </span>
              </div>
            )}
          </div>

          {/* Valor da Reserva */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              Valor da Reserva
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                R$
              </span>
              <Input
                id="amount"
                type="text"
                value={totalAmount}
                className="pl-10 bg-slate-50 font-semibold"
                placeholder="0,00"
                disabled
                readOnly
              />
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-2">
            <Label htmlFor="observations" className="text-sm font-medium">
              Observação
            </Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Digite observações sobre a transferência..."
              className="min-h-[150px] resize-none"
            />
            {(reservation.guest_name || reservation.guest?.full_name || reservation.financial_responsible?.full_name) && (
              <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                <strong>Hóspede:</strong> {reservation.guest_name || reservation.guest?.full_name || reservation.financial_responsible?.full_name}
                {reservation.adults && (
                  <>
                    {" • "}
                    <strong>Adultos:</strong> {reservation.adults}
                  </>
                )}
                {reservation.children > 0 && (
                  <>
                    {" • "}
                    <strong>Crianças:</strong> {reservation.children}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={isLoading || !selectedRoomId || !checkinDate || !checkoutDate}
              className="flex-1"
            >
              {isLoading ? "Transferindo..." : "Transferir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

