import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePricing } from "@/hooks/usePricing";
import { useChannelManager } from "@/hooks/useChannelManager";
import { useRateSystem } from "@/hooks/useRateSystem";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { formatCurrency, validateRoomAvailability, validateCategoryAvailability } from "@/lib/reservationUtils";
import { Loader2, Calendar, Edit2, AlertTriangle, Ban, Wrench } from "lucide-react";
import { format, addDays, startOfDay, isBefore, differenceInDays, parseISO } from "date-fns";
import type { RateCalendarEntry } from "@/hooks/useRateSystem";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface QuickReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: (data: {
    checkin_date: string;
    checkout_date: string;
    category_id: string;
    room_id?: string;
    channel: string;
    pricing_plan_id?: string;
    adults: number;
    children: number;
    total_amount: number;
    action: "confirmed" | "blocked" | "preregistration";
  }) => void;
  /** Abre o modal Abrir Chamado (manutenção) sem criar reserva */
  onOpenMaintenance?: (data: { room_id: string }) => void;
  initialData: {
    checkin_date: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
  };
  /** rate_calendar do mapa (quando aberto a partir dele) para exibir preço imediato */
  rateCalendar?: RateCalendarEntry[];
}

/** Soma base_price do rate_calendar para todas as noites da estadia (mesma lógica do mapa de tarifas) */
function getInstantPriceFromRateCalendar(
  rateCalendar: RateCalendarEntry[],
  categoryId: string,
  planId: string,
  checkinDateStr: string,
  checkoutDateStr: string
): number | null {
  if (!rateCalendar?.length || !categoryId || !planId || !checkinDateStr || !checkoutDateStr) return null;
  const [cy, cm, cd] = checkinDateStr.split("-").map(Number);
  const [ey, em, ed] = checkoutDateStr.split("-").map(Number);
  const checkin = startOfDay(new Date(cy, cm - 1, cd));
  const checkout = startOfDay(new Date(ey, em - 1, ed));
  const nights = differenceInDays(checkout, checkin);
  if (nights <= 0) return null;
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const d = addDays(checkin, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const entry = rateCalendar.find(
      (r) => r.pricing_plan_id === planId && r.category_id === categoryId && r.date === dateStr
    );
    if (!entry?.base_price || entry.base_price <= 0) return null;
    total += entry.base_price;
  }
  return Math.round(total * 100) / 100;
}

