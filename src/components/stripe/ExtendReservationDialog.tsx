import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { addDays, format, startOfDay } from "date-fns";
import { PaymentDialog } from "./PaymentDialog";
import { useStripe } from "@/hooks/useStripe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePricing } from "@/hooks/usePricing";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { validateCategoryAvailability } from "@/lib/reservationUtils";
import { useQueryClient } from "@tanstack/react-query";
import { ContactUnavailableModal } from "@/components/webcheckin/ContactUnavailableModal";
import { useReservations } from "@/hooks/useReservations";

interface ExtendReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  currentCheckout: Date;
  dailyRate: number;
  onSuccess?: () => void;
  reservation?: any; // Dados completos da reserva para verificação de disponibilidade
}

export const ExtendReservationDialog = ({
  open,
  onOpenChange,
  reservationId,
  currentCheckout,
  dailyRate,
  onSuccess,
  reservation,
}: ExtendReservationDialogProps) => {
  const { isStripeEnabled } = useStripe();
  const { calculatePrice } = usePricing();
  const queryClient = useQueryClient();
  const { updateReservation } = useReservations();
  const [additionalNights, setAdditionalNights] = useState(1);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [newCheckout, setNewCheckout] = useState<Date | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const calculatingRef = useRef(false);
  const lastCalculationRef = useRef<string | null>(null);

  // Calcular preço usando o sistema de tarifário quando o número de noites mudar
  useEffect(() => {
    if (!reservation || additionalNights <= 0) {
      setCalculatedPrice(null);
      setIsCalculatingPrice(false);
      calculatingRef.current = false;
      lastCalculationRef.current = null;
      return;
    }

    // Criar uma chave única para esta combinação de parâmetros
    const calculationKey = `${additionalNights}-${currentCheckout.getTime()}-${reservation.id || reservationId}`;
    
    // Se já está calculando ou já calculou para esta combinação, não recalcular
    if (calculatingRef.current || lastCalculationRef.current === calculationKey) {
      return;
    }

    const calculateExtensionPrice = async () => {
      // Marcar como calculando
      calculatingRef.current = true;
      lastCalculationRef.current = calculationKey;
      // Obter categoryId
      const categoryId = 
        reservation.room_category_id || 
        reservation.category_id || 
        reservation?.room_categories?.id;

      if (!categoryId) {
        console.warn("[ExtendReservation] Category ID não encontrado, usando tarifa fixa");
        setCalculatedPrice(null);
        return;
      }

      // Obter establishment ID
      const establishmentId = 
        reservation?.establishment_id || 
        reservation?.establishments?.id ||
        getSelectedEstablishmentId();

      if (!establishmentId) {
        console.warn("[ExtendReservation] Establishment ID não encontrado, usando tarifa fixa");
        setCalculatedPrice(null);
        return;
      }

      // Obter pricing_plan_id da reserva (plano tarifário usado quando a reserva foi criada)
      let pricingPlanId = reservation.pricing_plan_id || null;
      
      // Se não encontrou na reserva, buscar do banco usando reservationId
      if (!pricingPlanId && reservationId) {
        try {
          const { data: reservationData, error } = await supabase
            .from("reservations")
            .select("pricing_plan_id")
            .eq("id", reservationId)
            .maybeSingle();
          
          if (!error && reservationData) {
            pricingPlanId = (reservationData as any).pricing_plan_id || null;
          }
        } catch (error) {
          console.warn("[ExtendReservation] Erro ao buscar pricing_plan_id do banco:", error);
        }
      }

      // Salvar no localStorage para o usePricing conseguir usar
      localStorage.setItem("selectedEstablishmentId", establishmentId);

      setIsCalculatingPrice(true);

      // Calcular datas
      const checkinDate = startOfDay(currentCheckout);
      const checkoutDate = startOfDay(addDays(currentCheckout, additionalNights));
      const checkinStr = format(checkinDate, "yyyy-MM-dd");
      const checkoutStr = format(checkoutDate, "yyyy-MM-dd");

      try {
        const price = await calculatePrice(
          categoryId,
          checkinStr,
          checkoutStr,
          undefined, // promotionCode
          pricingPlanId || undefined, // pricingPlanId - usar o plano da reserva original
          undefined, // channelType
          reservation.adults || 1,
          reservation.children || 0
        );

        if (price && price > 0) {
          setCalculatedPrice(price);
        } else {
          console.warn("[ExtendReservation] Preço calculado é zero ou inválido, usando tarifa fixa");
          setCalculatedPrice(null);
        }
      } catch (error) {
        console.error("[ExtendReservation] Erro ao calcular preço do tarifário:", error);
        setCalculatedPrice(null);
      } finally {
        setIsCalculatingPrice(false);
        calculatingRef.current = false;
      }
    };

    calculateExtensionPrice();

    // Cleanup: resetar flag se o componente for desmontado ou dependências mudarem
    return () => {
      calculatingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalNights, currentCheckout, reservation?.id, reservation?.pricing_plan_id, reservationId]);

  // Calcular total
  const calculateTotal = useMemo(() => {
    // Se temos preço calculado do tarifário, usar ele
    if (calculatedPrice !== null && calculatedPrice > 0) {
      return calculatedPrice;
    }

    // Fallback: usar tarifa diária fixa
    return additionalNights * dailyRate;
  }, [additionalNights, dailyRate, calculatedPrice]);

  // Verificar disponibilidade antes de permitir extensão
  // Verificar disponibilidade usando a mesma lógica do mapa de reservas
  const checkAvailability = async (): Promise<boolean> => {
    if (!reservation || additionalNights <= 0) {
      return false;
    }

    try {
      const categoryId = reservation.room_category_id || reservation.category_id;
      const roomId = reservation.room_id;
      let establishmentId = reservation.establishment_id;

      if (!categoryId) {
        toast.error("Categoria do quarto não encontrada");
        return false;
      }

      // Se não encontrou establishment_id na reserva, buscar do contexto ou da categoria
      if (!establishmentId) {
        // Primeiro tentar do contexto
        establishmentId = getSelectedEstablishmentId();
        
        // Se ainda não encontrou, tentar buscar através do building da categoria
        if (!establishmentId) {
          try {
            const { data: category } = await supabase
              .from("room_categories")
              .select("building_id, buildings(establishment_id)")
              .eq("id", categoryId)
              .single();
            
            if (category && (category as any).buildings) {
              establishmentId = (category as any).buildings.establishment_id;
            }
          } catch (error) {
            console.warn("Erro ao buscar establishment_id da categoria:", error);
          }
        }
      }

      if (!establishmentId) {
        toast.error("Estabelecimento não identificado");
        return false;
      }

      const newCheckoutDate = addDays(currentCheckout, additionalNights);
      const extensionCheckin = format(startOfDay(currentCheckout), "yyyy-MM-dd");
      const extensionCheckout = format(startOfDay(newCheckoutDate), "yyyy-MM-dd");

      // 1. PRIMEIRO: Verificar se o quarto específico da reserva está disponível no período
      if (roomId) {
        // Buscar informações do quarto específico
        let roomQuery = supabase
          .from("rooms")
          .select("id, name, status, is_blocked, category_id")
          .eq("id", roomId)
          .single();

        if (establishmentId) {
          roomQuery = roomQuery.eq("establishment_id", establishmentId);
        }

        const { data: currentRoom, error: roomError } = await roomQuery;

        if (roomError) {
          console.error("Erro ao buscar quarto:", roomError);
        }

        if (currentRoom) {
          // Verificar status do quarto
          if (currentRoom.is_blocked === true) {
            // Quarto está bloqueado - não pode estender
            return false;
          }

          if (!["available", "cleaning"].includes(currentRoom.status)) {
            // Quarto não está disponível (manutenção, etc) - não pode estender
            return false;
          }

          // Verificar se há reservas conflitantes no MESMO QUARTO no período de extensão
          let roomReservationsQuery = supabase
            .from("reservations")
            .select("id, checkin_date, checkout_date, status, notes, reservation_code")
            .eq("room_id", roomId)
            .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"] as any)
            .neq("id", reservationId) // Excluir a reserva atual
            .or(
              `and(checkin_date.lt.${extensionCheckout},checkout_date.gt.${extensionCheckin})`
            );

          if (establishmentId) {
            roomReservationsQuery = roomReservationsQuery.eq("establishment_id", establishmentId);
          }

          const { data: roomConflicts, error: roomConflictsError } = await roomReservationsQuery;

          if (roomConflictsError) {
            console.error("Erro ao verificar conflitos no quarto:", roomConflictsError);
          }

          // Se há conflitos no quarto específico, não pode estender
          if (roomConflicts && roomConflicts.length > 0) {
            // Há reservas conflitantes no quarto específico
            return false;
          }

          // Quarto específico está disponível e sem conflitos - pode estender
          return true;
        }
      }

      // 2. SEGUNDO: Se não tem quarto específico ou o quarto não foi encontrado,
      // verificar disponibilidade na categoria
      // Buscar todos os quartos da categoria que estão disponíveis
      let roomsQuery = supabase
        .from("rooms")
        .select("id, name, status, is_blocked")
        .eq("category_id", categoryId)
        .in("status", ["available", "cleaning"])
        .eq("is_blocked", false);

      // Só adicionar filtro de establishment_id se ele existir e for válido
      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }

      const { data: rooms, error: roomsError } = await roomsQuery;

      if (roomsError) throw roomsError;
      if (!rooms || rooms.length === 0) {
        // Nenhum quarto disponível na categoria
        return false;
      }

      // Buscar todas as reservas que conflitam com o período de extensão na categoria
      let reservationsQuery = supabase
        .from("reservations")
        .select("id, room_id, checkin_date, checkout_date, status, notes")
        .eq("category_id", categoryId)
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"] as any)
        .neq("id", reservationId) // Excluir a reserva atual
        .or(
          `and(checkin_date.lt.${extensionCheckout},checkout_date.gt.${extensionCheckin})`
        );

      // Só adicionar filtro de establishment_id se ele existir e for válido
      if (establishmentId) {
        reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
      }

      const { data: conflictingReservations, error: reservationsError } = await reservationsQuery;

      if (reservationsError) throw reservationsError;

      // Criar conjunto de quartos ocupados no período de extensão
      const occupiedRoomIds = new Set<string>();
      
      // Adicionar quartos ocupados por reservas (incluindo bloqueios, pending, confirmed, checkedin, preregistration)
      (conflictingReservations || []).forEach((r) => {
        if (r.room_id) {
          occupiedRoomIds.add(r.room_id);
        }
      });

      // Verificar se há quartos disponíveis na categoria (não ocupados e com status adequado)
      const availableRooms = rooms.filter(
        (room) => 
          !occupiedRoomIds.has(room.id) && 
          !room.is_blocked && 
          ["available", "cleaning"].includes(room.status)
      );
      
      if (availableRooms.length > 0) {
        // Há quartos disponíveis na categoria
        return true;
      }
      
      // Não há quartos disponíveis - não pode estender
      return false;
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      toast.error("Erro ao verificar disponibilidade");
      return false;
    }
  };

  const handleExtend = async () => {
    if (!isStripeEnabled) {
      return;
    }

    setCheckingAvailability(true);
    try {
      // Verificar disponibilidade antes de processar
      const isAvailable = await checkAvailability();
      if (!isAvailable) {
        // Abrir modal de contato ao invés de mostrar toast
        setShowContactModal(true);
        setCheckingAvailability(false);
        return;
      }

      const checkout = addDays(currentCheckout, additionalNights);
      setNewCheckout(checkout);
      setPaymentDialogOpen(true);
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      toast.error("Erro ao verificar disponibilidade");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handlePaymentSuccess = async () => {
    // Após pagamento bem-sucedido, atualizar a reserva no banco
    if (!newCheckout || !reservation) {
      onSuccess?.();
      onOpenChange(false);
      setPaymentDialogOpen(false);
      return;
    }

    try {
      const additionalNights = Math.ceil((newCheckout.getTime() - currentCheckout.getTime()) / (1000 * 60 * 60 * 24));
      const additionalAmount = calculateTotal;
      const currentTotal = reservation.total_amount || 0;
      const newTotalAmount = currentTotal + additionalAmount;

      console.log("[ExtendReservation] Atualizando reserva após pagamento:", {
        reservation_id: reservationId,
        checkout_date: format(newCheckout, "yyyy-MM-dd"),
        total_amount: newTotalAmount,
        additionalNights,
        additionalAmount,
      });

      // Usar o hook updateReservation que detecta extensões e envia email automaticamente
      const updatedReservation = await updateReservation({
        id: reservationId,
        checkout_date: format(newCheckout, "yyyy-MM-dd"),
        total_amount: newTotalAmount,
      });

      console.log("[ExtendReservation] ✅ Reserva atualizada com sucesso:", updatedReservation);

      // Invalidar todas as queries relacionadas a reservas
      const establishmentId = reservation.establishment_id || getSelectedEstablishmentId();
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservations", establishmentId] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });

      toast.success("Extensão confirmada e paga com sucesso!");
      onSuccess?.();
      onOpenChange(false);
      setPaymentDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao atualizar reserva após pagamento:", error);
      toast.error("Pagamento confirmado, mas houve erro ao atualizar a reserva. Entre em contato com o hotel.");
    }
  };

  if (!isStripeEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              O pagamento via Stripe não está disponível. Entre em contato com o estabelecimento.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <ContactUnavailableModal
      open={showContactModal}
      onOpenChange={setShowContactModal}
      categoryId={reservation?.room_category_id || reservation?.category_id}
      establishmentId={reservation?.establishment_id || getSelectedEstablishmentId()}
    />
      <Dialog open={open && !paymentDialogOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estender Reserva</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Data de Check-out Atual</Label>
              <p className="text-sm text-gray-600">
                {format(currentCheckout, "dd/MM/yyyy")}
              </p>
            </div>

            <div>
              <Label htmlFor="additionalNights">Noites Adicionais</Label>
              <Input
                id="additionalNights"
                type="number"
                min="1"
                value={additionalNights}
                onChange={(e) => setAdditionalNights(parseInt(e.target.value) || 1)}
              />
            </div>

            <div>
              <Label>Nova Data de Check-out</Label>
              <p className="text-sm text-gray-600">
                {format(addDays(currentCheckout, additionalNights), "dd/MM/yyyy")}
              </p>
            </div>

            <div>
              <Label>Valor Total</Label>
              <p className="text-2xl font-bold">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(calculateTotal)}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExtend} disabled={checkingAvailability}>
              {checkingAvailability ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando disponibilidade...
                </>
              ) : (
                "Estender e Pagar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {newCheckout && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          amount={calculateTotal}
          paymentType="extension"
          reservationId={reservationId}
          description={`Extensão de reserva por ${additionalNights} noite(s) até ${format(newCheckout, "dd/MM/yyyy")}`}
          onSuccess={handlePaymentSuccess}
          metadata={{
            checkout_date: format(newCheckout, "yyyy-MM-dd"),
            total_amount: String((reservation?.total_amount || 0) + calculateTotal),
          }}
        />
      )}
    </>
  );
};

