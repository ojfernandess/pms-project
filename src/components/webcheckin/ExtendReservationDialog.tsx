import { useState, useMemo, useEffect, useRef } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, AlertCircle } from "lucide-react";
import { format, addDays, differenceInDays, parseISO, startOfDay, eachDayOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/lib/activityLogger";
import { useStripe } from "@/hooks/useStripe";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { usePricing } from "@/hooks/usePricing";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { ContactUnavailableModal } from "./ContactUnavailableModal";

interface ExtendReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  webCheckin: any;
  token: string;
  onSuccess?: () => void;
}

export function ExtendReservationDialog({
  open,
  onOpenChange,
  reservation,
  webCheckin,
  token,
  onSuccess,
}: ExtendReservationDialogProps) {
  const queryClient = useQueryClient();
  
  // Garantir que o establishmentId esteja disponível no localStorage para o hook useStripe
  useEffect(() => {
    const establishmentId = 
      reservation?.establishment_id || 
      reservation?.establishments?.id ||
      webCheckin?.establishment_id;
    
    if (establishmentId) {
      localStorage.setItem("selectedEstablishmentId", establishmentId);
    }
  }, [reservation, webCheckin]);
  
  const { isStripeEnabled, globalConfig, establishmentConfig } = useStripe();
  const { calculatePrice } = usePricing();
  const [loading, setLoading] = useState(false);
  const [newCheckoutDate, setNewCheckoutDate] = useState<Date | undefined>();
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const calculatingRef = useRef(false);
  const lastCalculationRef = useRef<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [occupiedDates, setOccupiedDates] = useState<Set<string>>(new Set());

  const originalCheckout = reservation?.checkout_date
    ? parseISO(reservation.checkout_date)
    : null;
  const minDate = originalCheckout ? addDays(originalCheckout, 1) : new Date();

  // Buscar datas ocupadas quando o diálogo abrir
  useEffect(() => {
    if (!open || !reservation) return;

    const fetchOccupiedDates = async () => {
      try {
        const categoryId = reservation.room_category_id || reservation.category_id;
        const roomId = reservation.room_id;
        let establishmentId = reservation.establishment_id;

        if (!categoryId) return;

        if (!establishmentId) {
          establishmentId = getSelectedEstablishmentId();
          if (!establishmentId) {
            try {
              const { data: category } = await supabase
                .from("room_categories")
                .select("building_id, establishment_id, buildings(establishment_id)")
                .eq("id", categoryId)
                .maybeSingle();
              
              if (category) {
                if ((category as any).buildings && (category as any).buildings.establishment_id) {
                  establishmentId = (category as any).buildings.establishment_id;
                } else if ((category as any).establishment_id) {
                  establishmentId = (category as any).establishment_id;
                }
              }
            } catch (error) {
              console.warn("Erro ao buscar establishment_id:", error);
            }
          }
        }

        if (!establishmentId) return;

        const startSearchDate = originalCheckout || new Date();
        const endSearchDate = addDays(startSearchDate, 90);
        const startSearchStr = format(startOfDay(startSearchDate), "yyyy-MM-dd");
        const endSearchStr = format(startOfDay(endSearchDate), "yyyy-MM-dd");

        const occupiedDatesSet = new Set<string>();

        // Se tem quarto específico, buscar reservas conflitantes nesse quarto
        if (roomId) {
          let roomReservationsQuery = supabase
            .from("reservations")
            .select("id, checkin_date, checkout_date, status")
            .eq("room_id", roomId)
            .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"] as any)
            .neq("id", reservation.id)
            .gte("checkin_date", startSearchStr)
            .lt("checkin_date", endSearchStr);

          if (establishmentId) {
            roomReservationsQuery = roomReservationsQuery.eq("establishment_id", establishmentId);
          }

          const { data: roomReservations } = await roomReservationsQuery;

          if (roomReservations) {
            roomReservations.forEach((r) => {
              if (r.checkin_date && r.checkout_date) {
                const checkin = startOfDay(parseISO(r.checkin_date));
                const checkout = startOfDay(parseISO(r.checkout_date));
                // A data de checkout é exclusiva (o quarto fica disponível no checkout)
                // Então marcamos como ocupado apenas do checkin até checkout-1
                const lastOccupiedDate = subDays(checkout, 1);
                if (checkin <= lastOccupiedDate) {
                  const dates = eachDayOfInterval({ start: checkin, end: lastOccupiedDate });
                  dates.forEach((date) => {
                    occupiedDatesSet.add(format(date, "yyyy-MM-dd"));
                  });
                }
              }
            });
          }
        }

        // Buscar todas as reservas da categoria
        let categoryReservationsQuery = supabase
          .from("reservations")
          .select("id, checkin_date, checkout_date, status, room_id")
          .eq("category_id", categoryId)
          .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"] as any)
          .neq("id", reservation.id)
          .gte("checkin_date", startSearchStr)
          .lt("checkin_date", endSearchStr);

        if (establishmentId) {
          categoryReservationsQuery = categoryReservationsQuery.eq("establishment_id", establishmentId);
        }

        const { data: categoryReservations } = await categoryReservationsQuery;

        if (categoryReservations) {
          let roomsQuery = supabase
            .from("rooms")
            .select("id")
            .eq("category_id", categoryId)
            .in("status", ["available", "cleaning"])
            .eq("is_blocked", false);

          if (establishmentId) {
            roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
          }

          const { data: availableRooms } = await roomsQuery;
          const availableRoomIds = new Set((availableRooms || []).map((r: any) => r.id));

          const reservationsByDate = new Map<string, Set<string>>();

          categoryReservations.forEach((r) => {
            if (r.checkin_date && r.checkout_date) {
              const checkin = startOfDay(parseISO(r.checkin_date));
              const checkout = startOfDay(parseISO(r.checkout_date));
              // A data de checkout é exclusiva (o quarto fica disponível no checkout)
              // Então marcamos como ocupado apenas do checkin até checkout-1
              const lastOccupiedDate = subDays(checkout, 1);
              if (checkin <= lastOccupiedDate) {
                const dates = eachDayOfInterval({ start: checkin, end: lastOccupiedDate });
                dates.forEach((date) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  if (!reservationsByDate.has(dateStr)) {
                    reservationsByDate.set(dateStr, new Set());
                  }
                  if (r.room_id) {
                    reservationsByDate.get(dateStr)!.add(r.room_id);
                  }
                });
              }
            }
          });

          reservationsByDate.forEach((occupiedRoomIds, dateStr) => {
            if (occupiedRoomIds.size >= availableRoomIds.size) {
              occupiedDatesSet.add(dateStr);
            }
          });
        }

        setOccupiedDates(occupiedDatesSet);
      } catch (error) {
        console.error("Erro ao buscar datas ocupadas:", error);
      }
    };

    fetchOccupiedDates();
  }, [open, reservation, originalCheckout]);

  // Definir data inicial quando o diálogo abrir
  useEffect(() => {
    if (open && originalCheckout && !newCheckoutDate) {
      setNewCheckoutDate(addDays(originalCheckout, 1));
    }
  }, [open, originalCheckout]);

  // Calcular preço usando o sistema de tarifário quando a data mudar
  useEffect(() => {
    if (!newCheckoutDate || !originalCheckout || !reservation) {
      setCalculatedPrice(null);
      setIsCalculatingPrice(false);
      calculatingRef.current = false;
      lastCalculationRef.current = null;
      return;
    }

    // Criar uma chave única para esta combinação de parâmetros
    const calculationKey = `${newCheckoutDate.getTime()}-${originalCheckout.getTime()}-${reservation.id}`;
    
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
      let establishmentId = 
        reservation?.establishment_id || 
        reservation?.establishments?.id ||
        webCheckin?.establishment_id ||
        getSelectedEstablishmentId();

      // Se ainda não encontrou, buscar diretamente da categoria (com ou sem prédio)
      if (!establishmentId) {
        try {
          const { data: category } = await supabase
            .from("room_categories")
            .select("building_id, establishment_id, buildings(establishment_id)")
            .eq("id", categoryId)
            .maybeSingle();
          
          if (category) {
            // Se a categoria tem building_id e o building tem establishment_id, usar esse
            if ((category as any).buildings && (category as any).buildings.establishment_id) {
              establishmentId = (category as any).buildings.establishment_id;
            }
            // Se não tem building mas tem establishment_id direto na categoria, usar esse
            else if ((category as any).establishment_id) {
              establishmentId = (category as any).establishment_id;
            }
          }
        } catch (error) {
          console.warn("[ExtendReservation] Erro ao buscar establishment_id da categoria:", error);
        }
      }

      if (!establishmentId) {
        console.warn("[ExtendReservation] Establishment ID não encontrado, usando tarifa fixa");
        setCalculatedPrice(null);
        return;
      }

      // Obter pricing_plan_id da reserva (plano tarifário usado quando a reserva foi criada)
      let pricingPlanId = reservation.pricing_plan_id || null;
      
      // Se não encontrou na reserva, buscar do banco
      if (!pricingPlanId && reservation.id) {
        try {
          const { data: reservationData, error } = await supabase
            .from("reservations")
            .select("pricing_plan_id")
            .eq("id", reservation.id)
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

      // Garantir que as datas estão no formato correto
      const checkinDate = startOfDay(originalCheckout);
      const checkoutDate = startOfDay(newCheckoutDate);
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
  }, [newCheckoutDate, originalCheckout, reservation?.id, reservation?.pricing_plan_id]);

  // Calcular valores
  const calculation = useMemo(() => {
    if (!newCheckoutDate || !originalCheckout) return null;

    const additionalNights = differenceInDays(newCheckoutDate, originalCheckout);
    if (additionalNights <= 0) return null;

    // Se temos preço calculado do tarifário, usar ele
    if (calculatedPrice !== null && calculatedPrice > 0) {
      return {
        additionalNights,
        additionalAmount: calculatedPrice,
        newTotalAmount: (reservation?.total_amount || 0) + calculatedPrice,
      };
    }

    // Fallback: usar tarifa diária fixa da categoria
    const dailyRate = reservation?.room_categories?.daily_rate || 
                     reservation?.room_categories?.base_price || 
                     0;
    const additionalAmount = additionalNights * dailyRate;

    return {
      additionalNights,
      additionalAmount,
      newTotalAmount: (reservation?.total_amount || 0) + additionalAmount,
    };
  }, [newCheckoutDate, originalCheckout, reservation, calculatedPrice]);

  // Verificar disponibilidade antes de permitir extensão usando validateRoomAvailability
  const checkAvailability = async (): Promise<boolean> => {
    if (!newCheckoutDate || !originalCheckout || !reservation) {
      console.log("[checkAvailability] Dados insuficientes:", { newCheckoutDate, originalCheckout, reservation: !!reservation });
      return false;
    }

    try {
      const roomId = reservation.room_id;
      const categoryId = reservation.room_category_id || reservation.category_id;
      let establishmentId = reservation.establishment_id;

      if (!categoryId) {
        console.error("[checkAvailability] Categoria do quarto não encontrada");
        toast.error("Categoria do quarto não encontrada");
        return false;
      }

      // Se não encontrou establishment_id na reserva, buscar do contexto ou da categoria
      if (!establishmentId) {
        // Primeiro tentar do contexto
        establishmentId = getSelectedEstablishmentId();
        
        // Se ainda não encontrou, buscar diretamente da categoria
        if (!establishmentId) {
          try {
            const { data: category } = await supabase
              .from("room_categories")
              .select("building_id, establishment_id, buildings(establishment_id)")
              .eq("id", categoryId)
              .single();
            
            if (category) {
              if ((category as any).buildings && (category as any).buildings.establishment_id) {
                establishmentId = (category as any).buildings.establishment_id;
              } else if ((category as any).establishment_id) {
                establishmentId = (category as any).establishment_id;
              }
            }
          } catch (error) {
            console.warn("[checkAvailability] Erro ao buscar establishment_id da categoria:", error);
          }
        }
      }

      if (!establishmentId) {
        console.error("[checkAvailability] Estabelecimento não identificado");
        toast.error("Estabelecimento não identificado");
        return false;
      }

      // Se há roomId específico, usar validateRoomAvailability que é mais confiável
      if (roomId) {
        console.log("[checkAvailability] Verificando disponibilidade do quarto específico:", {
          roomId,
          originalCheckout: format(originalCheckout, "yyyy-MM-dd"),
          newCheckoutDate: format(newCheckoutDate, "yyyy-MM-dd"),
          reservationId: reservation.id
        });

        // Importar validateRoomAvailability
        const { validateRoomAvailability } = await import("@/lib/reservationUtils");
        
        // Verificar disponibilidade para o período completo (checkin original até novo checkout)
        // Mas precisamos do checkin original também
        const originalCheckin = reservation.checkin_date ? parseISO(reservation.checkin_date) : null;
        const checkinDate = originalCheckin ? format(startOfDay(originalCheckin), "yyyy-MM-dd") : format(startOfDay(originalCheckout), "yyyy-MM-dd");
        const checkoutDate = format(startOfDay(newCheckoutDate), "yyyy-MM-dd");

        console.log("[checkAvailability] Parâmetros para validateRoomAvailability:", {
          roomId,
          checkinDate,
          checkoutDate,
          excludeReservationId: reservation.id
        });

        const availabilityCheck = await validateRoomAvailability(
          roomId,
          checkinDate,
          checkoutDate,
          reservation.id // Excluir a reserva atual da verificação
        );

        console.log("[checkAvailability] Resultado da verificação:", {
          available: availabilityCheck.available,
          reason: availabilityCheck.reason,
          conflictingReservation: availabilityCheck.conflictingReservation
        });

        return availabilityCheck.available;
      }

      // Se não tem roomId específico, verificar disponibilidade na categoria
      console.log("[checkAvailability] Verificando disponibilidade na categoria:", {
        categoryId,
        originalCheckout: format(originalCheckout, "yyyy-MM-dd"),
        newCheckoutDate: format(newCheckoutDate, "yyyy-MM-dd"),
        reservationId: reservation.id
      });

      const extensionCheckin = format(startOfDay(originalCheckout), "yyyy-MM-dd");
      const extensionCheckout = format(startOfDay(newCheckoutDate), "yyyy-MM-dd");

      // Buscar todos os quartos da categoria que estão disponíveis
      let roomsQuery = supabase
        .from("rooms")
        .select("id, name, status, is_blocked")
        .eq("category_id", categoryId)
        .in("status", ["available", "cleaning"])
        .eq("is_blocked", false);

      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }

      const { data: rooms, error: roomsError } = await roomsQuery;

      if (roomsError) {
        console.error("[checkAvailability] Erro ao buscar quartos:", roomsError);
        throw roomsError;
      }

      if (!rooms || rooms.length === 0) {
        console.log("[checkAvailability] Nenhum quarto disponível na categoria");
        return false;
      }

      // Buscar todas as reservas que conflitam com o período de extensão na categoria
      let reservationsQuery = supabase
        .from("reservations")
        .select("id, room_id, checkin_date, checkout_date, status, notes")
        .eq("category_id", categoryId)
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"] as any)
        .neq("id", reservation.id) // Excluir a reserva atual
        .or(
          `and(checkin_date.lt.${extensionCheckout},checkout_date.gt.${extensionCheckin})`
        );

      if (establishmentId) {
        reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
      }

      const { data: conflictingReservations, error: reservationsError } = await reservationsQuery;

      if (reservationsError) {
        console.error("[checkAvailability] Erro ao buscar reservas conflitantes:", reservationsError);
        throw reservationsError;
      }

      console.log("[checkAvailability] Reservas conflitantes encontradas:", conflictingReservations?.length || 0);

      // Criar conjunto de quartos ocupados no período de extensão
      const occupiedRoomIds = new Set<string>();
      
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
      
      console.log("[checkAvailability] Quartos disponíveis na categoria:", {
        totalRooms: rooms.length,
        occupiedRooms: occupiedRoomIds.size,
        availableRooms: availableRooms.length
      });

      return availableRooms.length > 0;
    } catch (error: any) {
      console.error("[checkAvailability] Erro ao verificar disponibilidade:", error);
      toast.error("Erro ao verificar disponibilidade");
      return false;
    }
  };

  const handleRequestExtension = async () => {
    if (!newCheckoutDate || !calculation) {
      toast.error("Selecione uma data válida");
      return;
    }

    setLoading(true);
    try {
      console.log("[ExtendReservation] Iniciando solicitação de extensão:", {
        reservationId: reservation.id,
        newCheckoutDate: format(newCheckoutDate, "yyyy-MM-dd"),
        additionalNights: calculation.additionalNights,
        additionalAmount: calculation.additionalAmount,
        isStripeEnabled,
      });

      // Verificar disponibilidade antes de processar
      console.log("[ExtendReservation] Verificando disponibilidade...");
      const isAvailable = await checkAvailability();
      console.log("[ExtendReservation] Resultado da verificação de disponibilidade:", isAvailable);
      
      if (!isAvailable) {
        console.log("[ExtendReservation] Disponibilidade não confirmada, abrindo modal de contato");
        // Abrir modal de contato ao invés de mostrar toast
        setShowContactModal(true);
        setLoading(false);
        return;
      }

      console.log("[ExtendReservation] Disponibilidade confirmada, continuando...");

      // Criar registro de extensão (se a tabela existir)
      let extension = null;
      try {
        const { data: extData, error: extensionError } = await supabase
          .from("reservation_extensions" as any)
          .insert({
            reservation_id: reservation.id,
            original_checkout_date: format(originalCheckout!, "yyyy-MM-dd"),
            new_checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
            additional_nights: calculation.additionalNights,
            additional_amount: calculation.additionalAmount,
            status: "pending",
          })
          .select()
          .single();
        
        if (extensionError && extensionError.code !== '42P01') { // Ignorar se tabela não existir
          throw extensionError;
        }
        extension = extData;
        console.log("[ExtendReservation] Registro de extensão criado:", extension?.id);
      } catch (error: any) {
        // Se a tabela não existir, continuar sem criar registro
        if (error.code !== '42P01') {
          console.warn("[ExtendReservation] Tabela reservation_extensions não encontrada, continuando sem registro");
        }
      }

      // Verificar se Stripe está habilitado
      console.log("[ExtendReservation] Verificando se Stripe está habilitado:", {
        isStripeEnabled,
        globalConfig,
        establishmentConfig,
      });

      // Se Stripe está habilitado, abrir diálogo de pagamento
      if (isStripeEnabled) {
        console.log("[ExtendReservation] Stripe habilitado, abrindo diálogo de pagamento");
        setAvailabilityChecked(true);
        setPaymentDialogOpen(true);
        setLoading(false);
        return;
      }

      console.log("[ExtendReservation] Stripe não habilitado, criando extensão pendente");

      // Se Stripe não está habilitado, criar extensão pendente (comportamento antigo)
      // Registrar log de atividade (se possível)
      try {
        await logActivity({
          actionType: "reservation_updated" as any,
          entityType: "reservation",
          entityId: reservation.id,
          entityCode: reservation.reservation_code,
          description: `Extensão de reserva solicitada: ${calculation.additionalNights} noite(s) adicional(is)`,
          oldValues: {
            checkout_date: format(originalCheckout!, "yyyy-MM-dd"),
            total_amount: reservation.total_amount,
          },
          newValues: {
            checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
            total_amount: calculation.newTotalAmount,
          },
          metadata: {
            extension_id: extension?.id,
            requested_via: "web_checkin",
          },
        });
      } catch (error) {
        console.warn("Erro ao registrar log de atividade:", error);
      }

      toast.success(
        `Solicitação de extensão enviada! Valor adicional: R$ ${calculation.additionalAmount.toFixed(2)}`
      );
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao solicitar extensão:", error);
      toast.error(error.message || "Erro ao solicitar extensão");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <ContactUnavailableModal
      open={showContactModal}
      onOpenChange={setShowContactModal}
      categoryId={reservation?.room_category_id || reservation?.category_id}
      establishmentId={reservation?.establishment_id}
    />
    <Dialog open={open && !paymentDialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Estender Reserva</DialogTitle>
          <DialogDescription>
            Selecione a nova data de check-out para estender sua estadia
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Data atual de checkout */}
          <div>
            <Label>Check-out Atual</Label>
            <div className="mt-1 p-3 bg-slate-50 rounded-md">
              <p className="text-sm font-medium text-slate-900">
                {originalCheckout
                  ? format(originalCheckout, "dd/MM/yyyy", { locale: ptBR })
                  : "Não informado"}
              </p>
            </div>
          </div>

          {/* Nova data de checkout */}
          <div>
            <Label>Nova Data de Check-out</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !newCheckoutDate && "text-slate-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newCheckoutDate ? (
                    format(newCheckoutDate, "dd/MM/yyyy", { locale: ptBR })
                  ) : (
                    <span>Selecione uma data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newCheckoutDate}
                  onSelect={(date) => {
                    setNewCheckoutDate(date);
                  }}
                  disabled={(date) => {
                    if (date < minDate) return true;
                    const dateStr = format(date, "yyyy-MM-dd");
                    return occupiedDates.has(dateStr);
                  }}
                  modifiers={{
                    occupied: (date) => {
                      const dateStr = format(date, "yyyy-MM-dd");
                      return occupiedDates.has(dateStr);
                    },
                  }}
                  modifiersClassNames={{
                    occupied: "!bg-red-100 !text-red-700 !border-red-300",
                  }}
                  classNames={{
                    day_disabled: "!bg-red-100 !text-red-700 !border-red-300 opacity-75",
                  }}
                  classNames={{
                    day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
                  }}
                  defaultMonth={originalCheckout || new Date()}
                  initialFocus
                />
                {newCheckoutDate && (
                  <div className="p-3 border-t">
                    <Button
                      onClick={() => setCalendarOpen(false)}
                      className="w-full"
                      size="sm"
                    >
                      OK
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Cálculo */}
          {calculation && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md space-y-2">
              {isCalculatingPrice && (
                <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Calculando preço do tarifário...</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Noites adicionais:</span>
                <span className="font-semibold">{calculation.additionalNights}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Valor adicional:</span>
                <span className="font-semibold">
                  R$ {calculation.additionalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-blue-200">
                <span className="font-semibold text-slate-900">Novo total:</span>
                <span className="font-bold text-blue-600">
                  R$ {calculation.newTotalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Aviso */}
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              A extensão está sujeita à disponibilidade e confirmação do hotel. Você
              receberá uma confirmação por email.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleRequestExtension}
            disabled={!calculation || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              "Solicitar Extensão"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {isStripeEnabled && availabilityChecked && newCheckoutDate && calculation && (
      <StripeProvider>
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={(open) => {
            setPaymentDialogOpen(open);
            if (!open) {
              setAvailabilityChecked(false);
              onOpenChange(false);
            }
          }}
          amount={calculation.additionalAmount}
          currency="BRL"
          paymentType="extension"
          reservationId={reservation.id}
          guestId={reservation.guest_id}
          description={`Extensão de reserva por ${calculation.additionalNights} noite(s) até ${format(newCheckoutDate, "dd/MM/yyyy", { locale: ptBR })}`}
          establishmentId={reservation.establishment_id}
          metadata={{
            checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
            total_amount: String(calculation.newTotalAmount),
          }}
          onSuccess={async () => {
            // Após pagamento bem-sucedido, atualizar a reserva
            try {
              console.log("[ExtendReservation] Atualizando reserva após pagamento:", {
                reservation_id: reservation.id,
                checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
                total_amount: calculation.newTotalAmount,
              });

              const { error: updateError, data: updatedReservation } = await supabase
                .from("reservations")
                .update({
                  checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
                  total_amount: calculation.newTotalAmount,
                })
                .eq("id", reservation.id)
                .select();

              if (updateError) {
                console.error("[ExtendReservation] Erro ao atualizar reserva:", updateError);
                throw updateError;
              }

              console.log("[ExtendReservation] ✅ Reserva atualizada com sucesso:", updatedReservation);

              // Registrar log de atividade (se possível)
              try {
                await logActivity({
                  actionType: "reservation_updated" as any,
                  entityType: "reservation",
                  entityId: reservation.id,
                  entityCode: reservation.reservation_code,
                  description: `Extensão de reserva confirmada e paga: ${calculation.additionalNights} noite(s) adicional(is)`,
                  oldValues: {
                    checkout_date: format(originalCheckout!, "yyyy-MM-dd"),
                    total_amount: reservation.total_amount,
                  },
                  newValues: {
                    checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
                    total_amount: calculation.newTotalAmount,
                  },
                  metadata: {
                    requested_via: "web_checkin",
                    paid_via_stripe: true,
                  },
                });
              } catch (error) {
                console.warn("Erro ao registrar log de atividade:", error);
              }

              toast.success("Extensão confirmada e paga com sucesso!");
              
              // Invalidar todas as queries relacionadas a reservas
              const establishmentId = reservation.establishment_id || getSelectedEstablishmentId();
              queryClient.invalidateQueries({ queryKey: ["reservations"] });
              queryClient.invalidateQueries({ queryKey: ["reservations", establishmentId] });
              queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
              queryClient.invalidateQueries({ queryKey: ["rooms"] });
              queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
              
              onSuccess?.();
              setPaymentDialogOpen(false);
              setAvailabilityChecked(false);
              onOpenChange(false);
            } catch (error: any) {
              console.error("Erro ao atualizar reserva após pagamento:", error);
              toast.error("Pagamento confirmado, mas houve erro ao atualizar a reserva. Entre em contato com o hotel.");
            }
          }}
        />
      </StripeProvider>
    )}
    </>
  );
}