export const QuickReservationDialog = ({
  open,
  onOpenChange,
  onProceed,
  onOpenMaintenance,
  initialData,
  rateCalendar,
}: QuickReservationDialogProps) => {
  const { calculatePrice } = usePricing();
  const { channels } = useChannelManager();
  const { ratePlans } = useRateSystem();
  const { canCreate, canAccess, role } = usePermissions();
  const { customPermissions } = useCurrentEmployeeRole();
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [showPastDateAlert, setShowPastDateAlert] = useState(false);
  const [pendingAction, setPendingAction] = useState<"confirmed" | "blocked" | "preregistration" | null>(null);
  const [isManualEdit, setIsManualEdit] = useState(false); // Rastrear se o usuário editou manualmente
  const [calculatedPrice, setCalculatedPrice] = useState(0); // Armazenar o preço calculado para comparação
  const [showLowPriceAlert, setShowLowPriceAlert] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Determinar se o usuário só pode bloquear (não pode criar reservas)
  // IMPORTANTE: Verificar explicitamente que NÃO pode criar, mas PODE bloquear
  // Usar useMemo para recalcular quando as permissões mudarem
  // Depender de role e customPermissions para garantir que seja recalculado quando mudarem
  const canOnlyBlock = useMemo(() => {
    // Calcular valores reais das permissões dentro do useMemo
    const canCreateReservations = canCreate("reservations");
    const canBlockReservations = canAccess("reservations", "block");
    // Só mostrar modal simplificado se NÃO pode criar E pode bloquear
    return !canCreateReservations && canBlockReservations;
  }, [canCreate, canAccess, role, customPermissions]);

  // Calcular valores das permissões para uso no componente
  // Isso garante que os valores sejam recalculados quando as permissões mudarem
  const hasCreatePermission = useMemo(() => canCreate("reservations"), [canCreate, role, customPermissions]);
  const hasBlockPermission = useMemo(() => canAccess("reservations", "block"), [canAccess, role, customPermissions]);
  const hasMaintenancePermission = useMemo(
    () =>
      canAccess("maintenance") ||
      canCreate("maintenance") ||
      canCreate("reservations") ||
      canAccess("reservations", "block"),
    [canAccess, canCreate, role, customPermissions]
  );

  const handleOpenMaintenance = () => {
    if (!initialData.room_id) {
      toast.error("Selecione um quarto específico para abrir um chamado de manutenção");
      return;
    }
    onOpenChange(false);
    onOpenMaintenance?.({ room_id: initialData.room_id });
  };

  // Função auxiliar para obter o plano padrão
  const getDefaultPlanId = (plans: typeof ratePlans) => {
    if (plans.length === 0) return "";
    const barPlan = plans.find(plan => plan.is_active && plan.code === "BAR");
    if (barPlan) return barPlan.id;
    const firstActivePlan = plans.find(plan => plan.is_active);
    return firstActivePlan?.id || "";
  };

  // Função auxiliar para calcular checkout_date a partir de checkin_date
  const calculateCheckoutDate = (checkinDateStr: string): string => {
    if (!checkinDateStr) return format(addDays(new Date(), 1), "yyyy-MM-dd");
    const [year, month, day] = checkinDateStr.split('-').map(Number);
    const checkinDate = new Date(year, month - 1, day);
    return format(addDays(checkinDate, 1), "yyyy-MM-dd");
  };

  const [formData, setFormData] = useState({
    channel: "direct",
    pricing_plan_id: "",
    checkin_date: initialData.checkin_date || "",
    checkout_date: initialData.checkout_date || calculateCheckoutDate(initialData.checkin_date || ""),
    adults: 1,
    children: 0,
    total_amount: 0,
  });

  // Garantir que sempre tenha um plano selecionado quando os planos forem carregados
  useEffect(() => {
    if (ratePlans.length > 0 && !formData.pricing_plan_id) {
      const defaultPlanId = getDefaultPlanId(ratePlans);
      if (defaultPlanId) {
        setFormData(prev => ({ ...prev, pricing_plan_id: defaultPlanId }));
      }
    }
  }, [ratePlans]);

  // Buscar categoria e quarto selecionados
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
    enabled: !!initialData.category_id,
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
      
      // Verificar se o quarto está interditado
      if (data?.is_blocked === true) {
        toast.error("Este quarto está interditado e não pode receber reservas");
        onOpenChange(false);
        return null;
      }
      
      return data;
    },
    enabled: !!initialData.room_id,
  });

  // Calcular preço automaticamente quando mudar datas ou categoria (apenas se não for modo apenas bloqueio)
  useEffect(() => {
    // Se for apenas bloqueio, não calcular preço
    if (canOnlyBlock) {
      return;
    }
    if (!open) {
      setCalculatingPrice(false);
      setIsManualEdit(false); // Resetar ao fechar
      return;
    }
    
    if (!initialData.category_id || !formData.checkin_date || !formData.checkout_date) {
      setCalculatingPrice(false);
      return;
    }

    // Se o usuário editou manualmente, não sobrescrever o valor
    if (isManualEdit) {
      return;
    }

    let cancelled = false;

    // Preço imediato do rate_calendar quando disponível (evita delay inicial)
    const planId = formData.pricing_plan_id || "";
    let hasInstantPrice = false;
    if (rateCalendar && planId) {
      const instant = getInstantPriceFromRateCalendar(
        rateCalendar,
        initialData.category_id,
        planId,
        formData.checkin_date,
        formData.checkout_date
      );
      if (instant != null) {
        hasInstantPrice = true;
        setFormData((prev) => (prev.total_amount !== instant ? { ...prev, total_amount: instant } : prev));
        setCalculatingPrice(false); // Desbloquear botões — preço já disponível
      }
    }

    const calculateTotal = async () => {
      if (cancelled) return;
      // Só mostrar spinner se não temos preço instantâneo — evita bloquear botões quando rate_calendar já preencheu
      if (!hasInstantPrice) setCalculatingPrice(true);
      try {
        let total = 0;
        
        // Usar cálculo padrão com plano tarifário selecionado
        total = await calculatePrice(
          initialData.category_id,
          formData.checkin_date,
          formData.checkout_date,
          undefined,
          formData.pricing_plan_id || undefined,
          undefined,
          formData.adults,
          formData.children
        );

        if (cancelled) return;

        // Arredondar para 2 casas decimais
        const roundedTotal = Math.round(total * 100) / 100;
        setCalculatedPrice(roundedTotal); // Armazenar o preço calculado
        setFormData((prev) => {
          // Só atualizar se o valor mudou para evitar loops
          if (prev.total_amount !== roundedTotal) {
            return { ...prev, total_amount: roundedTotal };
          }
          return prev;
        });
      } catch (error) {
        console.error("Erro ao calcular preço:", error);
        if (cancelled) return;
        
        // Em caso de erro, usar preço base da categoria
        if (category?.base_price) {
          // Calcular dias usando parse local para evitar problemas de timezone
          const [checkinYear, checkinMonth, checkinDay] = formData.checkin_date.split('-').map(Number);
          const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkout_date.split('-').map(Number);
          const checkinDate = new Date(checkinYear, checkinMonth - 1, checkinDay);
          const checkoutDate = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
          const days = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
          setFormData((prev) => {
            const fallbackTotal = Number(category.base_price) * days;
            // Arredondar para 2 casas decimais
            const roundedFallbackTotal = Math.round(fallbackTotal * 100) / 100;
            if (prev.total_amount !== roundedFallbackTotal) {
              return { ...prev, total_amount: roundedFallbackTotal };
            }
            return prev;
          });
        }
      } finally {
        if (!cancelled) {
          setCalculatingPrice(false);
        }
      }
    };

    // Adicionar um pequeno delay para evitar cálculos muito frequentes
    const timeoutId = setTimeout(() => {
      calculateTotal();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      setCalculatingPrice(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData.category_id, formData.checkin_date, formData.checkout_date, formData.pricing_plan_id, formData.adults, formData.children, isManualEdit, canOnlyBlock, rateCalendar]);

  // Resetar formulário quando abrir
  useEffect(() => {
    if (open) {
      // Calcular checkout_date usando parse local da checkin_date
      let checkoutDate = initialData.checkout_date;
      if (!checkoutDate && initialData.checkin_date) {
        checkoutDate = calculateCheckoutDate(initialData.checkin_date);
      } else if (!checkoutDate) {
        checkoutDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
      }
      
      // Selecionar o primeiro plano ativo por padrão, ou o plano BAR se existir
      let defaultPlanId = "";
      if (ratePlans.length > 0) {
        const barPlan = ratePlans.find(plan => plan.is_active && plan.code === "BAR");
        if (barPlan) {
          defaultPlanId = barPlan.id;
        } else {
          const firstActivePlan = ratePlans.find(plan => plan.is_active);
          if (firstActivePlan) {
            defaultPlanId = firstActivePlan.id;
          }
        }
      }
      const planId = defaultPlanId || "";
      const checkin = initialData.checkin_date || "";
      const checkout = checkoutDate || "";

      // Preço imediato do rate_calendar (alinhado ao mapa de tarifas) enquanto o batch calcula
      const instantTotal = rateCalendar && initialData.category_id && planId
        ? getInstantPriceFromRateCalendar(rateCalendar, initialData.category_id, planId, checkin, checkout)
        : null;

      setFormData(prev => ({
        ...prev,
        channel: "direct",
        pricing_plan_id: planId || prev.pricing_plan_id || "",
        checkin_date: checkin || prev.checkin_date || "",
        checkout_date: checkout || prev.checkout_date || "",
        adults: prev.adults || 1,
        children: prev.children || 0,
        total_amount: instantTotal ?? prev.total_amount ?? 0,
      }));
      setCalculatingPrice(false); // Resetar estado de carregamento
      setIsManualEdit(false); // Resetar flag de edição manual
      setCalculatedPrice(0); // Resetar preço calculado
    }
  }, [open, initialData.checkin_date, initialData.checkout_date, initialData.category_id, ratePlans, rateCalendar]);

  const handleProceed = async (action: "confirmed" | "blocked" | "preregistration") => {
    // Verificar permissões antes de prosseguir
    if (action === "blocked") {
      // Para bloquear, verificar permissão específica de bloquear
      if (!canAccess("reservations", "block")) {
        toast.error("Você não tem permissão para bloquear quartos");
        return;
      }
    } else {
      // Para criar reservas normais, verificar permissão de criar
      if (!canCreate("reservations")) {
        toast.error("Você não tem permissão para criar reservas");
        return;
      }
    }
    
    // Validações básicas
    if (!initialData.category_id || !formData.checkin_date || !formData.checkout_date) {
      toast.error("Por favor, preencha todas as datas");
      return;
    }
    
    // Para bloqueio, não precisa de plano tarifário
    // Para outras ações, precisa de plano tarifário
    if (action !== "blocked" && !formData.pricing_plan_id) {
      toast.error("Por favor, selecione um plano tarifário");
      return;
    }

    // Verificar se a data de check-in é no passado
    // Criar data no timezone local para evitar problemas de conversão UTC
    // Parse da string "yyyy-MM-dd" como data local (não UTC)
    const [year, month, day] = formData.checkin_date.split('-').map(Number);
    const checkinDate = startOfDay(new Date(year, month - 1, day));
    const today = startOfDay(new Date());
    
    // Para bloqueio, simplificar o processo (não precisa validar disponibilidade nem data passada)
    if (action === "blocked") {
      onProceed({
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        category_id: initialData.category_id,
        room_id: initialData.room_id,
        channel: "direct", // Bloqueio sempre é direto
        pricing_plan_id: undefined, // Não precisa de plano para bloqueio
        adults: 0, // Não precisa de hóspedes para bloqueio
        children: 0,
        total_amount: 0, // Não precisa de valor para bloqueio
        action: "blocked",
      });
      return;
    }
    
    // Para reservas normais, verificar se a data de check-in é no passado
    if (isBefore(checkinDate, today)) {
      // Data no passado: mostrar alerta
      setPendingAction(action);
      setShowPastDateAlert(true);
      return;
    }

    // Verificar disponibilidade antes de prosseguir (mesma lógica do web check-in)
    setCheckingAvailability(true);
    try {
      let isAvailable = false;
      
      if (initialData.room_id) {
        // Validar disponibilidade do quarto específico
        const availabilityCheck = await validateRoomAvailability(
          initialData.room_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
          setCheckingAvailability(false);
          return;
        }
        
        isAvailable = true;
      } else {
        // Validar disponibilidade por categoria
        const categoryAvailability = await validateCategoryAvailability(
          initialData.category_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!categoryAvailability.available) {
          toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
          setCheckingAvailability(false);
          return;
        }
        
        isAvailable = true;
      }
      
      if (!isAvailable) {
        setCheckingAvailability(false);
        return;
      }
      
      // Para reservas normais, validar valor e outros campos
      // Usar o valor do formData (manual ou calculado)
      // Se foi editado manualmente e tem valor > 0, usar o valor manual
      // Caso contrário, usar o valor calculado ou o valor do formData
      const finalAmount = isManualEdit && formData.total_amount > 0 
        ? formData.total_amount 
        : (calculatedPrice > 0 ? calculatedPrice : formData.total_amount);
      
      // Verificar se o valor é muito baixo (menor que 50% do calculado)
      // Só mostrar alerta se houver um valor calculado válido e o usuário editou manualmente
      if (calculatedPrice > 0 && isManualEdit && finalAmount > 0 && finalAmount < calculatedPrice * 0.5) {
        setPendingAction(action);
        setShowLowPriceAlert(true);
        setCheckingAvailability(false);
        return;
      }
      
      // Verificar novamente se o quarto está interditado antes de prosseguir
      if (initialData.room_id && room?.is_blocked === true) {
        toast.error("Este quarto está interditado e não pode receber reservas");
        setCheckingAvailability(false);
        return;
      }
      
      onProceed({
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        category_id: initialData.category_id,
        room_id: initialData.room_id,
        channel: formData.channel,
        // Preservar pricing_plan_id mesmo se for string vazia (será tratado como não selecionado)
        pricing_plan_id: formData.pricing_plan_id && formData.pricing_plan_id.trim() !== "" ? formData.pricing_plan_id : undefined,
        adults: formData.adults,
        children: formData.children,
        total_amount: finalAmount,
        action,
      });
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      toast.error("Erro ao verificar disponibilidade. Tente novamente.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Função auxiliar para prosseguir com valor baixo após confirmação
  const handleProceedWithLowPrice = async (action: "confirmed" | "blocked" | "preregistration") => {
    // Verificar permissões antes de prosseguir
    if (action === "blocked") {
      if (!canAccess("reservations", "block")) {
        toast.error("Você não tem permissão para bloquear quartos");
        return;
      }
    } else {
      if (!canCreate("reservations")) {
        toast.error("Você não tem permissão para criar reservas");
        return;
      }
    }
    if (!initialData.category_id || !formData.checkin_date || !formData.checkout_date) {
      return;
    }

    // Para bloqueio, simplificar o processo (não precisa validar disponibilidade)
    if (action === "blocked") {
      onProceed({
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        category_id: initialData.category_id,
        room_id: initialData.room_id,
        channel: "direct",
        pricing_plan_id: undefined,
        adults: 0,
        children: 0,
        total_amount: 0,
        action: "blocked",
      });
      return;
    }

    setCheckingAvailability(true);
    try {
      // Verificar disponibilidade
      let isAvailable = false;
      
      if (initialData.room_id) {
        const availabilityCheck = await validateRoomAvailability(
          initialData.room_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
          setCheckingAvailability(false);
          return;
        }
        
        isAvailable = true;
      } else {
        const categoryAvailability = await validateCategoryAvailability(
          initialData.category_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!categoryAvailability.available) {
          toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
          setCheckingAvailability(false);
          return;
        }
        
        isAvailable = true;
      }
      
      if (!isAvailable) {
        setCheckingAvailability(false);
        return;
      }
      
      // Verificar se o quarto está interditado
      if (initialData.room_id && room?.is_blocked === true) {
        toast.error("Este quarto está interditado e não pode receber reservas");
        setCheckingAvailability(false);
        return;
      }
      
      // Usar o valor manual confirmado pelo usuário
      const finalAmount = formData.total_amount > 0 ? formData.total_amount : calculatedPrice;
      
      onProceed({
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        category_id: initialData.category_id,
        room_id: initialData.room_id,
        channel: formData.channel,
        pricing_plan_id: formData.pricing_plan_id && formData.pricing_plan_id.trim() !== "" ? formData.pricing_plan_id : undefined,
        adults: formData.adults,
        children: formData.children,
        total_amount: finalAmount,
        action,
      });
      
      setPendingAction(null);
    } catch (error: any) {
      console.error("Erro ao prosseguir com valor baixo:", error);
      toast.error("Erro ao processar reserva. Tente novamente.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleConfirmPastDate = async () => {
    if (!pendingAction || !initialData.category_id || !formData.checkin_date || !formData.checkout_date) {
      setShowPastDateAlert(false);
      setPendingAction(null);
      return;
    }

    // Verificar disponibilidade mesmo para datas no passado
    setCheckingAvailability(true);
    try {
      let isAvailable = false;
      
      if (initialData.room_id) {
        // Validar disponibilidade do quarto específico
        const availabilityCheck = await validateRoomAvailability(
          initialData.room_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
          setCheckingAvailability(false);
          setShowPastDateAlert(false);
          setPendingAction(null);
          return;
        }
        
        isAvailable = true;
      } else {
        // Validar disponibilidade por categoria
        const categoryAvailability = await validateCategoryAvailability(
          initialData.category_id,
          formData.checkin_date,
          formData.checkout_date
        );
        
        if (!categoryAvailability.available) {
          toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
          setCheckingAvailability(false);
          setShowPastDateAlert(false);
          setPendingAction(null);
          return;
        }
        
        isAvailable = true;
      }
      
      if (!isAvailable) {
        setCheckingAvailability(false);
        setShowPastDateAlert(false);
        setPendingAction(null);
        return;
      }
      
      // Prosseguir mesmo com data no passado (após verificar disponibilidade)
      // Usar o valor do formData (manual ou calculado)
      const finalAmount = isManualEdit && formData.total_amount > 0 
        ? formData.total_amount 
        : (calculatedPrice > 0 ? calculatedPrice : formData.total_amount);
      
      // Verificar se o valor é muito baixo (menor que 50% do calculado)
      // Só mostrar alerta se houver um valor calculado válido e o usuário editou manualmente
      if (calculatedPrice > 0 && isManualEdit && finalAmount > 0 && finalAmount < calculatedPrice * 0.5) {
        setShowLowPriceAlert(true);
        setCheckingAvailability(false);
        setShowPastDateAlert(false);
        return;
      }
      
      // Verificar novamente se o quarto está interditado antes de prosseguir
      if (initialData.room_id && room?.is_blocked === true) {
        toast.error("Este quarto está interditado e não pode receber reservas");
        setCheckingAvailability(false);
        setShowPastDateAlert(false);
        setPendingAction(null);
        return;
      }
      
      onProceed({
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        category_id: initialData.category_id,
        room_id: initialData.room_id,
        channel: formData.channel,
        pricing_plan_id: formData.pricing_plan_id || undefined,
        adults: formData.adults,
        children: formData.children,
        total_amount: finalAmount,
        action: pendingAction,
      });
      
      setShowPastDateAlert(false);
      setPendingAction(null);
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      toast.error("Erro ao verificar disponibilidade. Tente novamente.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-xl border-slate-200 shadow-xl">
        <DialogHeader className="px-5 pt-5 pb-3.5 border-b border-slate-100 bg-slate-50/60">
          <DialogTitle className="text-base font-semibold text-slate-900">
            {canOnlyBlock 
              ? `Bloquear Quarto${room ? ` - ${room.room_number}` : category ? ` - ${category.name}` : ""}`
              : category?.name || "Categoria"
            }
            {!canOnlyBlock && room && (
              <span className="text-sm text-slate-500 font-normal ml-2">
                · {room.name || room.room_number}
              </span>
            )}
          </DialogTitle>
          {formData.checkin_date && formData.checkout_date && (
            <p className="text-xs text-slate-500 mt-1.5 font-normal">
              {format(parseISO(formData.checkin_date), "dd MMM", { locale: ptBR })}
              {" → "}
              {format(parseISO(formData.checkout_date), "dd MMM", { locale: ptBR })}
              <span className="mx-1.5 text-slate-300">•</span>
              {Math.max(0, differenceInDays(parseISO(formData.checkout_date), parseISO(formData.checkin_date)))}{" "}
              {Math.max(0, differenceInDays(parseISO(formData.checkout_date), parseISO(formData.checkin_date))) === 1
                ? "noite"
                : "noites"}
            </p>
          )}
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {canOnlyBlock ? (
            // Modo simplificado para camareira (apenas bloqueio)
            <>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Bloqueio de Quarto:</strong> Selecione o período em que o quarto estará indisponível.
                </p>
              </div>
              
              {/* Check-in e Check-out */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkin_date" className="text-sm">Data Início *</Label>
                  <div className="mt-1 relative">
                    <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="checkin_date"
                      type="date"
                      value={formData.checkin_date}
                      onChange={(e) => {
                        const newCheckin = e.target.value;
                        const nextCheckout = newCheckin ? calculateCheckoutDate(newCheckin) : formData.checkout_date;
                        setFormData({
                          ...formData,
                          checkin_date: newCheckin,
                          checkout_date: nextCheckout,
                        });
                      }}
                      className="pl-9 h-9"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="checkout_date" className="text-sm">Data Fim *</Label>
                  <div className="mt-1 relative">
                    <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="checkout_date"
                      type="date"
                      value={formData.checkout_date}
                      onChange={(e) => setFormData({ ...formData, checkout_date: e.target.value })}
                      className="pl-9 h-9"
                      min={formData.checkin_date}
                      required
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Modo completo para usuários que podem criar reservas
            <>
              {/* Canal e Plano de Tarifa */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="channel" className="text-sm">Canal</Label>
                  <Select
                    value={formData.channel}
                    onValueChange={(value) => setFormData({ ...formData, channel: value })}
                  >
                    <SelectTrigger id="channel" className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direto</SelectItem>
                      <SelectItem value="booking">Booking.com</SelectItem>
                      <SelectItem value="airbnb">Airbnb</SelectItem>
                      <SelectItem value="expedia">Expedia</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                      {channels.map((channel: any) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="pricing_plan" className="text-sm">Plano de Tarifa *</Label>
                  <Select
                    value={formData.pricing_plan_id}
                    onValueChange={(value) => setFormData({ ...formData, pricing_plan_id: value })}
                    disabled={ratePlans.filter(plan => plan.is_active).length === 0}
                  >
                    <SelectTrigger id="pricing_plan" className="mt-1 h-9">
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {ratePlans
                        .filter(plan => plan.is_active)
                        .map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} {plan.code ? `(${plan.code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Check-in e Check-out */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkin_date" className="text-sm">Check In</Label>
                  <div className="mt-1 relative">
                    <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="checkin_date"
                      type="date"
                      value={formData.checkin_date}
                      onChange={(e) => {
                        const newCheckin = e.target.value;
                        const nextCheckout = newCheckin ? calculateCheckoutDate(newCheckin) : formData.checkout_date;
                        setFormData({
                          ...formData,
                          checkin_date: newCheckin,
                          checkout_date: nextCheckout,
                        });
                      }}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="checkout_date" className="text-sm">Check Out</Label>
                  <div className="mt-1 relative">
                    <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="checkout_date"
                      type="date"
                      value={formData.checkout_date}
                      onChange={(e) => setFormData({ ...formData, checkout_date: e.target.value })}
                      className="pl-9 h-9"
                      min={formData.checkin_date}
                    />
                  </div>
                </div>
              </div>

              {/* Qtd de Hóspedes e Valor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="adults" className="text-sm">Qtd de Hóspedes</Label>
                  <Input
                    id="adults"
                    type="number"
                    min="1"
                    value={formData.adults}
                    onChange={(e) => setFormData({ ...formData, adults: parseInt(e.target.value) || 1 })}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="total_amount" className="text-sm">Valor</Label>
                  <div className="mt-1 relative">
                    <Input
                      id="total_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.total_amount > 0 ? Number(formData.total_amount.toFixed(2)) : formData.total_amount}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value) || 0;
                        setIsManualEdit(true); // Marcar como edição manual
                        setFormData({ ...formData, total_amount: newValue });
                        // Removida validação durante digitação - será validada apenas ao clicar em reservar
                      }}
                      onBlur={(e) => {
                        // Garantir que o valor manual seja preservado ao sair do campo
                        const newValue = parseFloat(e.target.value) || 0;
                        if (isManualEdit && newValue > 0) {
                          // Arredondar para 2 casas decimais ao sair do campo
                          const roundedValue = Math.round(newValue * 100) / 100;
                          setFormData(prev => ({ ...prev, total_amount: roundedValue }));
                        }
                      }}
                      className="pr-9 h-9"
                    />
                    <Edit2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    {calculatingPrice && (
                      <Loader2 className="absolute right-8 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {!calculatingPrice && formData.total_amount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(formData.total_amount)}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="px-5 pb-5 pt-3.5 border-t border-slate-100 bg-white">
          {canOnlyBlock ? (
            // Modo simplificado: apenas botão de bloquear (quando só pode bloquear)
            <Button
              onClick={() => handleProceed("blocked")}
              disabled={checkingAvailability || !formData.checkin_date || !formData.checkout_date}
              className="w-full h-10 bg-slate-800 hover:bg-slate-900 text-white shadow-sm"
            >
              {checkingAvailability ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Bloquear Quarto
                </>
              )}
            </Button>
          ) : (
            // Modo completo: mostrar botões de acordo com as permissões
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hasCreatePermission && (
                <>
                  <Button
                    onClick={() => handleProceed("confirmed")}
                    disabled={calculatingPrice || checkingAvailability}
                    className="w-full h-10 bg-sky-600 hover:bg-sky-700 text-white shadow-sm"
                  >
                    {checkingAvailability ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      "+ Nova reserva"
                    )}
                  </Button>
                  <Button
                    onClick={() => handleProceed("preregistration")}
                    disabled={calculatingPrice || checkingAvailability}
                    variant="outline"
                    className="w-full h-10 bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200"
                  >
                    {checkingAvailability ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      "Pré-reserva"
                    )}
                  </Button>
                </>
              )}
              {hasBlockPermission && (
                <Button
                  onClick={() => handleProceed("blocked")}
                  disabled={calculatingPrice || checkingAvailability}
                  variant="outline"
                  className="w-full h-10 bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                >
                  {checkingAvailability ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-2" />
                      Bloquear
                    </>
                  )}
                </Button>
              )}
              {hasMaintenancePermission && onOpenMaintenance && (
                <Button
                  type="button"
                  onClick={handleOpenMaintenance}
                  disabled={calculatingPrice || checkingAvailability}
                  variant="outline"
                  className="w-full h-10 bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                >
                  <Wrench className="h-4 w-4 mr-2 shrink-0" />
                  Manutenção
                </Button>
              )}
              {/* Se não tiver nenhuma permissão, mostrar mensagem */}
              {!hasCreatePermission && !hasBlockPermission && !hasMaintenancePermission && (
                <div className="col-span-full w-full p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">
                    Você não tem permissão para criar reservas, bloquear quartos ou abrir manutenção.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Alerta para valor muito baixo */}
      <AlertDialog open={showLowPriceAlert} onOpenChange={setShowLowPriceAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold">
                Atenção: Valor Abaixo do Tarifário
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              O valor inserido (R$ {formData.total_amount.toFixed(2).replace('.', ',')}) está significativamente abaixo do valor calculado pelo tarifário (R$ {calculatedPrice.toFixed(2).replace('.', ',')}).
              <br /><br />
              Deseja continuar mesmo assim? Esta ação pode ser útil para descontos especiais ou ajustes manuais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowLowPriceAlert(false);
              // Restaurar o valor calculado
              setFormData(prev => ({ ...prev, total_amount: calculatedPrice }));
              setIsManualEdit(false);
            }}>
              Usar Valor do Tarifário
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const actionToProceed = pendingAction;
                setShowLowPriceAlert(false);
                // Manter o valor manual e garantir que não seja sobrescrito
                setIsManualEdit(true);
                
                // Prosseguir com a ação pendente após confirmar o valor baixo
                if (actionToProceed) {
                  await handleProceedWithLowPrice(actionToProceed);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Continuar com Valor Manual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alerta para data no passado */}
      <AlertDialog open={showPastDateAlert} onOpenChange={setShowPastDateAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold">
                Atenção: Data de Check-in no Passado
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              Você está tentando criar uma reserva com data de check-in no passado ({formData.checkin_date ? (() => {
                const [year, month, day] = formData.checkin_date.split('-').map(Number);
                return format(new Date(year, month - 1, day), "dd/MM/yyyy", { locale: ptBR });
              })() : ""}).
              <br /><br />
              Deseja continuar mesmo assim? Esta ação pode ser útil para registrar reservas retroativas ou ajustes de histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPastDateAlert(false);
              setPendingAction(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPastDate}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Continuar Mesmo Assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
