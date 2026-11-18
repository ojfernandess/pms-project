import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, eachDayOfInterval, parseISO, startOfDay, isSameDay, differenceInDays, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, GripVertical, X, Lock, User, Users, Wrench, LogIn, LogOut, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservations } from "@/hooks/useReservations";
import { usePricing } from "@/hooks/usePricing";
import { validateRoomAvailability, formatCurrency, isPaymentRefundRecord, getRefundedPaymentId, toFiniteNumber } from "@/lib/reservationUtils";
import { recordProcessedRefund } from "@/services/financial/refundService";
import { useRateSystem } from "@/hooks/useRateSystem";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { logActivity, createMoveDescription, createSwapDescription } from "@/lib/activityLogger";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";
import { usePermissions } from "@/hooks/usePermissions";
import { useHotelSettings } from "@/hooks/useHotelSettings";
import { QuickReservationDialog } from "./QuickReservationDialog";
import { ReservationQuickViewModal } from "./ReservationQuickViewModal";
import { ReservationTransferModal } from "./ReservationTransferModal";
import { ReservationReallocationModal } from "./ReservationReallocationModal";
import { ReservationPaymentModal } from "./ReservationPaymentModal";
import { BlockViewDialog } from "./BlockViewDialog";
import { RatePlansModal } from "./RatePlansModal";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Quarto interditado manualmente ou em manutenção ativa. */
const isRoomUnavailableForBooking = (room: { is_blocked?: boolean | null; status?: string | null } | null | undefined) =>
  room?.is_blocked === true || room?.status === "maintenance";

const isRoomInMaintenance = (room: { status?: string | null } | null | undefined) =>
  room?.status === "maintenance";

const getRoomUnavailableMessage = (room: { is_blocked?: boolean | null; status?: string | null } | null | undefined) => {
  if (room?.status === "maintenance") {
    return "Este quarto está em manutenção e não pode receber reservas";
  }
  if (room?.is_blocked === true) {
    return "Este quarto está interditado e não pode receber reservas";
  }
  return "Este quarto não está disponível";
};

interface ReservationCalendarMapProps {
  onSelectReservation?: (id: string) => void;
  onCreateReservation?: (data: {
    checkin_date: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
    action?: "confirmed" | "blocked" | "preregistration";
  }) => void;
  onOpenMaintenance?: (data: { room_id: string }) => void;
  onReservationAction?: (action: "edit" | "checkin" | "checkout" | "cancel", reservationId: string) => void;
}

const statusConfig: Record<string, { 
  bg: string; 
  text: string; 
  label: string; 
  border: string;
  legendColor: string; // Cor sólida para a legenda
}> = {
  pending: { 
    bg: "bg-amber-400", 
    text: "text-slate-900", 
    label: "Pagamento pendente", 
    border: "border-amber-500", 
    legendColor: "#f59e0b"
  },
  unpaid: { 
    bg: "bg-red-500", 
    text: "text-white", 
    label: "Não pago", 
    border: "border-red-600", 
    legendColor: "#ef4444"
  },
  confirmed: { 
    bg: "bg-emerald-500", 
    text: "text-white", 
    label: "Pago", 
    border: "border-emerald-600", 
    legendColor: "#10b981"
  },
  checkedin: { 
    bg: "bg-[#3B82F6]", 
    text: "text-white", 
    label: "Check-in", 
    border: "border-blue-600", 
    legendColor: "#3B82F6" 
  },
  checkedout: { 
    bg: "bg-slate-300", 
    text: "text-slate-800", 
    label: "Check-out", 
    border: "border-slate-400",
    legendColor: "#94a3b8" 
  },
  cancelled: { 
    bg: "bg-red-500", 
    text: "text-white", 
    label: "Cancelada", 
    border: "border-red-600", 
    legendColor: "#ef4444" 
  },
  noshow: { 
    bg: "bg-rose-500", 
    text: "text-white", 
    label: "No Show", 
    border: "border-rose-600", 
    legendColor: "#f43f5e" 
  },
  blocked: { 
    bg: "bg-slate-800", 
    text: "text-white", 
    label: "Bloqueada", 
    border: "border-slate-900", 
    legendColor: "#1e293b"
  },
  preregistration: { 
    bg: "bg-violet-500", 
    text: "text-white", 
    label: "Pré-reserva", 
    border: "border-violet-600", 
    legendColor: "#8b5cf6"
  },
};

/** Bolinha no mapa: web check-in concluído (pré check-in), antes do check-in no hotel */
const PRE_CHECKIN_DOT_COLOR = "#a855f7";

function isWebCheckinCompleted(webCheckin: unknown): boolean {
  if (!webCheckin) return false;
  if (Array.isArray(webCheckin)) {
    return webCheckin.some((entry) => (entry as { status?: string })?.status === "completed");
  }
  return (webCheckin as { status?: string })?.status === "completed";
}

export const ReservationCalendarMap = ({ 
  onSelectReservation,
  onCreateReservation,
  onOpenMaintenance,
  onReservationAction 
}: ReservationCalendarMapProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { establishmentId: establishmentIdFromParams } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment, establishments, setSelectedEstablishment } = useEstablishment();
  
  // Cache de preços calculados para evitar recálculos desnecessários
  const [calculatedPricesCache, setCalculatedPricesCache] = useState<Map<string, number>>(new Map());
  
  const { canCreate, canUpdate, canDelete, canAccess } = usePermissions();
  
  // Obter o UUID do establishment (não o numeric_id)
  const establishmentId = useMemo(() => {
    // Se temos o establishment selecionado no contexto, usar o UUID dele
    if (selectedEstablishment?.id) {
      // Verificar se o numeric_id da URL corresponde ao establishment selecionado
      if (establishmentIdFromParams && selectedEstablishment.numeric_id?.toString() === establishmentIdFromParams) {
        return selectedEstablishment.id;
      }
      // Se não corresponde, mas temos o establishment selecionado, usar ele mesmo assim
      return selectedEstablishment.id;
    }
    
    // Se temos numeric_id na URL, buscar o establishment correspondente
    if (establishmentIdFromParams && establishments.length > 0) {
      const numericId = parseInt(establishmentIdFromParams, 10);
      if (!isNaN(numericId)) {
        const establishment = establishments.find((e) => e.numeric_id === numericId);
        if (establishment) {
          // Selecionar o establishment encontrado
          setSelectedEstablishment(establishment);
          return establishment.id;
        }
      }
    }
    
    // Caso contrário, tentar obter do localStorage
    const storedId = getSelectedEstablishmentId();
    if (storedId) {
      return storedId;
    }
    return null;
  }, [selectedEstablishment, establishmentIdFromParams, establishments, setSelectedEstablishment]);

  const { settings: hotelSettings } = useHotelSettings(establishmentId || undefined);
  const isHoverPreviewEnabled = (hotelSettings as any)?.map_reservation_hover_preview !== false;
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [viewDays, setViewDays] = useState(30);

  // Período visível para pré-carregar rate_calendar (alinhado ao mapa de tarifas e Grid ARI)
  const rateCalendarDateRange = useMemo(() => ({
    start: startOfDay(addDays(startDate, -1)),
    end: startOfDay(addDays(startDate, viewDays - 1)),
  }), [startDate, viewDays]);

  const { rateCalendar, ratePlans, calculateRatePrice } = useRateSystem({ dateRange: rateCalendarDateRange });
  const { calculatePrice } = usePricing();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickDialogData, setQuickDialogData] = useState<{
    checkin_date: string;
    checkout_date: string;
    category_id?: string;
    room_id?: string;
  } | null>(null);
  // Evita reabrir o modal com o mesmo clique usado para fechar (outside click).
  const suppressQuickDialogUntilRef = useRef(0);

  // Estados para modal de visualização rápida
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  
  // Estados para modal de bloqueio
  const [blockViewOpen, setBlockViewOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Estados para modal de transferência
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [reservationToTransfer, setReservationToTransfer] = useState<any | null>(null);

  // Estados para modal de realocação entre estabelecimentos
  const [reallocationModalOpen, setReallocationModalOpen] = useState(false);
  const [reservationToReallocate, setReservationToReallocate] = useState<any | null>(null);

  // Estados para modal de pagamento
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [reservationForPayment, setReservationForPayment] = useState<any | null>(null);

  // Estados para modal de tarifários
  const [ratePlansModalOpen, setRatePlansModalOpen] = useState(false);
  const [ratePlansModalData, setRatePlansModalData] = useState<{
    categoryId: string;
    categoryName: string;
    date: Date;
  } | null>(null);

  // Estados para drag de criação de reserva
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ date: Date; categoryId?: string; roomId?: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);

  // Thumbnail ao passar o mouse sobre uma reserva (apenas visual)
  const [hoveredReservationPreview, setHoveredReservationPreview] = useState<{
    reservation: any;
    roomLabel?: string | null;
    statusLabel: string;
    statusColor: string;
    x: number;
    y: number;
  } | null>(null);

  // Estados para drag de reserva existente
  const [draggedReservation, setDraggedReservation] = useState<{
    reservation: any;
    startIndex: number;
    roomId: string; 
    mouseOffset?: { x: number; y: number };
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ dateIndex: number; roomId: string } | null>(null);

  const [resizingReservation, setResizingReservation] = useState<{
    reservation: any;
    roomId: string;
    originalCheckout: string;
    previewCheckout: string;
    minCheckout: string;
    nightDelta: number;
    conflict: boolean;
  } | null>(null);
  const [isExtendingStay, setIsExtendingStay] = useState(false);
  const isActualResizeRef = useRef(false);
  const [pendingShorten, setPendingShorten] = useState<{
    reservation: any;
    oldCheckout: string;
    newCheckout: string;
    removedNights: number;
    removedAmount: number;
    newTotal: number;
    paidAmount: number;
    refundableAmount: number;
  } | null>(null);
  const [refundShortenedNights, setRefundShortenedNights] = useState(false);
  
  // Estado para diálogo de confirmação de movimentação
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    reservation: any;
    oldCheckin: string;
    oldCheckout: string;
    oldRoomId: string;
    oldRoomName: string;
    newCheckin: string;
    newCheckout: string;
    newRoomId: string;
    newRoomName: string;
    newCategoryId: string;
  } | null>(null);

  // Estado para troca de reservas
  const [reservationForSwap, setReservationForSwap] = useState<any | null>(null);
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);
  const [pendingSwap, setPendingSwap] = useState<{
    reservation1: any;
    reservation2: any;
    reservation1OldRoom: string;
    reservation1OldRoomName: string;
    reservation1OldCheckin: string;
    reservation1OldCheckout: string;
    reservation2OldRoom: string;
    reservation2OldRoomName: string;
    reservation2OldCheckin: string;
    reservation2OldCheckout: string;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const mouseDownPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isActualDragRef = useRef<boolean>(false);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cellCacheRef = useRef<Map<string, HTMLElement>>(new Map());
  const lastHoveredCellRef = useRef<{ dateIndex: number; roomId: string } | null>(null);
  /** Evita abrir o modal da reserva logo após um drag (mesmo sem mudança de célula). */
  const suppressClickAfterDragRef = useRef(false);

  // Calcular datas visíveis (normalizadas para início do dia para evitar problemas de timezone)
  // Inclui o dia anterior ao startDate para mostrar reservas que começaram no dia anterior
  const visibleDates = useMemo(() => {
    const start = startOfDay(addDays(startDate, -1)); // Inclui o dia anterior
    const end = startOfDay(addDays(startDate, viewDays - 1));
    return eachDayOfInterval({
      start,
      end
    }).map(date => startOfDay(date)); // Garantir que todas as datas estejam normalizadas
  }, [startDate, viewDays]);

  // Agrupar datas por mês/ano para o cabeçalho
  const monthGroups = useMemo(() => {
    const groups: Array<{ monthYear: string; startIndex: number; endIndex: number; month: string; year: string }> = [];
    let currentMonthYear = "";
    let groupStartIndex = 0;

    visibleDates.forEach((date, index) => {
      const monthYear = format(date, "yyyy-MM", { locale: ptBR });
      const month = format(date, "MMMM", { locale: ptBR });
      const year = format(date, "yyyy", { locale: ptBR });

      if (monthYear !== currentMonthYear) {
        if (currentMonthYear !== "") {
          groups.push({
            monthYear: currentMonthYear,
            startIndex: groupStartIndex,
            endIndex: index - 1,
            month: format(visibleDates[groupStartIndex], "MMMM", { locale: ptBR }),
            year: format(visibleDates[groupStartIndex], "yyyy", { locale: ptBR }),
          });
        }
        currentMonthYear = monthYear;
        groupStartIndex = index;
      }
    });

    // Adicionar o último grupo
    if (currentMonthYear !== "") {
      groups.push({
        monthYear: currentMonthYear,
        startIndex: groupStartIndex,
        endIndex: visibleDates.length - 1,
        month: format(visibleDates[groupStartIndex], "MMMM", { locale: ptBR }),
        year: format(visibleDates[groupStartIndex], "yyyy", { locale: ptBR }),
      });
    }

    return groups;
  }, [visibleDates]);

  // Buscar categorias e quartos
  const { data: categories = [], isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ["occupancy_map_rooms", establishmentId],
    queryFn: async () => {
      const currentEstablishmentId = establishmentId || getSelectedEstablishmentId();
      if (!currentEstablishmentId) {
        console.warn("⚠️ Establishment ID não encontrado");
        return [];
      }

      // Buscar quartos com suas categorias
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select(`
          *,
          room_categories (*)
        `)
        .eq("establishment_id", currentEstablishmentId)
        .order("room_number");

      if (roomsError) {
        console.error("❌ Erro ao buscar quartos:", roomsError);
        throw roomsError;
      }

      // Buscar categorias com informações de prédio
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("room_categories")
        .select(`
          *,
          buildings (
            id,
            name
          )
        `)
        .eq("establishment_id", currentEstablishmentId)
        .order("name");
      
      if (categoriesError) {
        console.error("❌ Erro ao buscar categorias:", categoriesError);
        throw categoriesError;
      }

      console.log("📦 Quartos recebidos:", roomsData);
      console.log("📦 Categorias recebidas:", categoriesData);
      console.log("📊 Total de quartos:", roomsData?.length || 0);
      console.log("📊 Total de categorias:", categoriesData?.length || 0);

      // Agrupar quartos por categoria
      const categoriesMap = new Map();
      (categoriesData || []).forEach((category: any) => {
        categoriesMap.set(category.id, {
          ...category,
          rooms: []
      });
    });
    
      console.log("🗺️ Mapa de categorias criado:", Array.from(categoriesMap.keys()));

      (roomsData || []).forEach((room: any) => {
        // Filtrar quartos inativos se a coluna existir, caso contrário incluir todos
        if (room.is_active === false) {
          console.log(`⏭️ Pulando quarto ${room.room_number} - inativo`);
          return;
        }
        
        const categoryId = room.category_id;
        console.log(`🏠 Quarto ${room.room_number} - category_id: ${categoryId}, existe no mapa: ${categoriesMap.has(categoryId)}`);
        if (categoryId && categoriesMap.has(categoryId)) {
          categoriesMap.get(categoryId).rooms.push(room);
        } else if (categoryId) {
          console.warn(`⚠️ Quarto ${room.room_number} tem category_id ${categoryId} que não existe nas categorias`);
        } else {
          console.warn(`⚠️ Quarto ${room.room_number} não tem category_id`);
        }
      });

      // Converter para array e ordenar quartos
      // Mostrar todas as categorias, mesmo sem quartos
      const categoriesWithRooms = Array.from(categoriesMap.values())
        .map((category: any) => ({
          ...category,
          rooms: category.rooms.sort((a: any, b: any) => 
            a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
          )
      }))
        .sort((a: any, b: any) => {
          const aParking = a.category_kind === "parking" ? 1 : 0;
          const bParking = b.category_kind === "parking" ? 1 : 0;
          if (aParking !== bParking) return aParking - bParking;
          return String(a.name).localeCompare(String(b.name));
        });

      console.log("✅ Categorias processadas:", categoriesWithRooms);
      console.log("📊 Total de categorias:", categoriesWithRooms.length);
      return categoriesWithRooms;
    },
    enabled: !!establishmentId,
  });

  // Função para obter preço com regras dinâmicas aplicadas
  const getPriceWithDynamicRules = useCallback(async (
    categoryId: string,
    planId: string | null,
    date: Date
  ): Promise<number> => {
    if (!planId) {
      // Se não há plano, usar preço base da categoria
      const category = categories.find((c: any) => c.id === categoryId);
      return Number(category?.base_price) || 0;
    }
    
    const dateStr = format(date, "yyyy-MM-dd");
    const cacheKey = `${planId}-${categoryId}-${dateStr}`;
    
    // Verificar cache primeiro
    const cachedPrice = calculatedPricesCache.get(cacheKey);
    if (cachedPrice !== undefined && cachedPrice > 0) {
      return cachedPrice;
    }
    
    // Buscar do rate_calendar
    const rateEntry = rateCalendar.find(
      r => r.pricing_plan_id === planId &&
      r.category_id === categoryId &&
      r.date === dateStr
    );
    
    if (rateEntry?.base_price && rateEntry.base_price > 0) {
      // Calcular com regras dinâmicas em background e atualizar cache
      calculateRatePrice(categoryId, planId, date).then(calculatedPrice => {
        if (calculatedPrice > 0 && Math.abs(calculatedPrice - rateEntry.base_price) > 0.01) {
          setCalculatedPricesCache(prev => {
            const updated = new Map(prev);
            updated.set(cacheKey, calculatedPrice);
            return updated;
          });
        }
      }).catch(() => {
        // Ignorar erros no cálculo em background
      });
      
      return rateEntry.base_price;
    }
    
    // Calcular com regras dinâmicas
    try {
      const calculatedPrice = await calculateRatePrice(categoryId, planId, date);
      if (calculatedPrice > 0) {
        setCalculatedPricesCache(prev => {
          const updated = new Map(prev);
          updated.set(cacheKey, calculatedPrice);
          return updated;
        });
        return calculatedPrice;
      }
    } catch (error) {
      console.warn(`Erro ao calcular preço para categoria ${categoryId} e plano ${planId} em ${dateStr}:`, error);
    }
    
    // Fallback: preço base da categoria
    const category = categories.find((c: any) => c.id === categoryId);
    return Number(category?.base_price) || 0;
  }, [rateCalendar, calculateRatePrice, calculatedPricesCache, categories]);

  // Expandir todas as categorias e prédios por padrão quando forem carregadas
  useEffect(() => {
    if (categories.length > 0 && expandedCategories.size === 0) {
      const allCategoryIds = new Set(categories.map((cat: any) => cat.id));
      setExpandedCategories(allCategoryIds);
      
      // Expandir todos os prédios também
      const allBuildingIds = new Set<string>();
      categories.forEach((cat: any) => {
        if (cat.building_id) {
          allBuildingIds.add(cat.building_id);
        }
      });
      if (allBuildingIds.size > 0) {
        setExpandedBuildings(allBuildingIds);
      }
    }
  }, [categories, expandedCategories.size]);

  // Buscar reservas com atualização automática em tempo real
  const { data: reservations = [] } = useQuery({
    queryKey: ["reservations", establishmentId, visibleDates[0]?.toISOString(), visibleDates[visibleDates.length - 1]?.toISOString()],
    queryFn: async () => {
      if (visibleDates.length === 0) return [];
      
      const currentEstablishmentId = establishmentId || getSelectedEstablishmentId();
      if (!currentEstablishmentId) {
        console.warn("⚠️ Establishment ID não encontrado para buscar reservas");
        return [];
      }
      
      const start = format(visibleDates[0], "yyyy-MM-dd");
      const end = format(visibleDates[visibleDates.length - 1], "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          *,
          room_categories(*),
          web_checkin(status, completed_at),
          reservation_service_fees(amount, quantity),
          pricing_plans (*)
        `)
        .eq("establishment_id", currentEstablishmentId)
        // Buscar reservas que se sobrepõem ao período visível:
        // - checkout_date >= start (a reserva termina no início do período ou depois - ainda está ativa)
        // - E checkin_date <= end (a reserva começa antes ou durante o período visível)
        // Isso garante que reservas que começaram no passado mas ainda estão ativas apareçam
        .or(`and(checkout_date.gte.${start},checkin_date.lte.${end})`)
        .neq("status", "cancelled");

      if (error) throw error;
      return data || [];
    },
    enabled: visibleDates.length > 0 && !!establishmentId,
    // Atualização automática a cada 10 segundos para refletir mudanças em tempo real
    // (pagamentos, check-ins, check-outs realizados em outras abas/janelas)
    refetchInterval: 10000, // 10 segundos
    // Refetch quando a janela recebe foco novamente
    refetchOnWindowFocus: true,
    // Refetch quando reconecta à rede
    refetchOnReconnect: true,
  });

  // Função auxiliar para normalizar datas (garantir formato YYYY-MM-DD)
  const normalizeDate = useCallback((date: string | Date | null | undefined): string | null => {
    if (!date) return null;
    
    try {
      // Se já é string no formato correto
      if (typeof date === 'string') {
        // Remover timezone e hora se existir
        const dateOnly = date.split('T')[0].split(' ')[0];
        // Validar formato YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
          return dateOnly;
        }
        // Tentar parsear se não estiver no formato correto
        const parsed = parseISO(dateOnly);
        if (!isNaN(parsed.getTime())) {
          return format(startOfDay(parsed), "yyyy-MM-dd");
        }
      }
      
      // Se é Date object
      if (date instanceof Date) {
        if (!isNaN(date.getTime())) {
          return format(startOfDay(date), "yyyy-MM-dd");
        }
      }
    } catch (error) {
      console.warn("⚠️ Erro ao normalizar data:", date, error);
    }
    
    return null;
  }, []);

  // Função para validar se uma reserva tem dados válidos
  const isValidReservation = useCallback((reservation: any): boolean => {
    if (!reservation) return false;
    if (!reservation.id) return false;
    
    const checkin = normalizeDate(reservation.checkin_date);
    const checkout = normalizeDate(reservation.checkout_date);
    
    if (!checkin || !checkout) return false;
    
    // Verificar se checkout é posterior ao checkin
    const checkinDate = parseISO(checkin);
    const checkoutDate = parseISO(checkout);
    
    if (isNaN(checkinDate.getTime()) || isNaN(checkoutDate.getTime())) return false;
    if (checkoutDate <= checkinDate) return false;
    
    return true;
  }, [normalizeDate]);

  // Agrupar reservas por quarto (com validação)
  const reservationsByRoom = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    
    if (!reservations || !Array.isArray(reservations)) {
      return grouped;
    }

    reservations.forEach((r: any) => {
      // Validar reserva antes de adicionar
      if (!r || !r.id) {
        console.warn("⚠️ Reserva sem ID ignorada:", r);
        return;
      }

      // Incluir reservas com room_id válido (pré-reservas e outras podem vir com UUID em formatos diferentes)
      const roomId = r.room_id != null ? String(r.room_id).trim() : '';
      if (roomId) {
        if (!grouped[roomId]) {
          grouped[roomId] = [];
        }
        grouped[roomId].push(r);
      }
    });

    // Ordenar reservas por data de check-in dentro de cada quarto
    Object.keys(grouped).forEach((roomId) => {
      grouped[roomId].sort((a: any, b: any) => {
        const dateA = normalizeDate(a.checkin_date);
        const dateB = normalizeDate(b.checkin_date);
        if (!dateA || !dateB) return 0;
        return dateA.localeCompare(dateB);
      });
    });
    
    return grouped;
  }, [reservations, normalizeDate]);

  // Função para verificar se uma data está ocupada
  // REGRA: Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
  // Exemplo: Reserva 14/11-15/11 ocupa APENAS o dia 14/11, o dia 15/11 está LIVRE
  const isDateOccupied = useCallback((date: Date, roomId: string, excludeReservationId?: string): boolean => {
    if (!date || !roomId) return false;
    
    try {
      const dateStr = normalizeDate(date);
      if (!dateStr) return false;

      const roomReservations = reservationsByRoom[roomId] || [];
      if (roomReservations.length === 0) return false;

      for (const reservation of roomReservations) {
        // Pular reserva excluída
        if (reservation.id === excludeReservationId) continue;
        
        // Pular reservas canceladas
        if (reservation.status === "cancelled") continue;
        
        // Validar dados da reserva
        if (!isValidReservation(reservation)) {
          console.warn("⚠️ Reserva inválida ignorada:", reservation.id, reservation);
          continue;
        }

        const checkin = normalizeDate(reservation.checkin_date);
        const checkout = normalizeDate(reservation.checkout_date);

        if (!checkin || !checkout) continue;

        // Se a data é exatamente o checkout, NÃO está ocupada (checkout exclusivo)
        if (dateStr === checkout) continue;

        // Verificar se a data está no intervalo [checkin, checkout)
        // Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
        if (dateStr >= checkin && dateStr < checkout) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Erro em isDateOccupied:", error, { date, roomId, excludeReservationId });
      return false;
    }
  }, [reservationsByRoom, normalizeDate, isValidReservation]);

  // Calcular posição de uma reserva no grid
  const getReservationPosition = useCallback((reservation: any, otherReservations?: any[]) => {
    if (!reservation) {
      return { startIndex: -1, duration: 0, isVisible: false };
    }

    try {
      // Validar dados da reserva
      if (!isValidReservation(reservation)) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }

      const checkinStr = normalizeDate(reservation.checkin_date);
      const checkoutStr = normalizeDate(reservation.checkout_date);

      if (!checkinStr || !checkoutStr) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }

      // Parse das datas usando timezone local para evitar problemas
      // Se a string já está no formato "yyyy-MM-dd", criar Date diretamente no timezone local
      const [checkinYear, checkinMonth, checkinDay] = checkinStr.split('-').map(Number);
      const [checkoutYear, checkoutMonth, checkoutDay] = checkoutStr.split('-').map(Number);
      const checkin = startOfDay(new Date(checkinYear, checkinMonth - 1, checkinDay));
      const checkout = startOfDay(new Date(checkoutYear, checkoutMonth - 1, checkoutDay));

      // Validar datas parseadas
      if (isNaN(checkin.getTime()) || isNaN(checkout.getTime())) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }

      // Encontrar índice inicial no grid
      // Se o check-in está antes do período visível, começar do primeiro dia visível
      // Se o check-in está dentro do período visível, usar o índice do check-in
      let startIndex = visibleDates.findIndex((d) => {
        const dStr = format(startOfDay(d), "yyyy-MM-dd");
        return dStr === checkinStr;
      });

      // Se o check-in está antes do período visível, começar do primeiro dia visível
      const actualStartDate = startIndex === -1 && checkin < visibleDates[0] 
        ? visibleDates[0] 
        : checkin;
      
      if (startIndex === -1 && checkin < visibleDates[0]) {
        startIndex = 0;
      }

      // Se ainda não encontrou (check-in está depois do período visível), não mostrar
      if (startIndex === -1) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }

      // Calcular duração visível (do início visível até o checkout, mas não ultrapassando o fim do período visível)
      // O checkout é exclusivo, então não inclui o dia de checkout
      // Se o checkout está dentro do período visível, usar o checkout como fim
      // Se o checkout está depois do período visível, usar o último dia visível + 1 (porque checkout é exclusivo)
      const lastVisibleDate = startOfDay(visibleDates[visibleDates.length - 1]);
      const checkoutStartOfDay = startOfDay(checkout);
      const actualStartDateStartOfDay = startOfDay(actualStartDate);
      
      // Calcular a duração total da reserva (do check-in até o checkout)
      const totalDuration = differenceInDays(checkoutStartOfDay, startOfDay(checkin));
      
      // Se a duração total é inválida, não mostrar
      if (totalDuration <= 0) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }
      
      const firstVisibleDate = startOfDay(visibleDates[0]);
      
      // Se o checkout está antes ou no primeiro dia visível, não mostrar a reserva
      if (checkoutStartOfDay <= firstVisibleDate) {
        return { startIndex: -1, duration: 0, isVisible: false };
      }
      
      // Verificar se o checkout está em algum dia visível
      const checkoutIsInVisibleRange = visibleDates.some((visibleDate) => {
        const visibleDateStr = format(startOfDay(visibleDate), "yyyy-MM-dd");
        return visibleDateStr === checkoutStr;
      });
      
      // AJUSTE: Verificar se há outra reserva com check-in no dia de checkout
      // Se houver, vamos ajustar o posicionamento para que fiquem visualmente justas
      let hasCheckinOnCheckoutDay = false;
      let conflictingReservation: any = null;
      if (checkoutIsInVisibleRange && otherReservations && otherReservations.length > 0) {
        conflictingReservation = otherReservations.find((otherReservation: any) => {
          // Pular a própria reserva
          if (otherReservation.id === reservation.id) return false;
          
          // Pular reservas canceladas
          if (otherReservation.status === "cancelled") return false;
          
          // Verificar se é uma reserva válida
          if (!isValidReservation(otherReservation)) return false;
          
          // Verificar se o check-in da outra reserva é no dia de checkout desta reserva
          const otherCheckinStr = normalizeDate(otherReservation.checkin_date);
          return otherCheckinStr === checkoutStr;
        });
        hasCheckinOnCheckoutDay = !!conflictingReservation;
      }
      
      // Calcular a duração visível (do início visível até o fim visível)
      // AJUSTE: Sempre estender visualmente quando checkout está no dia seguinte visível
      // Se houver conflito, ajustaremos o posicionamento da reserva com check-in depois
      let visibleEndDate: Date;
      let shouldExtendToNextDay = false;
      
      if (checkoutIsInVisibleRange) {
        // Checkout está em um dia visível (dia seguinte)
        // Sempre incluir uma pequena porção visual no grid do dia de checkout para indicar quando termina
        shouldExtendToNextDay = true;
        // Usar o checkout como fim, mas vamos estender visualmente depois
        visibleEndDate = checkoutStartOfDay;
      } else if (checkoutStartOfDay <= lastVisibleDate) {
        // Checkout está dentro do período visível mas não é um dia visível específico
        visibleEndDate = checkoutStartOfDay;
      } else {
        // Checkout está depois do período visível, usar o último dia visível + 1
        visibleEndDate = addDays(lastVisibleDate, 1);
      }
      
      let duration = differenceInDays(visibleEndDate, actualStartDateStartOfDay);
      
      // Se a duração calculada for 0 ou negativa, mas temos uma reserva válida,
      // significa que o checkout está no mesmo dia ou muito próximo do início visível
      // Nesse caso, garantir pelo menos 1 dia de duração
      if (duration <= 0 && totalDuration > 0) {
        duration = 1;
      }
      
      // Não pode ultrapassar a duração total da reserva
      duration = Math.min(duration, totalDuration);
      
      // AJUSTE: Se o checkout está no dia seguinte visível, estender a duração para incluir visualmente
      // uma pequena porção do dia de checkout (cerca de 15% da largura da coluna)
      // Se houver conflito com check-in no mesmo dia, limitar a extensão para não sobrepor
      let visualExtension = 0;
      if (shouldExtendToNextDay && startIndex + duration < visibleDates.length) {
        if (hasCheckinOnCheckoutDay) {
          // Se há check-in no mesmo dia, limitar a extensão para 10% para deixar espaço para a outra reserva
          visualExtension = 0.10;
        } else {
          // Se não há conflito, usar 15% da largura da coluna
          visualExtension = 0.15;
        }
        duration = duration + visualExtension;
      }
      
      // Não pode ultrapassar o período visível (mas permitir a fração visual)
      const maxDuration = visibleDates.length - startIndex;
      if (duration > maxDuration) {
        duration = maxDuration;
      }
      
      if (duration <= 0) {
        console.warn("⚠️ Duração inválida em getReservationPosition:", duration, { checkinStr, checkoutStr, totalDuration, startIndex });
        return { startIndex: -1, duration: 0, isVisible: false, visualExtension: 0 };
      }

      // Verificar se está visível (não ultrapassa o grid)
      // Permitir uma pequena extensão visual (até 0.2 dias) além do limite para indicar checkout no dia seguinte
      const maxAllowedDuration = visibleDates.length - startIndex;
      const isVisible = startIndex >= 0 && (duration <= maxAllowedDuration || (shouldExtendToNextDay && duration <= maxAllowedDuration + 0.2));

      return {
        startIndex,
        duration,
        isVisible,
        visualExtension,
        hasCheckinOnCheckoutDay
      };
    } catch (error) {
      console.error("❌ Erro em getReservationPosition:", error, reservation);
      return { startIndex: -1, duration: 0, isVisible: false };
    }
  }, [visibleDates, normalizeDate, isValidReservation]);

  // Handlers para criar reserva (drag)
  const handleMouseDown = (date: Date, categoryId?: string, roomId?: string) => {
    // Verificar permissão: pode criar reservas OU pode bloquear (para camareiras)
    if (!canCreate("reservations") && !canAccess("reservations", "block")) {
      toast.error("Você não tem permissão para criar reservas ou bloquear quartos");
      return;
    }
    
    if (draggedReservation) return;
    if (roomId && isDateOccupied(date, roomId)) return;
    
    // Verificar se o quarto está interditado ou em manutenção
    if (roomId) {
      const room = categories
        .flatMap((cat: any) => cat.rooms || [])
        .find((r: any) => r.id === roomId);
      
      if (isRoomUnavailableForBooking(room)) {
        toast.error(getRoomUnavailableMessage(room));
        return;
      }
    }
    
    // Se for categoria (sem quarto específico), verificar se há quartos disponíveis
    if (categoryId && !roomId) {
      const category = categories.find((cat: any) => cat.id === categoryId);
      if (category) {
        const availableRooms = (category.rooms || []).filter((room: any) => {
          if (isRoomUnavailableForBooking(room)) return false;
          return !isDateOccupied(date, room.id);
        });
        
        if (availableRooms.length === 0) {
          const unavailableRooms = (category.rooms || []).filter((room: any) => isRoomUnavailableForBooking(room));
          if (unavailableRooms.length > 0) {
            toast.error("Todos os quartos desta categoria estão indisponíveis (interditados, em manutenção ou ocupados)");
          } else {
            toast.error("Nenhum quarto disponível nesta categoria para esta data");
          }
          return;
        }
      }
    }

    setDragStart({ date: startOfDay(date), categoryId, roomId });
    setDragEnd(startOfDay(date));
    setIsDragging(true);
  };

  const handleMouseEnter = (date: Date, categoryId?: string, roomId?: string) => {
    if (!isDragging || !dragStart || draggedReservation) return;
    if (!date || isNaN(date.getTime())) return;
    
    // Validar categoria e quarto
    if (dragStart.categoryId && categoryId !== dragStart.categoryId) return;
    if (dragStart.roomId && roomId !== dragStart.roomId) return;
    
    // Verificar se o quarto está interditado ou em manutenção
    if (roomId) {
      const room = categories
        .flatMap((cat: any) => cat.rooms || [])
        .find((r: any) => r.id === roomId);
      
      if (isRoomUnavailableForBooking(room)) {
        return; // Não permitir arrastar para quarto indisponível
      }
    }
    
    try {
      const endDate = startOfDay(date);
      const startDate = startOfDay(dragStart.date);
      
      // Validar datas
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn("⚠️ Datas inválidas em handleMouseEnter");
        return;
      }
      
      const minDate = startDate < endDate ? startDate : endDate;
      const maxDate = startDate > endDate ? startDate : endDate;

      // Verificar se há conflito no intervalo (apenas se tiver quarto específico)
      if (roomId) {
        try {
          const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
          
          // Validar intervalo
          if (datesInRange.length === 0 || datesInRange.length > 365) {
            console.warn("⚠️ Intervalo inválido em handleMouseEnter:", datesInRange.length);
      return;
    }

          // Verificar conflitos (excluindo o último dia que é checkout exclusivo)
          const datesToCheck = datesInRange.slice(0, -1); // Remover último dia
          const hasConflict = datesToCheck.some((d) => {
            try {
              return isDateOccupied(d, roomId);
            } catch (error) {
              console.error("❌ Erro ao verificar conflito:", error);
              return false;
            }
          });
          
          if (hasConflict) {
      return;
    }
        } catch (error) {
          console.error("❌ Erro ao verificar conflitos em handleMouseEnter:", error);
          return;
        }
      }

      setDragEnd(endDate);
    } catch (error) {
      console.error("❌ Erro em handleMouseEnter:", error);
    }
  };

  const handleMouseUp = (categoryId?: string, roomId?: string, date?: Date) => {
    if (draggedReservation) return;
    if (Date.now() < suppressQuickDialogUntilRef.current) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    
    if (!isDragging || !dragStart || !dragEnd) {
      // Clique direto sem drag
      if (date && roomId && !isDateOccupied(date, roomId)) {
        // Verificar se o quarto está interditado ou em manutenção
        const room = categories
          .flatMap((cat: any) => cat.rooms || [])
          .find((r: any) => r.id === roomId);
        
        if (isRoomUnavailableForBooking(room)) {
          toast.error(getRoomUnavailableMessage(room));
          setIsDragging(false);
          setDragStart(null);
          setDragEnd(null);
          return;
        }
        
        const clickedDate = startOfDay(date);
        setQuickDialogData({
          checkin_date: format(clickedDate, "yyyy-MM-dd"),
          checkout_date: format(addDays(clickedDate, 1), "yyyy-MM-dd"),
          category_id: categoryId,
          room_id: roomId,
        });
        setQuickDialogOpen(true);
      } else if (date && categoryId && !roomId) {
        // Clique em categoria (sem quarto específico) - verificar disponibilidade
        const category = categories.find((cat: any) => cat.id === categoryId);
        if (category) {
          const availableRooms = (category.rooms || []).filter((room: any) => {
            if (isRoomUnavailableForBooking(room)) return false;
            return !isDateOccupied(date, room.id);
          });
          
          if (availableRooms.length === 0) {
            const unavailableRooms = (category.rooms || []).filter((room: any) => isRoomUnavailableForBooking(room));
            if (unavailableRooms.length > 0 && unavailableRooms.length === (category.rooms || []).length) {
              toast.error("Todos os quartos desta categoria estão interditados ou em manutenção");
            } else {
              toast.error("Nenhum quarto disponível nesta categoria para esta data");
            }
            setIsDragging(false);
            setDragStart(null);
            setDragEnd(null);
            return;
          }
          
          // Permitir abrir o modal se pode criar reservas OU pode bloquear (para camareiras)
          if (canCreate("reservations") || canAccess("reservations", "block")) {
            const clickedDate = startOfDay(date);
            setQuickDialogData({
              checkin_date: format(clickedDate, "yyyy-MM-dd"),
              checkout_date: format(addDays(clickedDate, 1), "yyyy-MM-dd"),
              category_id: categoryId,
              room_id: undefined,
            });
            setQuickDialogOpen(true);
          }
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const start = startOfDay(dragStart.date);
    const end = startOfDay(dragEnd);
    const minDate = start < end ? start : end;
    const maxDate = start > end ? start : end;

    if (roomId) {
      // Verificar se o quarto está interditado
      const room = categories
        .flatMap((cat: any) => cat.rooms || [])
        .find((r: any) => r.id === roomId);
      
      if (isRoomUnavailableForBooking(room)) {
        toast.error(getRoomUnavailableMessage(room));
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }
      
      const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
      const hasConflict = datesInRange.some((d) => isDateOccupied(d, roomId));
      if (hasConflict) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }
    } else if (categoryId || dragStart.categoryId) {
      // Verificar se há quartos disponíveis na categoria
      const finalCategoryId = categoryId || dragStart.categoryId;
      const category = categories.find((cat: any) => cat.id === finalCategoryId);
      if (category) {
        const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
        const availableRooms = (category.rooms || []).filter((room: any) => {
          if (isRoomUnavailableForBooking(room)) return false;
          return !datesInRange.some((d) => isDateOccupied(d, room.id));
        });
        
        if (availableRooms.length === 0) {
          const unavailableRooms = (category.rooms || []).filter((room: any) => isRoomUnavailableForBooking(room));
          if (unavailableRooms.length > 0 && unavailableRooms.length === (category.rooms || []).length) {
            toast.error("Todos os quartos desta categoria estão interditados ou em manutenção");
          } else {
            toast.error("Nenhum quarto disponível nesta categoria para este período");
          }
          setIsDragging(false);
          setDragStart(null);
          setDragEnd(null);
          return;
        }
      }
    }

    // Permitir abrir o modal se pode criar reservas OU pode bloquear (para camareiras)
    if (canCreate("reservations") || canAccess("reservations", "block")) {
      setQuickDialogData({
        checkin_date: format(startOfDay(minDate), "yyyy-MM-dd"),
        checkout_date: format(addDays(startOfDay(maxDate), 1), "yyyy-MM-dd"),
        category_id: categoryId || dragStart.categoryId,
        room_id: roomId || dragStart.roomId,
      });
      setQuickDialogOpen(true);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Handlers para mover reserva existente
  // Handler para botão direito do mouse (selecionar para troca)
  const handleReservationContextMenu = (e: React.MouseEvent, reservation: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Não permitir seleção de reservas bloqueadas, canceladas ou checkout
    if (["blocked", "cancelled", "checkedout"].includes(reservation.status)) {
      toast.info("Esta reserva não pode ser trocada");
      return;
    }

    // Se já há uma reserva selecionada e é a mesma, deselecionar
    if (reservationForSwap?.id === reservation.id) {
      setReservationForSwap(null);
      toast.info("Seleção cancelada");
      return;
    }

    // Selecionar reserva para troca
    setReservationForSwap(reservation);
    toast.success(`Reserva ${reservation.reservation_code} selecionada para troca. Clique em outra reserva para trocar.`);
  };

  const handleReservationMouseDown = useCallback((e: React.MouseEvent, reservation: any) => {
    // Se for botão direito, não fazer drag
    if (e.button === 2) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    // Verificar permissão para mover reservas (update)
    if (!canUpdate("reservations")) {
      // Se for bloqueio, verificar permissão específica de bloquear
      if (reservation.status === "blocked" && !canAccess("reservations", "block")) {
        toast.error("Você não tem permissão para mover reservas");
        return;
      }
      if (reservation.status !== "blocked") {
        toast.error("Você não tem permissão para mover reservas");
        return;
      }
    }
    
    if (["blocked", "cancelled", "checkedout"].includes(reservation.status)) return;
    if (!reservation.room_id) return;

    // Buscar outras reservas do mesmo quarto para verificar sobreposição
    const roomReservations = reservationsByRoom[reservation.room_id] || [];
    const pos = getReservationPosition(reservation, roomReservations);
    if (!pos.isVisible) return;
    
    // Armazenar posição inicial do mouse para detectar movimento
    mouseDownPositionRef.current = { x: e.clientX, y: e.clientY };
    isActualDragRef.current = false;
    
    // Calcular offset do mouse dentro da reserva
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Preparar dados do drag, mas não iniciar ainda
    // Só iniciar se o mouse se mover além do threshold
    const dragData = {
      reservation,
        startIndex: pos.startIndex,
        roomId: reservation.room_id,
      mouseOffset: { x: offsetX, y: offsetY }
    };
    
    // Armazenar temporariamente (será usado se houver movimento)
    setDraggedReservation(dragData);
    setDragPosition({ x: e.clientX, y: e.clientY });
  }, [canUpdate, canAccess, getReservationPosition]);

  const handleReservationMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedReservation || !mouseDownPositionRef.current) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Calcular distância do movimento desde o mouseDown
    const deltaX = Math.abs(mouseX - mouseDownPositionRef.current.x);
    const deltaY = Math.abs(mouseY - mouseDownPositionRef.current.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Threshold de 5px para distinguir clique de drag
    const DRAG_THRESHOLD = 5;
    
    // Se ainda não passou do threshold, não iniciar drag visual
    if (distance < DRAG_THRESHOLD && !isActualDragRef.current) {
      return;
    }
    
    // Marcar como drag real
    if (!isActualDragRef.current) {
      isActualDragRef.current = true;
      // Cancelar qualquer timeout de clique pendente
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    }

    // Atualizar posição do preview IMEDIATAMENTE (sem throttle) para seguir suavemente
    setDragPosition({ x: mouseX, y: mouseY });
    lastMousePositionRef.current = { x: mouseX, y: mouseY };

    // Usar requestAnimationFrame apenas para detecção de célula (throttled)
    if (animationFrameRef.current) {
      return; // Já tem uma detecção em andamento, pular esta
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;

      const pos = lastMousePositionRef.current;
      if (!pos || !gridRef.current) return;

      // Usar elementFromPoint para encontrar a célula exata sob o cursor
      const elementUnderMouse = document.elementFromPoint(pos.x, pos.y);
      
      if (!elementUnderMouse) return;

      // Buscar a célula mais próxima com data-room-id (otimizado com cache)
      let cellElement = elementUnderMouse.closest('[data-room-id]') as HTMLElement;
      
      if (!cellElement && gridRef.current.contains(elementUnderMouse)) {
        // Se não encontrou diretamente, tentar usar cache primeiro
        const cacheKey = `${Math.floor(pos.x / 100)}_${Math.floor(pos.y / 50)}`;
        const cachedCell = cellCacheRef.current.get(cacheKey);
        
        if (cachedCell && gridRef.current.contains(cachedCell)) {
          const rect = cachedCell.getBoundingClientRect();
          if (pos.x >= rect.left && pos.x <= rect.right &&
              pos.y >= rect.top && pos.y <= rect.bottom) {
            cellElement = cachedCell;
          }
        }
        
        // Se cache não funcionou, buscar no grid (mais lento)
        if (!cellElement) {
          const cells = gridRef.current.querySelectorAll('[data-room-id]');
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i] as HTMLElement;
            const rect = cell.getBoundingClientRect();
            if (pos.x >= rect.left && pos.x <= rect.right &&
                pos.y >= rect.top && pos.y <= rect.bottom) {
              cellElement = cell;
              // Atualizar cache
              cellCacheRef.current.set(cacheKey, cell);
              break;
            }
          }
        }
      }

      if (cellElement) {
        const roomId = cellElement.getAttribute('data-room-id');
        const dateIndexStr = cellElement.getAttribute('data-date-index');
        
        if (roomId && dateIndexStr !== null) {
          const dateIndex = parseInt(dateIndexStr, 10);
          
          // Só atualizar se mudou (usar ref para evitar re-render desnecessário)
          const lastCell = lastHoveredCellRef.current;
          if (!lastCell || lastCell.roomId !== roomId || lastCell.dateIndex !== dateIndex) {
            lastHoveredCellRef.current = { dateIndex, roomId };
            setHoveredCell({ dateIndex, roomId });
          }
        }
      }
    });
  }, [draggedReservation]);

  const handleReservationMouseUp = useCallback(async () => {
    // Limpar animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Limpar referências de posição
    const wasDrag = isActualDragRef.current;
    mouseDownPositionRef.current = null;
    isActualDragRef.current = false;
    lastHoveredCellRef.current = null;

    // Se não foi um drag real (foi apenas um clique), limpar e retornar
    if (!wasDrag) {
      setDraggedReservation(null);
      setDragPosition(null);
      setHoveredCell(null);
      cellCacheRef.current.clear();
      return;
    }

    // Foi drag: impedir que o onClick abra o modal da reserva
    suppressClickAfterDragRef.current = true;
    window.setTimeout(() => {
      suppressClickAfterDragRef.current = false;
    }, 200);

    if (!draggedReservation || !hoveredCell) {
      setDraggedReservation(null);
      setDragPosition(null);
      setHoveredCell(null);
      cellCacheRef.current.clear();
      return;
    }

    try {
      // Validar dados da reserva original
      if (!isValidReservation(draggedReservation.reservation)) {
        toast.error("Dados da reserva inválidos");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        cellCacheRef.current.clear();
        return;
      }

      // Validar índice da célula
      if (hoveredCell.dateIndex < 0 || hoveredCell.dateIndex >= visibleDates.length) {
        toast.error("Posição inválida");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        cellCacheRef.current.clear();
        return;
      }

      const newCheckinDate = startOfDay(visibleDates[hoveredCell.dateIndex]);
      
      // Validar nova data de check-in
      if (isNaN(newCheckinDate.getTime())) {
        toast.error("Data de check-in inválida");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        return;
      }

      // Calcular duração da reserva original
      const oldCheckinStr = normalizeDate(draggedReservation.reservation.checkin_date);
      const oldCheckoutStr = normalizeDate(draggedReservation.reservation.checkout_date);

      if (!oldCheckinStr || !oldCheckoutStr) {
        toast.error("Não foi possível calcular a duração da reserva");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        return;
      }

      const oldCheckin = parseISO(oldCheckinStr);
      const oldCheckout = parseISO(oldCheckoutStr);
      const duration = differenceInDays(oldCheckout, oldCheckin);

      // Validar duração
      if (duration <= 0 || duration > 365) {
        toast.error("Duração da reserva inválida");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        return;
      }

    const newCheckoutDate = addDays(newCheckinDate, duration);

      // Validar nova data de check-out
      if (isNaN(newCheckoutDate.getTime())) {
        toast.error("Data de check-out inválida");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        return;
      }

      const newCheckinStr = format(newCheckinDate, "yyyy-MM-dd");
      const newCheckoutStr = format(newCheckoutDate, "yyyy-MM-dd");
      const oldRoomId = draggedReservation.reservation.room_id;
      const newRoomId = hoveredCell.roomId;

      // Se soltou no mesmo quarto e mesmas datas, não abrir modal de movimentação
      if (
        oldRoomId === newRoomId &&
        oldCheckinStr === newCheckinStr &&
        oldCheckoutStr === newCheckoutStr
      ) {
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        cellCacheRef.current.clear();
        return;
      }

      // Verificar conflitos (excluindo o último dia que é checkout exclusivo)
      const datesInRange = eachDayOfInterval({ 
        start: newCheckinDate, 
        end: addDays(newCheckinDate, duration - 1) 
      });
      
      // Validar intervalo
      if (datesInRange.length === 0 || datesInRange.length !== duration) {
        toast.error("Intervalo de datas inválido");
    setDraggedReservation(null);
        setDragPosition(null);
    setHoveredCell(null);
        return;
      }

      // Validar disponibilidade usando função centralizada
      try {
        const { validateRoomAvailability } = await import("@/lib/reservationUtils");
        const availabilityCheck = await validateRoomAvailability(
          hoveredCell.roomId,
          format(newCheckinDate, "yyyy-MM-dd"),
          format(newCheckoutDate, "yyyy-MM-dd"),
          draggedReservation.reservation.id
        );

        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Já existe uma reserva ou bloqueio neste período");
          setDraggedReservation(null);
          setDragPosition(null);
          setHoveredCell(null);
          return;
        }
        } catch (error) {
        console.error("❌ Erro ao verificar disponibilidade:", error);
        toast.error("Erro ao verificar disponibilidade do quarto");
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);
        return;
      }

      // Buscar dados dos quartos (antigo e novo) para exibir no diálogo
      
      // Buscar informações dos quartos
      const [oldRoomData, newRoomData] = await Promise.all([
        oldRoomId ? supabase.from("rooms").select("room_number, name").eq("id", oldRoomId).single() : Promise.resolve({ data: null }),
        newRoomId ? supabase.from("rooms").select("room_number, name, category_id").eq("id", newRoomId).single() : Promise.resolve({ data: null })
      ]);

      const oldRoomName = oldRoomData.data?.name || oldRoomData.data?.room_number || "N/A";
      const newRoomName = newRoomData.data?.name || newRoomData.data?.room_number || "N/A";
      const newCategoryId = newRoomData.data?.category_id || draggedReservation.reservation.category_id;

      // Formatar datas para exibição
      const formatDateForDisplay = (dateStr: string) => {
        if (!dateStr) return "N/A";
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
      };

      // Armazenar dados da movimentação pendente e mostrar diálogo
      setPendingMove({
        reservation: draggedReservation.reservation,
        oldCheckin: formatDateForDisplay(oldCheckinStr),
        oldCheckout: formatDateForDisplay(oldCheckoutStr),
        oldRoomId: oldRoomId || "",
        oldRoomName,
        newCheckin: formatDateForDisplay(newCheckinStr),
        newCheckout: formatDateForDisplay(newCheckoutStr),
        newRoomId: newRoomId || "",
        newRoomName,
        newCategoryId: newCategoryId || ""
      });

      // Limpar estados de drag
        setDraggedReservation(null);
        setDragPosition(null);
        setHoveredCell(null);

      // Mostrar diálogo de confirmação
      setMoveConfirmOpen(true);
    } catch (error: any) {
      console.error("❌ Erro em handleReservationMouseUp:", error);
      toast.error(error.message || "Erro ao preparar movimentação");
      setDraggedReservation(null);
      setDragPosition(null);
      setHoveredCell(null);
    }
  }, [draggedReservation, hoveredCell, visibleDates, isDateOccupied, isValidReservation, normalizeDate]);

  // Função para confirmar a movimentação
  const confirmMove = useCallback(async () => {
    if (!pendingMove || isMoving) return;

    setIsMoving(true);

    try {
      // Converter datas de DD/MM/YYYY para YYYY-MM-DD
      const formatDateForDB = (dateStr: string) => {
        if (!dateStr || dateStr === "N/A") return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      };

      const newCheckinDB = formatDateForDB(pendingMove.newCheckin);
      const newCheckoutDB = formatDateForDB(pendingMove.newCheckout);

      if (!newCheckinDB || !newCheckoutDB) {
        toast.error("Datas inválidas");
        setIsMoving(false);
        return;
      }

      // Validar disponibilidade ANTES de mover
      try {
        const { validateRoomAvailability } = await import("@/lib/reservationUtils");
        const availabilityCheck = await validateRoomAvailability(
          pendingMove.newRoomId,
          newCheckinDB,
          newCheckoutDB,
          pendingMove.reservation.id
        );

        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
          setIsMoving(false);
          return;
        }
      } catch (error) {
        console.error("❌ Erro ao verificar disponibilidade:", error);
        toast.error("Erro ao verificar disponibilidade do quarto");
        setIsMoving(false);
        return;
      }

      // Normalizar datas antigas para comparação
      const normalizeDate = (dateStr: string): string => {
        if (!dateStr || dateStr === "N/A") return "";
        // Se já está no formato YYYY-MM-DD, retornar como está
        if (dateStr.includes('-') && dateStr.length === 10) return dateStr.split('T')[0];
        // Se está no formato DD/MM/YYYY, converter
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr.split('T')[0];
      };

      const oldCheckinNormalized = normalizeDate(pendingMove.oldCheckin);
      const oldCheckoutNormalized = normalizeDate(pendingMove.oldCheckout);
      
      // Detectar alterações antes de atualizar
      const checkinChanged = oldCheckinNormalized !== newCheckinDB;
      const checkoutChanged = oldCheckoutNormalized !== newCheckoutDB;
      const roomChanged = pendingMove.reservation.room_id !== pendingMove.newRoomId;
      const categoryChanged = pendingMove.reservation.category_id !== pendingMove.newCategoryId;

      // ⚡ OTIMIZAÇÃO: Atualizar reserva primeiro (operação mais importante)
      const { error, data: updatedReservation } = await supabase
        .from("reservations")
        .update({
          checkin_date: newCheckinDB,
          checkout_date: newCheckoutDB,
          room_id: pendingMove.newRoomId,
          category_id: pendingMove.newCategoryId
        })
        .eq("id", pendingMove.reservation.id)
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          pricing_plans (*)
        `)
        .single();

      if (error) {
        console.error("❌ Erro ao atualizar reserva:", error);
        toast.error(error.message || "Erro ao mover reserva");
        setIsMoving(false);
        return;
      }

      // ⚡ OTIMIZAÇÃO: Invalidar queries imediatamente para atualizar UI rapidamente
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });

      // Fechar diálogo e mostrar sucesso imediatamente
      setMoveConfirmOpen(false);
      setPendingMove(null);
      setIsMoving(false);
      toast.success("Reserva movida com sucesso!");

      // ⚡ OTIMIZAÇÃO: Executar log e email em paralelo (não bloqueante)
      Promise.all([
        // Registrar log de movimentação
        (async () => {
          try {
            const oldRoomName = pendingMove.reservation.rooms?.room_number || "N/A";
            const newRoomName = updatedReservation?.rooms?.room_number || "N/A";
            
            await logActivity({
              actionType: "moved",
              entityType: "reservation",
              entityId: pendingMove.reservation.id,
              entityCode: pendingMove.reservation.reservation_code,
              description: createMoveDescription(
                pendingMove.reservation.reservation_code,
                oldRoomName,
                newRoomName,
                pendingMove.oldCheckin,
                pendingMove.newCheckin,
                pendingMove.oldCheckout,
                pendingMove.newCheckout
              ),
              oldValues: {
                room_id: pendingMove.reservation.room_id,
                checkin_date: pendingMove.oldCheckin,
                checkout_date: pendingMove.oldCheckout,
              },
              newValues: {
                room_id: pendingMove.newRoomId,
                checkin_date: newCheckinDB,
                checkout_date: newCheckoutDB,
              },
            });
          } catch (logError) {
            console.error("Erro ao registrar log de movimentação:", logError);
          }
        })(),
        // Enviar email de modificação se houver alterações relevantes
        (async () => {
          if (updatedReservation && (checkinChanged || checkoutChanged || roomChanged || categoryChanged)) {
            try {
              const { triggerEmail } = await import("@/lib/emailService");
              const { formatDate } = await import("@/lib/emailTemplateEngine");
              
              // Preparar variáveis adicionais para o template
              const additionalVariables: Record<string, any> = {
                checkin_date_changed: checkinChanged || checkoutChanged,
                room_changed: roomChanged,
                category_changed: categoryChanged,
              };
              
              // Adicionar valores antigos se houver alteração
              if (checkinChanged || checkoutChanged) {
                if (pendingMove.oldCheckin) {
                  additionalVariables.old_checkin_date = formatDate(normalizeDate(pendingMove.oldCheckin));
                }
                if (pendingMove.oldCheckout) {
                  additionalVariables.old_checkout_date = formatDate(normalizeDate(pendingMove.oldCheckout));
                }
              }
              
              if (roomChanged) {
                if (pendingMove.reservation.rooms?.room_number) {
                  additionalVariables.old_room_number = pendingMove.reservation.rooms.room_number;
                }
                if (pendingMove.reservation.rooms?.name) {
                  additionalVariables.old_room_name = pendingMove.reservation.rooms.name;
                }
              }
              
              if (categoryChanged) {
                if (pendingMove.reservation.room_categories?.name) {
                  additionalVariables.old_category_name = pendingMove.reservation.room_categories.name;
                }
              }
              
              await triggerEmail('reservation.modified', updatedReservation, additionalVariables);
            } catch (emailError) {
              console.error("❌ Erro ao enviar email de modificação:", emailError);
              // Não bloquear a movimentação se o email falhar
            }
          }
        })()
      ]).catch((error) => {
        console.error("Erro ao processar tarefas em background:", error);
      });
    } catch (error: any) {
      console.error("❌ Erro ao confirmar movimentação:", error);
      toast.error(error.message || "Erro ao mover reserva");
      setIsMoving(false);
    }
  }, [pendingMove, queryClient, isMoving]);

  // Função para cancelar a movimentação
  const cancelMove = useCallback(() => {
    if (isMoving) return; // Não permitir cancelar durante a movimentação
    setMoveConfirmOpen(false);
    setPendingMove(null);
  }, [isMoving]);

  // Função para validar compatibilidade de espaço entre reserva e quarto
  const validateSpaceCompatibility = useCallback(async (
    reservation: any,
    targetRoomId: string | null,
    targetCategoryId: string | null
  ): Promise<{ compatible: boolean; reason?: string }> => {
    if (!targetRoomId || !targetCategoryId) {
      return { compatible: true }; // Sem quarto específico, apenas categoria
    }

    try {
      // Buscar dados completos do quarto de destino
      const { data: targetRoom, error: roomError } = await supabase
        .from("rooms")
        .select("id, room_number, name, category_id, status, is_blocked")
        .eq("id", targetRoomId)
        .single();

      if (roomError || !targetRoom) {
        return { compatible: false, reason: "Quarto de destino não encontrado" };
      }

      // Verificar se o quarto está bloqueado ou indisponível
      if (targetRoom.is_blocked === true) {
        return { compatible: false, reason: `Quarto ${targetRoom.name || targetRoom.room_number} está interditado` };
      }

      if (targetRoom.status === "maintenance") {
        return { compatible: false, reason: `Quarto ${targetRoom.name || targetRoom.room_number} está em manutenção` };
      }

      // Buscar dados da categoria do quarto de destino
      // Usar select com * para pegar todos os campos disponíveis (incluindo type se existir)
      const { data: targetCategory, error: categoryError } = await supabase
        .from("room_categories")
        .select("id, name, capacity_adults, capacity_children, size_sqm")
        .eq("id", targetCategoryId)
        .single();

      if (categoryError || !targetCategory) {
        return { compatible: false, reason: "Categoria do quarto de destino não encontrada" };
      }

      // Buscar dados da categoria original da reserva (se houver)
      let originalCategory = null;
      if (reservation.category_id) {
        const { data: origCat } = await supabase
          .from("room_categories")
          .select("id, name, capacity_adults, capacity_children, size_sqm")
          .eq("id", reservation.category_id)
          .single();
        originalCategory = origCat;
      }

      // Validar capacidade: verificar se a reserva cabe no novo quarto
      const reservationAdults = reservation.adults || 0;
      const reservationChildren = reservation.children || 0;
      const totalGuests = reservationAdults + reservationChildren;

      const targetCapacityAdults = targetCategory.capacity_adults || 0;
      const targetCapacityChildren = targetCategory.capacity_children || 0;
      const targetTotalCapacity = targetCapacityAdults + targetCapacityChildren;

      // Verificar se há espaço suficiente (adultos devem caber, crianças podem ser flexíveis)
      if (reservationAdults > targetCapacityAdults) {
        return {
          compatible: false,
          reason: `Capacidade insuficiente: quarto suporta ${targetCapacityAdults} adultos, mas a reserva tem ${reservationAdults} adultos`
        };
      }

      if (totalGuests > targetTotalCapacity) {
        return {
          compatible: false,
          reason: `Capacidade total insuficiente: quarto suporta ${targetTotalCapacity} hóspedes, mas a reserva tem ${totalGuests} hóspedes`
        };
      }

      // Validar tipo de categoria (se aplicável e se o campo existir)
      // Permitir troca entre tipos compatíveis (ex: suite pode receber reserva de apartment)
      // Mas alertar sobre diferenças significativas
      // Nota: O campo 'type' pode não existir em todas as instalações, então verificamos se está disponível
      if (originalCategory && targetCategory && 'type' in targetCategory && 'type' in originalCategory) {
        const targetType = (targetCategory as any).type;
        const originalType = (originalCategory as any).type;
        
        if (targetType && originalType) {
          const typeCompatibility: Record<string, string[]> = {
            housing_unit: ["housing_unit", "apartment", "suite"],
            apartment: ["apartment", "housing_unit", "suite"],
            suite: ["suite", "apartment", "housing_unit"],
            house: ["house", "apartment"]
          };

          const compatibleTypes = typeCompatibility[originalType] || [];
          if (!compatibleTypes.includes(targetType)) {
            return {
              compatible: false,
              reason: `Incompatibilidade de tipo: reserva é ${originalType}, mas quarto é ${targetType}`
            };
          }
        }
      }

      return { compatible: true };
    } catch (error: any) {
      console.error("Erro ao validar compatibilidade:", error);
      return { compatible: false, reason: "Erro ao validar compatibilidade de espaço" };
    }
  }, []);

  // Handler para troca de reservas
  const handleReservationSwap = useCallback(async (reservation1: any, reservation2: any) => {
    try {
      // Validar que ambas as reservas podem ser trocadas
      if (["blocked", "cancelled", "checkedout"].includes(reservation1.status) ||
          ["blocked", "cancelled", "checkedout"].includes(reservation2.status)) {
        toast.error("Uma das reservas não pode ser trocada");
        setReservationForSwap(null);
        return;
      }

      // Validar que ambas as reservas têm a mesma quantidade de noites
      if (reservation1.checkin_date && reservation1.checkout_date &&
          reservation2.checkin_date && reservation2.checkout_date) {
        const reservation1Checkin = parseISO(reservation1.checkin_date);
        const reservation1Checkout = parseISO(reservation1.checkout_date);
        const reservation2Checkin = parseISO(reservation2.checkin_date);
        const reservation2Checkout = parseISO(reservation2.checkout_date);

        const reservation1Nights = differenceInDays(reservation1Checkout, reservation1Checkin);
        const reservation2Nights = differenceInDays(reservation2Checkout, reservation2Checkin);

        if (reservation1Nights !== reservation2Nights) {
          toast.error(
            `⚠️ Não é possível trocar reservas com quantidades diferentes de noites:\n` +
            `Reserva ${reservation1.reservation_code}: ${reservation1Nights} noite${reservation1Nights !== 1 ? 's' : ''}\n` +
            `Reserva ${reservation2.reservation_code}: ${reservation2Nights} noite${reservation2Nights !== 1 ? 's' : ''}\n\n` +
            `As reservas devem ter a mesma quantidade de diárias para serem trocadas.`,
            { duration: 10000 }
          );
          setReservationForSwap(null);
          return;
        }
      }

      // Buscar informações completas dos quartos (incluindo status e bloqueios)
      const [room1Data, room2Data] = await Promise.all([
        reservation1.room_id ? supabase
          .from("rooms")
          .select("id, room_number, name, category_id, status, is_blocked")
          .eq("id", reservation1.room_id)
          .single() : Promise.resolve({ data: null }),
        reservation2.room_id ? supabase
          .from("rooms")
          .select("id, room_number, name, category_id, status, is_blocked")
          .eq("id", reservation2.room_id)
          .single() : Promise.resolve({ data: null })
      ]);

      const room1Name = room1Data.data?.name || room1Data.data?.room_number || "N/A";
      const room2Name = room2Data.data?.name || room2Data.data?.room_number || "N/A";

      // Formatar datas para exibição
      const formatDateForDisplay = (dateStr: string) => {
        if (!dateStr) return "N/A";
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
      };

      const normalizeDate = (date: string | null | undefined): string | null => {
        if (!date) return null;
        if (date.includes('T')) {
          return date.split('T')[0];
        }
        return date;
      };

      // Preparar dados para o diálogo
      setPendingSwap({
        reservation1,
        reservation2,
        reservation1OldRoom: reservation1.room_id || "",
        reservation1OldRoomName: room1Name,
        reservation1OldCheckin: formatDateForDisplay(normalizeDate(reservation1.checkin_date) || ""),
        reservation1OldCheckout: formatDateForDisplay(normalizeDate(reservation1.checkout_date) || ""),
        reservation2OldRoom: reservation2.room_id || "",
        reservation2OldRoomName: room2Name,
        reservation2OldCheckin: formatDateForDisplay(normalizeDate(reservation2.checkin_date) || ""),
        reservation2OldCheckout: formatDateForDisplay(normalizeDate(reservation2.checkout_date) || ""),
      });

      setReservationForSwap(null);
      setSwapConfirmOpen(true);
    } catch (error: any) {
      console.error("❌ Erro ao preparar troca:", error);
      toast.error("Erro ao preparar troca de reservas");
      setReservationForSwap(null);
    }
  }, []);

  // Função para confirmar a troca
  const confirmSwap = useCallback(async () => {
    if (!pendingSwap) return;

    try {
      const { reservation1, reservation2 } = pendingSwap;

      // Buscar dados completos dos quartos de destino (incluindo status e bloqueios)
      const [room1Data, room2Data] = await Promise.all([
        pendingSwap.reservation2OldRoom ? supabase
          .from("rooms")
          .select("id, room_number, name, category_id, status, is_blocked")
          .eq("id", pendingSwap.reservation2OldRoom)
          .single() : Promise.resolve({ data: null }),
        pendingSwap.reservation1OldRoom ? supabase
          .from("rooms")
          .select("id, room_number, name, category_id, status, is_blocked")
          .eq("id", pendingSwap.reservation1OldRoom)
          .single() : Promise.resolve({ data: null })
      ]);

      const reservation1NewCategoryId = room1Data.data?.category_id || reservation1.category_id;
      const reservation2NewCategoryId = room2Data.data?.category_id || reservation2.category_id;

      // VALIDAÇÃO 1: Verificar compatibilidade de espaço antes de realizar a troca
      // Reserva 1 -> Quarto da Reserva 2
      const compatibility1 = await validateSpaceCompatibility(
        reservation1,
        pendingSwap.reservation2OldRoom || null,
        reservation1NewCategoryId
      );

      if (!compatibility1.compatible) {
        toast.error(
          `⚠️ Incompatibilidade de espaço para Reserva ${reservation1.reservation_code}:\n${compatibility1.reason}`,
          { duration: 8000 }
        );
        return;
      }

      // Reserva 2 -> Quarto da Reserva 1
      const compatibility2 = await validateSpaceCompatibility(
        reservation2,
        pendingSwap.reservation1OldRoom || null,
        reservation2NewCategoryId
      );

      if (!compatibility2.compatible) {
        toast.error(
          `⚠️ Incompatibilidade de espaço para Reserva ${reservation2.reservation_code}:\n${compatibility2.reason}`,
          { duration: 8000 }
        );
        return;
      }

      // VALIDAÇÃO 2: Verificar se ambas as reservas têm a mesma quantidade de noites/diárias
      // Isso evita problemas de faturamento e lógica de negócio ao trocar reservas com durações diferentes
      if (!reservation1.checkin_date || !reservation1.checkout_date || 
          !reservation2.checkin_date || !reservation2.checkout_date) {
        toast.error("Datas inválidas para calcular quantidade de noites");
        return;
      }

      const reservation1Checkin = parseISO(reservation1.checkin_date);
      const reservation1Checkout = parseISO(reservation1.checkout_date);
      const reservation2Checkin = parseISO(reservation2.checkin_date);
      const reservation2Checkout = parseISO(reservation2.checkout_date);

      const reservation1Nights = differenceInDays(reservation1Checkout, reservation1Checkin);
      const reservation2Nights = differenceInDays(reservation2Checkout, reservation2Checkin);

      if (reservation1Nights !== reservation2Nights) {
        toast.error(
          `⚠️ Não é possível trocar reservas com quantidades diferentes de noites:\n` +
          `Reserva ${reservation1.reservation_code}: ${reservation1Nights} noite${reservation1Nights !== 1 ? 's' : ''}\n` +
          `Reserva ${reservation2.reservation_code}: ${reservation2Nights} noite${reservation2Nights !== 1 ? 's' : ''}\n\n` +
          `As reservas devem ter a mesma quantidade de diárias para serem trocadas.`,
          { duration: 10000 }
        );
        return;
      }

      // Converter datas de DD/MM/YYYY para YYYY-MM-DD
      const formatDateForDB = (dateStr: string) => {
        if (!dateStr || dateStr === "N/A") return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      };

      // Preparar datas para troca: cada reserva recebe as datas da outra (troca completa de espaço físico)
      // Reserva 1 receberá as datas da Reserva 2
      // Reserva 2 receberá as datas da Reserva 1
      // NOTA: As datas serão redefinidas mais abaixo antes de aplicar a troca
      // Aqui apenas validamos que as datas originais existem
      if (!reservation1.checkin_date || !reservation1.checkout_date || !reservation2.checkin_date || !reservation2.checkout_date) {
        toast.error("Datas inválidas para troca");
        return;
      }

      // Verificar conflitos com outras reservas nos quartos de destino
      // IMPORTANTE: Usar as datas APÓS a troca para verificar conflitos
      // Primeiro, calcular as datas após a troca para validação de conflitos
      const reservation1CheckinAfterSwap = parseISO(reservation2.checkin_date);
      const reservation1CheckoutAfterSwap = parseISO(reservation2.checkout_date);
      const reservation2CheckinAfterSwap = parseISO(reservation1.checkin_date);
      const reservation2CheckoutAfterSwap = parseISO(reservation1.checkout_date);

      // Normalizar datas das reservas após a troca para comparação de conflitos
      const reservation1CheckinNormalized = startOfDay(reservation1CheckinAfterSwap);
      const reservation1CheckoutNormalized = startOfDay(reservation1CheckoutAfterSwap);
      const reservation2CheckinNormalized = startOfDay(reservation2CheckinAfterSwap);
      const reservation2CheckoutNormalized = startOfDay(reservation2CheckoutAfterSwap);
      
      const conflicts: string[] = [];

      // Verificar conflitos no quarto de destino da Reserva 1 (quarto da Reserva 2)
      if (pendingSwap.reservation2OldRoom) {
        const { data: allReservationsInRoom1 } = await supabase
          .from("reservations")
          .select("id, reservation_code, checkin_date, checkout_date, guest_name, status, notes")
          .eq("room_id", pendingSwap.reservation2OldRoom)
          .neq("id", reservation1.id) // Excluir a própria reserva 1
          .neq("id", reservation2.id) // Excluir a reserva 2 (que vai sair deste quarto)
          .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"]);

        if (allReservationsInRoom1) {
          allReservationsInRoom1.forEach((otherReservation: any) => {
            const otherCheckin = startOfDay(parseISO(otherReservation.checkin_date));
            const otherCheckout = startOfDay(parseISO(otherReservation.checkout_date));
            
            // Verificar se há sobreposição de datas
            // Checkout é exclusivo - uma reserva que termina no dia X não conflita com outra que começa no dia X
            // Há conflito se: checkin da reserva 1 < checkout da outra E checkout da reserva 1 > checkin da outra
            const hasOverlap = 
              (reservation1CheckinNormalized < otherCheckout && reservation1CheckoutNormalized > otherCheckin);
            
            if (hasOverlap) {
              const period = `${format(otherCheckin, "dd/MM")} a ${format(otherCheckout, "dd/MM")}`;
              const guestName = otherReservation.guest_name || "Hóspede não informado";
              const reservationCode = otherReservation.reservation_code || otherReservation.id.substring(0, 8);
              
              if (otherReservation.status === "blocked") {
                const blockReason = otherReservation.notes?.replace(/^Bloqueio:\s*/i, "") || "sem motivo";
                conflicts.push(`🚫 BLOQUEIO no quarto ${pendingSwap.reservation2OldRoomName}:\n   Período: ${period}\n   Motivo: ${blockReason}`);
              } else if (otherReservation.status === "preregistration") {
                conflicts.push(`📋 PRÉ-RESERVA no quarto ${pendingSwap.reservation2OldRoomName}:\n   Período: ${period}\n   Hóspede: ${guestName}\n   Código: ${reservationCode}`);
              } else {
                const statusLabel = otherReservation.status === "checkedin" ? "CHECK-IN REALIZADO" : 
                                  otherReservation.status === "confirmed" ? "CONFIRMADA" : "PENDENTE";
                conflicts.push(`🔴 RESERVA ${statusLabel} no quarto ${pendingSwap.reservation2OldRoomName}:\n   Período: ${period}\n   Hóspede: ${guestName}\n   Código: ${reservationCode}`);
              }
            }
          });
        }
      }

      // Verificar conflitos no quarto de destino da Reserva 2 (quarto da Reserva 1)
      if (pendingSwap.reservation1OldRoom) {
        const { data: allReservationsInRoom2 } = await supabase
          .from("reservations")
          .select("id, reservation_code, checkin_date, checkout_date, guest_name, status, notes")
          .eq("room_id", pendingSwap.reservation1OldRoom)
          .neq("id", reservation1.id) // Excluir a reserva 1 (que vai sair deste quarto)
          .neq("id", reservation2.id) // Excluir a própria reserva 2
          .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"]);

        if (allReservationsInRoom2) {
          allReservationsInRoom2.forEach((otherReservation: any) => {
            const otherCheckin = startOfDay(parseISO(otherReservation.checkin_date));
            const otherCheckout = startOfDay(parseISO(otherReservation.checkout_date));
            
            // Verificar se há sobreposição de datas
            // Checkout é exclusivo - uma reserva que termina no dia X não conflita com outra que começa no dia X
            // Há conflito se: checkin da reserva 2 < checkout da outra E checkout da reserva 2 > checkin da outra
            const hasOverlap = 
              (reservation2CheckinNormalized < otherCheckout && reservation2CheckoutNormalized > otherCheckin);
            
            if (hasOverlap) {
              const period = `${format(otherCheckin, "dd/MM")} a ${format(otherCheckout, "dd/MM")}`;
              const guestName = otherReservation.guest_name || "Hóspede não informado";
              const reservationCode = otherReservation.reservation_code || otherReservation.id.substring(0, 8);
              
              if (otherReservation.status === "blocked") {
                const blockReason = otherReservation.notes?.replace(/^Bloqueio:\s*/i, "") || "sem motivo";
                conflicts.push(`🚫 BLOQUEIO no quarto ${pendingSwap.reservation1OldRoomName}:\n   Período: ${period}\n   Motivo: ${blockReason}`);
              } else if (otherReservation.status === "preregistration") {
                conflicts.push(`📋 PRÉ-RESERVA no quarto ${pendingSwap.reservation1OldRoomName}:\n   Período: ${period}\n   Hóspede: ${guestName}\n   Código: ${reservationCode}`);
              } else {
                const statusLabel = otherReservation.status === "checkedin" ? "CHECK-IN REALIZADO" : 
                                  otherReservation.status === "confirmed" ? "CONFIRMADA" : "PENDENTE";
                conflicts.push(`🔴 RESERVA ${statusLabel} no quarto ${pendingSwap.reservation1OldRoomName}:\n   Período: ${period}\n   Hóspede: ${guestName}\n   Código: ${reservationCode}`);
              }
            }
          });
        }
      }

      // Se houver conflitos, bloquear a troca
      if (conflicts.length > 0) {
        toast.error(
          `⚠️ Não é possível realizar a troca. Há conflitos com outras reservas:\n\n${conflicts.join("\n\n")}`,
          { duration: 8000 }
        );
        return;
      }

      // Realizar troca: trocar QUARTO E DATAS para que cada reserva ocupe exatamente o espaço físico da outra
      // Reserva 1 recebe o quarto E as datas da Reserva 2 (ocupa exatamente o espaço físico da Reserva 2)
      // Reserva 2 recebe o quarto E as datas da Reserva 1 (ocupa exatamente o espaço físico da Reserva 1)
      // IMPORTANTE: Mantemos todos os outros atributos (hóspede, valores, notas, etc.)
      
      // Preparar datas da Reserva 2 para a Reserva 1 (troca completa de espaço físico)
      const reservation1NewCheckin = reservation2.checkin_date;
      const reservation1NewCheckout = reservation2.checkout_date;
      
      // Preparar datas da Reserva 1 para a Reserva 2 (troca completa de espaço físico)
      const reservation2NewCheckin = reservation1.checkin_date;
      const reservation2NewCheckout = reservation1.checkout_date;
      
      // Validar datas após a troca
      const reservation1CheckinDateAfterSwap = parseISO(reservation1NewCheckin);
      const reservation1CheckoutDateAfterSwap = parseISO(reservation1NewCheckout);
      const reservation2CheckinDateAfterSwap = parseISO(reservation2NewCheckin);
      const reservation2CheckoutDateAfterSwap = parseISO(reservation2NewCheckout);
      
      if (isAfter(reservation1CheckinDateAfterSwap, reservation1CheckoutDateAfterSwap) || 
          isSameDay(reservation1CheckinDateAfterSwap, reservation1CheckoutDateAfterSwap)) {
        toast.error(`As datas da troca não são válidas para a reserva ${reservation1.reservation_code}: o check-in deve ser anterior ao check-out`);
        return;
      }
      
      if (isAfter(reservation2CheckinDateAfterSwap, reservation2CheckoutDateAfterSwap) || 
          isSameDay(reservation2CheckinDateAfterSwap, reservation2CheckoutDateAfterSwap)) {
        toast.error(`As datas da troca não são válidas para a reserva ${reservation2.reservation_code}: o check-in deve ser anterior ao check-out`);
        return;
      }
      
      // Preparar dados de atualização preservando TODOS os outros atributos e metadados
      const updateData1: any = {
        room_id: pendingSwap.reservation2OldRoom || null,
        category_id: reservation1NewCategoryId,
        // Trocar datas: Reserva 1 recebe as datas da Reserva 2
        checkin_date: reservation1NewCheckin,
        checkout_date: reservation1NewCheckout,
        // Preservar TODOS os outros campos da reserva 1 (hóspede, valores, notas, etc.)
      };

      const updateData2: any = {
        room_id: pendingSwap.reservation1OldRoom || null,
        category_id: reservation2NewCategoryId,
        // Trocar datas: Reserva 2 recebe as datas da Reserva 1
        checkin_date: reservation2NewCheckin,
        checkout_date: reservation2NewCheckout,
        // Preservar TODOS os outros campos da reserva 2 (hóspede, valores, notas, etc.)
      };

      const updates = await Promise.all([
        // Atualizar reserva 1: recebe o quarto da reserva 2, mantém todos os outros atributos
        supabase
          .from("reservations")
          .update(updateData1)
          .eq("id", reservation1.id),
        
        // Atualizar reserva 2: recebe o quarto da reserva 1, mantém todos os outros atributos
        supabase
          .from("reservations")
          .update(updateData2)
          .eq("id", reservation2.id)
      ]);

      const [update1, update2] = updates;

      if (update1.error || update2.error) {
        const error = update1.error || update2.error;
        console.error("❌ Erro ao trocar reservas:", error);
        toast.error(error?.message || "Erro ao trocar reservas");
        return;
      }

      // Registrar log de atividade para ambas as reservas
      try {
        const reservation1Code = reservation1.reservation_code || reservation1.id.substring(0, 8).toUpperCase();
        const reservation2Code = reservation2.reservation_code || reservation2.id.substring(0, 8).toUpperCase();

        // Log para reserva 1
        await logActivity({
          actionType: "swapped",
          entityType: "reservation",
          entityId: reservation1.id,
          entityCode: reservation1Code,
          description: createSwapDescription(reservation1Code, reservation2Code),
          oldValues: {
            room_id: pendingSwap.reservation1OldRoom,
            room_name: pendingSwap.reservation1OldRoomName,
            checkin_date: formatDateForDB(pendingSwap.reservation1OldCheckin),
            checkout_date: formatDateForDB(pendingSwap.reservation1OldCheckout),
            category_id: reservation1.category_id,
          },
          newValues: {
            room_id: pendingSwap.reservation2OldRoom,
            room_name: pendingSwap.reservation2OldRoomName,
            checkin_date: reservation1NewCheckin, // Recebe datas da Reserva 2 (troca completa)
            checkout_date: reservation1NewCheckout, // Recebe datas da Reserva 2 (troca completa)
            category_id: reservation1NewCategoryId,
          },
          metadata: {
            swapped_with_reservation_id: reservation2.id,
            swapped_with_reservation_code: reservation2Code,
          },
        });

        // Log para reserva 2
        await logActivity({
          actionType: "swapped",
          entityType: "reservation",
          entityId: reservation2.id,
          entityCode: reservation2Code,
          description: createSwapDescription(reservation2Code, reservation1Code),
          oldValues: {
            room_id: pendingSwap.reservation2OldRoom,
            room_name: pendingSwap.reservation2OldRoomName,
            checkin_date: formatDateForDB(pendingSwap.reservation2OldCheckin),
            checkout_date: formatDateForDB(pendingSwap.reservation2OldCheckout),
            category_id: reservation2.category_id,
          },
          newValues: {
            room_id: pendingSwap.reservation1OldRoom,
            room_name: pendingSwap.reservation1OldRoomName,
            checkin_date: reservation2NewCheckin, // Recebe datas da Reserva 1 (troca completa)
            checkout_date: reservation2NewCheckout, // Recebe datas da Reserva 1 (troca completa)
            category_id: reservation2NewCategoryId,
          },
          metadata: {
            swapped_with_reservation_id: reservation1.id,
            swapped_with_reservation_code: reservation1Code,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de troca:", logError);
        // Não interromper o fluxo principal
      }

      // Fechar diálogo primeiro
      setSwapConfirmOpen(false);
      setPendingSwap(null);
      setReservationForSwap(null);

      // Invalidar TODAS as queries de reservas (incluindo as com filtros específicos de data)
      // Usar exact: false para invalidar todas as variações da query
      queryClient.invalidateQueries({ 
        queryKey: ["reservations"],
        exact: false // Invalidar todas as queries que começam com ["reservations"]
      });
      
      // Invalidar outras queries relacionadas
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["web_checkin"] })
      ]);

      // Forçar refetch imediato de todas as queries ativas de reservas
      await queryClient.refetchQueries({ 
        queryKey: ["reservations"],
        type: 'active',
        exact: false // Refetch todas as queries que começam com ["reservations"]
      });

      // Aguardar um pouco para garantir que o React tenha tempo de atualizar o estado
      await new Promise(resolve => setTimeout(resolve, 200));

      toast.success("Reservas trocadas com sucesso!");
    } catch (error: any) {
      console.error("❌ Erro ao confirmar troca:", error);
      toast.error(error.message || "Erro ao trocar reservas");
    }
  }, [pendingSwap, queryClient, validateSpaceCompatibility]);

  // Função para cancelar a troca
  const cancelSwap = useCallback(() => {
    setSwapConfirmOpen(false);
    setPendingSwap(null);
  }, []);

  // Limpar cache de células quando necessário
  useEffect(() => {
    // Limpar cache quando as datas visíveis mudarem
    cellCacheRef.current.clear();
    lastHoveredCellRef.current = null;
  }, [visibleDates]);

  // Listener global para drag de reserva
  useEffect(() => {
    if (!draggedReservation) {
      // Limpar referências quando não há drag
      mouseDownPositionRef.current = null;
      isActualDragRef.current = false;
      lastHoveredCellRef.current = null;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      // Limpar cache quando drag termina
      cellCacheRef.current.clear();
      return;
    }

    document.addEventListener("mousemove", handleReservationMouseMove, { passive: true });
    document.addEventListener("mouseup", handleReservationMouseUp);
    
    // Só mudar cursor se for drag real
    if (isActualDragRef.current) {
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleReservationMouseMove);
      document.removeEventListener("mouseup", handleReservationMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Limpar animation frame ao desmontar
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [draggedReservation, handleReservationMouseMove, handleReservationMouseUp]);

  const handleStayResizeMouseDown = useCallback((e: React.MouseEvent, reservation: any) => {
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    setHoveredReservationPreview(null);

    if (!canUpdate("reservations")) {
      toast.error("Você não tem permissão para alterar reservas");
      return;
    }
    if (["blocked", "cancelled", "checkedout", "noshow"].includes(reservation.status)) return;
    if (!reservation.room_id) {
      toast.error("Selecione um quarto antes de alterar as diárias");
      return;
    }

    const originalCheckout = normalizeDate(reservation.checkout_date);
    const checkin = normalizeDate(reservation.checkin_date);
    if (!originalCheckout || !checkin) return;

    let minCheckoutDate = addDays(parseISO(checkin), 1);
    if (reservation.status === "checkedin") {
      const tomorrow = addDays(startOfDay(new Date()), 1);
      if (tomorrow > minCheckoutDate) minCheckoutDate = tomorrow;
    }
    const minCheckout = format(minCheckoutDate, "yyyy-MM-dd");

    isActualResizeRef.current = false;
    mouseDownPositionRef.current = { x: e.clientX, y: e.clientY };
    setResizingReservation({
      reservation,
      roomId: reservation.room_id,
      originalCheckout,
      previewCheckout: originalCheckout,
      minCheckout,
      nightDelta: 0,
      conflict: false,
    });
  }, [canUpdate, normalizeDate]);

  const handleStayResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingReservation || !mouseDownPositionRef.current) return;

    const deltaX = Math.abs(e.clientX - mouseDownPositionRef.current.x);
    const deltaY = Math.abs(e.clientY - mouseDownPositionRef.current.y);
    if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) >= 4) {
      isActualResizeRef.current = true;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    }

    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
    const cellElement = elementUnderMouse?.closest("[data-room-id]") as HTMLElement | null;
    if (!cellElement) return;

    const dateIndexStr = cellElement.getAttribute("data-date-index");
    if (dateIndexStr === null) return;
    const dateIndex = parseInt(dateIndexStr, 10);
    const lastNight = visibleDates[dateIndex];
    if (!lastNight) return;

    let previewCheckout = format(addDays(startOfDay(lastNight), 1), "yyyy-MM-dd");
    if (previewCheckout < resizingReservation.minCheckout) {
      previewCheckout = resizingReservation.minCheckout;
    }

    const nightDelta = differenceInDays(
      parseISO(previewCheckout),
      parseISO(resizingReservation.originalCheckout),
    );

    let conflict = false;
    if (nightDelta > 0) {
      for (let i = 0; i < nightDelta; i++) {
        const night = addDays(parseISO(resizingReservation.originalCheckout), i);
        if (isDateOccupied(night, resizingReservation.roomId, resizingReservation.reservation.id)) {
          conflict = true;
          break;
        }
      }
    }

    setResizingReservation((prev) => {
      if (!prev) return prev;
      if (
        prev.previewCheckout === previewCheckout &&
        prev.nightDelta === nightDelta &&
        prev.conflict === conflict
      ) {
        return prev;
      }
      return { ...prev, previewCheckout, nightDelta, conflict };
    });
  }, [resizingReservation, visibleDates, isDateOccupied]);

  const refundPaymentsForAmount = useCallback(async (
    reservation: any,
    refundAmount: number,
    reason: string,
  ) => {
    if (refundAmount <= 0) return;

    const estId = reservation.establishment_id || establishmentId;
    if (!estId) {
      console.warn("establishment_id ausente ao registrar estorno de encurtamento");
      return;
    }

    const { data: payments, error } = await supabase
      .from("payments")
      .select("id, amount, created_at, payment_method, carrier_id, payment_type_id, notes")
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar pagamentos para estorno:", error);
      return;
    }

    let remaining = Math.round(refundAmount * 100) / 100;
    const originals = (payments || []).filter((p: any) => !isPaymentRefundRecord(p) && Number(p.amount || 0) > 0);

    for (const payment of originals) {
      if (remaining <= 0.009) break;
      const amt = Number(payment.amount || 0);
      if (!payment.id || amt <= 0) continue;

      const alreadyRefunded = (payments || [])
        .filter((p: any) => getRefundedPaymentId(p) === payment.id)
        .reduce((sum: number, p: any) => sum + Math.abs(Number(p.amount || 0)), 0);
      const refundable = Math.round((amt - alreadyRefunded) * 100) / 100;
      if (refundable <= 0.009) continue;

      const slice = Math.round(Math.min(refundable, remaining) * 100) / 100;
      const refundResult = await recordProcessedRefund({
        establishment_id: estId,
        payment_id: payment.id,
        reservation_id: reservation.id,
        amount: slice,
        reason,
        metadata: {
          source: "map_shorten_stay",
          reservation_code: reservation.reservation_code,
        },
      });

      if (!refundResult.success) {
        console.error("Erro ao registrar estorno:", refundResult.error);
      }

      const { error: insertError } = await supabase.from("payments").insert({
        reservation_id: reservation.id,
        amount: -slice,
        payment_method: payment.payment_method || "other",
        payment_date: new Date().toISOString(),
        notes: `[REFUND:${payment.id}] ${reason}`,
        carrier_id: payment.carrier_id || null,
        payment_type_id: payment.payment_type_id || null,
      });

      if (insertError) {
        console.error("Erro ao lançar registro de estorno:", insertError);
      }

      remaining = Math.round((remaining - slice) * 100) / 100;
    }
  }, [establishmentId]);

  const applyStayCheckoutUpdate = useCallback(async ({
    reservation,
    oldCheckout,
    newCheckout,
    newTotal,
    newPaid,
    paymentStatus,
    activityDescription,
    oldValues,
    newValues,
  }: {
    reservation: any;
    oldCheckout: string;
    newCheckout: string;
    newTotal: number;
    newPaid: number;
    paymentStatus: string;
    activityDescription: string;
    oldValues: Record<string, any>;
    newValues: Record<string, any>;
  }) => {
    const { error } = await supabase
      .from("reservations")
      .update({
        checkout_date: newCheckout,
        total_amount: newTotal,
        paid_amount: newPaid,
        payment_status: paymentStatus,
      })
      .eq("id", reservation.id);

    if (error) throw error;

    await supabase
      .from("accounts_receivable")
      .update({
        amount: newTotal,
        paid_amount: newPaid,
        status:
          newPaid >= newTotal && newTotal > 0
            ? "paid"
            : newPaid > 0
              ? "partial"
              : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", reservation.id)
      .eq("origin", "reservation")
      .neq("status", "cancelled");

    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
    queryClient.invalidateQueries({ queryKey: ["financial"] });
    queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
    queryClient.invalidateQueries({ queryKey: ["refunds"] });
    queryClient.invalidateQueries({ queryKey: ["payments"] });

    scheduleChannelSyncAfterInventoryChange(establishmentId || null);

    void logActivity({
      actionType: "dates_changed",
      entityType: "reservation",
      entityId: reservation.id,
      entityCode: reservation.reservation_code,
      description: activityDescription,
      oldValues: { ...oldValues, checkout_date: oldCheckout },
      newValues: {
        ...newValues,
        checkout_date: newCheckout,
        total_amount: newTotal,
        paid_amount: newPaid,
        payment_status: paymentStatus,
      },
    });
  }, [queryClient, establishmentId]);

  const handleStayResizeMouseUp = useCallback(async () => {
    const resize = resizingReservation;
    const wasResize = isActualResizeRef.current;
    isActualResizeRef.current = false;
    mouseDownPositionRef.current = null;
    setResizingReservation(null);

    if (!wasResize || !resize || resize.nightDelta === 0) return;

    suppressClickAfterDragRef.current = true;
    window.setTimeout(() => {
      suppressClickAfterDragRef.current = false;
    }, 250);

    if (resize.nightDelta > 0 && resize.conflict) {
      toast.error("Não é possível acrescentar diárias: o período seguinte está ocupado");
      return;
    }

    const reservation = resize.reservation;
    const oldCheckout = resize.originalCheckout;
    const newCheckout = resize.previewCheckout;
    const nightDelta = resize.nightDelta;
    const checkin = normalizeDate(reservation.checkin_date) || reservation.checkin_date;
    const originalNights = Math.max(1, differenceInDays(parseISO(oldCheckout), parseISO(checkin)));
    const currentTotal = Number(reservation.total_amount || 0);
    const paidAmount = Number(reservation.paid_amount || 0);
    const categoryId = reservation.category_id || reservation.room_categories?.id;
    const pricingPlanId = reservation.pricing_plan_id || reservation.pricing_plans?.id || undefined;

    const calcRangeAmount = async (from: string, to: string, nights: number) => {
      let amount = 0;
      if (categoryId) {
        amount = await calculatePrice(
          categoryId,
          from,
          to,
          undefined,
          pricingPlanId,
          undefined,
          reservation.adults || 1,
          reservation.children || 0,
        );
      }
      if (!amount || amount <= 0) {
        amount = (currentTotal / originalNights) * nights;
      }
      return Math.round(amount * 100) / 100;
    };

    // Extensão: aplica direto
    if (nightDelta > 0) {
      setIsExtendingStay(true);
      try {
        const availability = await validateRoomAvailability(
          resize.roomId,
          checkin,
          newCheckout,
          reservation.id,
        );
        if (!availability.available) {
          toast.error(availability.reason || "Quarto não está disponível para a extensão");
          return;
        }

        const extraAmount = await calcRangeAmount(oldCheckout, newCheckout, nightDelta);
        const newTotal = Math.round((currentTotal + extraAmount) * 100) / 100;
        const pendingAmount = Math.max(0, Math.round((newTotal - paidAmount) * 100) / 100);
        const paymentStatus =
          paidAmount <= 0 ? "pending" : paidAmount >= newTotal && newTotal > 0 ? "paid" : "partial";

        await applyStayCheckoutUpdate({
          reservation,
          oldCheckout,
          newCheckout,
          newTotal,
          newPaid: paidAmount,
          paymentStatus,
          activityDescription: `Estadia estendida em ${nightDelta} diária(s): checkout ${oldCheckout} → ${newCheckout}. Valor adicional ${formatCurrency(extraAmount)}.`,
          oldValues: { total_amount: currentTotal, paid_amount: paidAmount },
          newValues: {},
        });

        toast.success(
          nightDelta === 1
            ? `1 diária acrescentada. Adicional ${formatCurrency(extraAmount)} · pendente ${formatCurrency(pendingAmount)}`
            : `${nightDelta} diárias acrescentadas. Adicional ${formatCurrency(extraAmount)} · pendente ${formatCurrency(pendingAmount)}`,
        );
      } catch (err: any) {
        console.error("Erro ao estender reserva:", err);
        toast.error(err?.message || "Não foi possível acrescentar as diárias");
      } finally {
        setIsExtendingStay(false);
      }
      return;
    }

    // Encurtamento: abrir diálogo com opção de estorno
    const removedNights = Math.abs(nightDelta);
    try {
      setIsExtendingStay(true);
      const removedAmount = await calcRangeAmount(newCheckout, oldCheckout, removedNights);
      const newTotal = Math.max(0, Math.round((currentTotal - removedAmount) * 100) / 100);
      const refundableAmount = Math.min(paidAmount, removedAmount);
      setPendingShorten({
        reservation,
        oldCheckout,
        newCheckout,
        removedNights,
        removedAmount,
        newTotal,
        paidAmount,
        refundableAmount,
      });
      setRefundShortenedNights(paidAmount >= newTotal && refundableAmount > 0);
    } catch (err: any) {
      console.error("Erro ao calcular encurtamento:", err);
      toast.error(err?.message || "Não foi possível calcular o encurtamento");
    } finally {
      setIsExtendingStay(false);
    }
  }, [
    resizingReservation,
    calculatePrice,
    normalizeDate,
    applyStayCheckoutUpdate,
  ]);

  const confirmShortenStay = useCallback(async () => {
    if (!pendingShorten) return;
    const {
      reservation,
      oldCheckout,
      newCheckout,
      removedNights,
      removedAmount,
      newTotal,
      paidAmount,
      refundableAmount,
    } = pendingShorten;

    const shouldRefund = refundShortenedNights && refundableAmount > 0;
    const refundAmount = shouldRefund ? refundableAmount : 0;
    const newPaid = Math.max(0, Math.round((paidAmount - refundAmount) * 100) / 100);
    const paymentStatus =
      newPaid <= 0 ? "pending" : newPaid >= newTotal && newTotal > 0 ? "paid" : "partial";
    const pendingAmount = Math.max(0, Math.round((newTotal - newPaid) * 100) / 100);

    setIsExtendingStay(true);
    try {
      if (refundAmount > 0) {
        await refundPaymentsForAmount(
          reservation,
          refundAmount,
          `Estorno por encurtamento da reserva ${reservation.reservation_code}: ${removedNights} diária(s) removida(s)`,
        );
        void logActivity({
          actionType: "payment_refunded",
          entityType: "reservation",
          entityId: reservation.id,
          entityCode: reservation.reservation_code,
          description: `Estorno de ${formatCurrency(refundAmount)} por redução de ${removedNights} diária(s).`,
          oldValues: { paid_amount: paidAmount },
          newValues: { paid_amount: newPaid, refund_amount: refundAmount },
        });
      }

      await applyStayCheckoutUpdate({
        reservation,
        oldCheckout,
        newCheckout,
        newTotal,
        newPaid,
        paymentStatus,
        activityDescription: `Estadia encurtada em ${removedNights} diária(s): checkout ${oldCheckout} → ${newCheckout}. Valor reduzido ${formatCurrency(removedAmount)}${refundAmount > 0 ? `. Estorno ${formatCurrency(refundAmount)}` : ""}.`,
        oldValues: { total_amount: Number(reservation.total_amount || 0), paid_amount: paidAmount },
        newValues: { refund_amount: refundAmount },
      });

      setPendingShorten(null);
      setRefundShortenedNights(false);

      toast.success(
        refundAmount > 0
          ? `${removedNights} diária(s) removida(s). Redução ${formatCurrency(removedAmount)} · estorno ${formatCurrency(refundAmount)} · pendente ${formatCurrency(pendingAmount)}`
          : `${removedNights} diária(s) removida(s). Redução ${formatCurrency(removedAmount)} · pendente ${formatCurrency(pendingAmount)}`,
      );
    } catch (err: any) {
      console.error("Erro ao encurtar reserva:", err);
      toast.error(err?.message || "Não foi possível encurtar as diárias");
    } finally {
      setIsExtendingStay(false);
    }
  }, [
    pendingShorten,
    refundShortenedNights,
    refundPaymentsForAmount,
    applyStayCheckoutUpdate,
  ]);

  useEffect(() => {
    if (!resizingReservation) return;
    document.addEventListener("mousemove", handleStayResizeMouseMove);
    document.addEventListener("mouseup", handleStayResizeMouseUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleStayResizeMouseMove);
      document.removeEventListener("mouseup", handleStayResizeMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingReservation, handleStayResizeMouseMove, handleStayResizeMouseUp]);

  // Listener global para drag de criação
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      if (dragStart && dragEnd) {
        handleMouseUp(dragStart.categoryId, dragStart.roomId);
      } else {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, dragEnd]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleBuilding = (buildingId: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) {
        next.delete(buildingId);
      } else {
        next.add(buildingId);
      }
      return next;
    });
  };

  const isDateInSelection = (date: Date, categoryId?: string, roomId?: string) => {
    if (!isDragging || !dragStart || !dragEnd) return false;
    if (dragStart.categoryId && categoryId !== dragStart.categoryId) return false;
    if (dragStart.roomId && roomId !== dragStart.roomId) return false;

    const dateNormalized = startOfDay(date);
    const startNormalized = startOfDay(dragStart.date);
    const endNormalized = startOfDay(dragEnd);

    const minDate = startNormalized < endNormalized ? startNormalized : endNormalized;
    const maxDate = startNormalized > endNormalized ? startNormalized : endNormalized;

    return dateNormalized >= minDate && dateNormalized <= maxDate;
  };

  /** Apenas visual: posição da célula no intervalo selecionado (não altera a lógica de seleção). */
  const getSelectionEdge = (
    date: Date,
    categoryId?: string,
    roomId?: string
  ): "start" | "end" | "middle" | "single" | null => {
    if (!isDateInSelection(date, categoryId, roomId) || !dragStart || !dragEnd) return null;

    const dateNormalized = startOfDay(date);
    const startNormalized = startOfDay(dragStart.date);
    const endNormalized = startOfDay(dragEnd);
    const minDate = startNormalized < endNormalized ? startNormalized : endNormalized;
    const maxDate = startNormalized > endNormalized ? startNormalized : endNormalized;

    if (isSameDay(minDate, maxDate)) return "single";
    if (isSameDay(dateNormalized, minDate)) return "start";
    if (isSameDay(dateNormalized, maxDate)) return "end";
    return "middle";
  };

  if (categoriesLoading) {
    return <div className="p-8 text-center">Carregando categorias e quartos...</div>;
  }

  if (categoriesError) {
    return (
      <div className="p-8 text-center text-red-500">
        Erro ao carregar categorias: {categoriesError instanceof Error ? categoriesError.message : "Erro desconhecido"}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nenhuma categoria encontrada.
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-3.5">
      {/* Legenda + Controles */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Status
          </span>
          {Object.entries(statusConfig)
            .filter(([key]) => key !== "checkedout" && key !== "noshow")
            .map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: config.legendColor }}
                />
                <span className="text-[10px] sm:text-[11px] text-slate-600 whitespace-nowrap">
                  {config.label}
                </span>
              </div>
            ))}
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
              style={{ backgroundColor: PRE_CHECKIN_DOT_COLOR }}
            />
            <span className="text-[10px] sm:text-[11px] text-slate-600 whitespace-nowrap">
              Pré check-in (web)
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full sm:w-[200px] md:w-[220px] justify-start text-left font-normal h-9 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <span className="text-xs sm:text-sm truncate text-slate-700">
                  {format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(startOfDay(date))}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 border-slate-200 bg-white shadow-sm text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setStartDate(startOfDay(new Date()))}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0 border-slate-200 bg-white shadow-sm"
              onClick={() => setStartDate(addDays(startDate, -viewDays))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0 border-slate-200 bg-white shadow-sm"
              onClick={() => setStartDate(addDays(startDate, viewDays))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Select value={viewDays.toString()} onValueChange={(v) => setViewDays(Number(v))}>
              <SelectTrigger className="w-full sm:w-[110px] h-9 border-slate-200 bg-white shadow-sm text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <Card className="p-0 overflow-x-auto -mx-4 sm:mx-0 border-slate-200/90 shadow-sm rounded-xl">
        <div className="min-w-full" style={{ 
          '--cell-width': viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
          minWidth: `${192 + (visibleDates.length * (viewDays <= 14 ? 90 : viewDays <= 30 ? 70 : viewDays <= 60 ? 50 : 40))}px`
        } as React.CSSProperties}>
          {/* Cabeçalho com datas */}
          <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
            {/* Linha 0: Mês e Ano */}
            <div className="flex border-b border-slate-100 bg-slate-50/80">
              <div className="w-32 sm:w-48 md:w-56 flex-shrink-0 p-1.5 sm:p-2 border-r border-slate-200 bg-slate-50/80"></div>
              <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`, width: '100%', minWidth: 'fit-content' }}>
                {monthGroups.map((group) => {
                  const span = group.endIndex - group.startIndex + 1;
                  return (
                    <div
                      key={group.monthYear}
                      className="px-2 py-1 text-center border-r border-slate-100 last:border-r-0"
                      style={{
                        gridColumn: `${group.startIndex + 1} / span ${span}`,
                      }}
                    >
                      <div className="text-slate-500 font-medium text-[10px] sm:text-[11px] uppercase tracking-wider">
                        {group.month} {group.year}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Linha 1: Data e Dia */}
            <div className="flex border-b border-slate-100">
              <div className="w-32 sm:w-48 md:w-56 flex-shrink-0 px-2.5 py-2 border-r border-slate-200 bg-white font-semibold text-[10px] sm:text-[11px] text-slate-500 flex items-center tracking-wide">
                <span className="truncate">Categoria / Quarto</span>
              </div>
              <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`, width: '100%', minWidth: 'fit-content' }}>
                {visibleDates.map((date, dateIndex) => {
                  const isToday = isSameDay(date, new Date());
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isPreviousDay = dateIndex === 0 && isSameDay(date, addDays(startDate, -1));
                  
                  return (
                    <div 
                      key={date.toISOString()} 
                      className={cn(
                        "relative border-r border-slate-100 last:border-r-0 px-0.5 py-1.5 sm:py-2 text-center transition-colors duration-150",
                        isToday && "bg-sky-50",
                        isPreviousDay && !isToday && "bg-amber-50/40",
                        isWeekend && !isToday && !isPreviousDay && "bg-slate-50/70",
                        !isToday && !isWeekend && !isPreviousDay && "bg-white"
                      )}
                      style={{ 
                        minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                        fontSize: viewDays <= 30 ? '10px' : '9px',
                        width: '100%'
                      }}
                    >
                      {isToday && (
                        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-sky-500" />
                      )}
                      <div
                        className={cn(
                          "uppercase tracking-wide text-[9px] sm:text-[10px] font-medium",
                          isToday ? "text-sky-700" : "text-slate-400"
                        )}
                      >
                        {viewDays <= 30 ? format(date, "EEE", { locale: ptBR }) : format(date, "EEEEEE", { locale: ptBR })}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 font-semibold tabular-nums",
                          isToday ? "text-sky-900 text-[12px] sm:text-[13px]" : "text-slate-700 text-[11px] sm:text-[12px]"
                        )}
                      >
                        {format(date, "dd")}
                      </div>
                      {isToday && viewDays <= 30 && (
                        <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider text-sky-600">
                          <span className="h-1 w-1 rounded-full bg-sky-500" />
                          Hoje
                        </div>
                      )}
                    </div>
                  );
                })}
        </div>
      </div>

          </div>

          {/* Linhas de categorias e quartos */}
          <div ref={gridRef}>
            {(() => {
              console.log("🎨 Renderizando categorias:", categories.length, categories.map((c: any) => ({ id: c.id, name: c.name, rooms: c.rooms?.length || 0 })));
              
              // Agrupar categorias por prédio
              const categoriesByBuilding = new Map<string | null, any[]>();
              const buildingInfoMap = new Map<string, any>();
              
              categories.forEach((category: any) => {
                const buildingId = category.building_id || null;
                if (!categoriesByBuilding.has(buildingId)) {
                  categoriesByBuilding.set(buildingId, []);
                }
                categoriesByBuilding.get(buildingId)!.push(category);
                
                // Armazenar informações do prédio
                if (buildingId && category.buildings) {
                  buildingInfoMap.set(buildingId, category.buildings);
                }
              });
              
              const result: JSX.Element[] = [];
              
              // Função para renderizar uma categoria
              const renderCategory = (category: any) => {
                const isExpanded = expandedCategories.has(category.id);
                const rooms = category.rooms || [];

                return (
                <div key={category.id}>
                  {/* Linha da categoria */}
                  <div className="flex border-b border-slate-200/80 bg-slate-50/90 hover:bg-slate-100/80 transition-colors duration-150 overflow-visible" style={{ minHeight: '40px', width: '100%' }}>
                    <div className="w-32 sm:w-48 md:w-56 flex-shrink-0 px-2 py-1.5 border-r border-slate-200 bg-slate-50/90 flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="p-1 sm:p-1.5 hover:bg-white rounded-md transition-colors duration-150 border border-transparent hover:border-slate-200 flex-shrink-0 touch-manipulation"
                        aria-label={isExpanded ? "Recolher categoria" : "Expandir categoria"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                        )}
                      </button>
                      <span className="font-semibold text-[10px] sm:text-[11px] uppercase text-slate-800 tracking-wide truncate">
                        {category.category_kind === "parking" ? "🅿️ " : ""}
                        {category.name}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">
                        {rooms.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-visible" style={{ 
                      display: 'grid', 
                      gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`,
                      width: '100%',
                      minWidth: `${visibleDates.length * (viewDays <= 14 ? 90 : viewDays <= 30 ? 70 : viewDays <= 60 ? 50 : 40)}px`
                    }}>
                      {visibleDates.map((date) => {
                        // Garantir que a data esteja normalizada antes de formatar
                        const normalizedDate = startOfDay(date);
                        const dateStr = format(normalizedDate, "yyyy-MM-dd");
                        const isOccupied = rooms.some((room: any) => isDateOccupied(date, room.id));
                        
                        // Buscar preço do rate_calendar (sistema tarifário)
                        // Primeiro, tentar encontrar no rate_calendar para o plano padrão (BAR)
                        const defaultPlan = ratePlans.find((p: any) => p.code === 'BAR' && p.is_active) || ratePlans.find((p: any) => p.is_active);
                        const planId = defaultPlan?.id;
                        
                        // Buscar entrada no rate_calendar para esta categoria, data e plano
                        // Garantir que a comparação seja feita com a data normalizada
                        // r.date já deve estar no formato "yyyy-MM-dd" do banco de dados
                        const rateEntry = planId ? rateCalendar.find(
                          (r: any) => {
                            // Se r.date já está no formato "yyyy-MM-dd", usar diretamente
                            // Caso contrário, normalizar
                            let rateDateStr = r.date;
                            if (rateDateStr && typeof rateDateStr === 'string') {
                              // Se contém hora/timezone, extrair apenas a data
                              if (rateDateStr.includes('T') || rateDateStr.includes(' ')) {
                                rateDateStr = rateDateStr.split('T')[0].split(' ')[0];
                              }
                              // Garantir que está no formato correto
                              if (!/^\d{4}-\d{2}-\d{2}$/.test(rateDateStr)) {
                                // Tentar parsear e normalizar
                                try {
                                  const parsed = parseISO(rateDateStr);
                                  if (!isNaN(parsed.getTime())) {
                                    rateDateStr = format(startOfDay(parsed), "yyyy-MM-dd");
                                  }
                                } catch {
                                  return false;
                                }
                              }
                            }
                            return r.category_id === category.id && 
                                   rateDateStr === dateStr && 
                                   r.pricing_plan_id === planId;
                          }
                        ) : null;
                        
                        // Obter preço com regras dinâmicas aplicadas
                        // Usar cache de preços calculados se disponível
                        const cacheKey = planId ? `${planId}-${category.id}-${dateStr}` : null;
                        const cachedPrice = cacheKey ? calculatedPricesCache.get(cacheKey) : undefined;
                        const price = toFiniteNumber(
                          cachedPrice !== undefined && toFiniteNumber(cachedPrice) > 0
                            ? cachedPrice
                            : rateEntry?.base_price ?? category.base_price,
                        );
                        
                        // Calcular preço com regras dinâmicas em background se houver plano
                        if (planId && cacheKey && (!cachedPrice || cachedPrice === 0)) {
                          // Calcular em background e atualizar cache
                          calculateRatePrice(category.id, planId, date).then(calculatedPrice => {
                            if (calculatedPrice > 0) {
                              const currentPrice = rateEntry?.base_price || Number(category.base_price) || 0;
                              // Só atualizar se for diferente
                              if (Math.abs(calculatedPrice - currentPrice) > 0.01) {
                                setCalculatedPricesCache(prev => {
                                  const updated = new Map(prev);
                                  updated.set(cacheKey, calculatedPrice);
                                  return updated;
                                });
                              }
                            }
                          }).catch(() => {
                            // Ignorar erros no cálculo em background
                          });
                        }
                        
                        // Calcular disponibilidade da categoria (ocupados + interditados + manutenção)
                        const totalRooms = rooms.length;
                        const unavailableCount = rooms.filter(
                          (room: any) => isDateOccupied(date, room.id) || isRoomUnavailableForBooking(room)
                        ).length;
                        const availableRooms = Math.max(0, totalRooms - unavailableCount);
                        
                        return (
                          <div
                            key={date.toISOString()}
                            className={cn(
                              "relative border-r border-slate-100 last:border-r-0 px-1 py-1 text-center flex flex-col justify-center select-none",
                              isSameDay(date, new Date()) && "bg-sky-50/40",
                              isOccupied
                                ? "bg-slate-100/60 opacity-70"
                                : "bg-slate-50/50"
                            )}
                            style={{ 
                              minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                              minHeight: '40px',
                              cursor: "default",
                            }}
                            title="Disponibilidade e tarifário (somente visualização)"
                          >
                            {/* Exibir tarifário e disponibilidade */}
                            {totalRooms > 0 && (
                              <>
                                <div 
                                  className="font-medium text-slate-500 mb-0.5" 
                                  style={{ fontSize: viewDays <= 30 ? '10px' : '9px' }}
                                >
                                  {viewDays <= 60 ? `${availableRooms} disp.` : availableRooms}
                            </div>
                                {price > 0 && (
                                  <div 
                                    className="font-semibold text-emerald-700 cursor-pointer hover:text-emerald-800 hover:underline transition-colors duration-150" 
                                    style={{ fontSize: viewDays <= 30 ? '9px' : '8px' }}
                                    title="Clique para ver tarifários"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      // Garantir que a data seja normalizada e seja a mesma exibida no calendário
                                      const normalizedDate = startOfDay(date);
                                      setRatePlansModalData({
                                        categoryId: category.id,
                                        categoryName: category.name,
                                        date: normalizedDate,
                                      });
                                      setRatePlansModalOpen(true);
                                    }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                    }}
                                    onMouseUp={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                    }}
                                  >
                                    {viewDays <= 60 ? `R$ ${price.toFixed(2).replace('.', ',')}` : `R$ ${Math.round(price)}`}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Linhas dos quartos */}
                  {isExpanded && rooms.map((room: any) => {
                    const roomReservations = reservationsByRoom[room.id] || [];
                    const visibleReservations = roomReservations.filter((r: any) => {
                      const pos = getReservationPosition(r, roomReservations);
                      return pos.isVisible;
                    });

                    const isMaintenance = isRoomInMaintenance(room);
                    const isInterdicted = room.is_blocked === true;
                    const isUnavailable = isRoomUnavailableForBooking(room);

                    return (
                      <div key={room.id} className={cn(
                        "flex transition-colors duration-150 relative border-b border-slate-100",
                        isInterdicted
                          ? "bg-rose-50/40 hover:bg-rose-50/60"
                          : isMaintenance
                          ? "bg-amber-50/40 hover:bg-amber-50/60"
                          : "bg-white hover:bg-slate-50/60"
                      )} style={{ minHeight: "40px" }}>
                        <div className={cn(
                          "w-32 sm:w-48 md:w-56 flex-shrink-0 px-2 py-1.5 pl-4 sm:pl-7 border-r border-slate-100 text-[10px] sm:text-xs flex items-center gap-1.5 sm:gap-2",
                          isInterdicted ? "bg-rose-50/50" : isMaintenance ? "bg-amber-50/50" : "bg-white"
                        )}>
                          {isInterdicted && (
                            <Lock className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                          )}
                          {isMaintenance && !isInterdicted && (
                            <Wrench className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={cn(
                              "text-[11px] sm:text-xs font-medium truncate",
                              isInterdicted ? "text-rose-800" : isMaintenance ? "text-amber-900" : "text-slate-700"
                            )}>
                              {room.name || room.room_number}
                            </div>
                            {isMaintenance && (
                              <div className="text-[9px] sm:text-[10px] font-medium text-amber-700 truncate leading-tight">
                                Em manutenção
                              </div>
                            )}
                            {isInterdicted && !isMaintenance && (
                              <div className="text-[9px] sm:text-[10px] font-medium text-rose-600 truncate leading-tight">
                                Interditado
                              </div>
                            )}
                          </div>
                        </div>
                        <div 
                          className="flex-1 relative"
                          style={{ 
                            display: 'grid',
                            gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`,
                            gap: 0,
                            width: '100%',
                            minWidth: 'fit-content'
                          }}
                        >
                          {/* Células de fundo */}
                          {visibleDates.map((date, dateIndex) => {
                            const isSelected = isDateInSelection(date, category.id, room.id);
                            const selectionEdge = getSelectionEdge(date, category.id, room.id);
                            const isOccupied = isDateOccupied(date, room.id, draggedReservation?.reservation?.id);
                            const isHovered = hoveredCell?.roomId === room.id && hoveredCell?.dateIndex === dateIndex;
                            const isValidDrop = draggedReservation && hoveredCell?.roomId === room.id && 
                              !isUnavailable &&
                              !isDateOccupied(date, room.id, draggedReservation.reservation.id);
                            const isBlocked = isUnavailable;
                            const isToday = isSameDay(date, new Date());
                            
                            return (
                              <div
                                key={date.toISOString()}
                                data-room-id={room.id}
                                data-date-index={dateIndex}
                                className={cn(
                                  "relative border-r border-slate-100/90 last:border-r-0 transition-colors duration-150 flex items-center justify-center",
                                  isToday && !isSelected && !isBlocked && !isOccupied && "bg-sky-50/30",
                                  isInterdicted
                                    ? "bg-rose-50/25 cursor-not-allowed"
                                    : isMaintenance
                                    ? "bg-amber-50/30 cursor-not-allowed"
                                    : isOccupied
                                    ? "bg-slate-50/80 cursor-not-allowed"
                                    : isSelected 
                                    ? cn(
                                        "bg-sky-100/75 cursor-pointer z-[1]",
                                        selectionEdge === "single" && "rounded-md shadow-[inset_0_0_0_1px_rgba(56,189,248,0.55)]",
                                        selectionEdge === "start" && "rounded-l-md shadow-[inset_1px_0_0_0_rgba(56,189,248,0.55),inset_0_1px_0_0_rgba(56,189,248,0.45),inset_0_-1px_0_0_rgba(56,189,248,0.45)]",
                                        selectionEdge === "end" && "rounded-r-md shadow-[inset_-1px_0_0_0_rgba(56,189,248,0.55),inset_0_1px_0_0_rgba(56,189,248,0.45),inset_0_-1px_0_0_rgba(56,189,248,0.45)]",
                                        selectionEdge === "middle" && "shadow-[inset_0_1px_0_0_rgba(56,189,248,0.35),inset_0_-1px_0_0_rgba(56,189,248,0.35)]"
                                      )
                                    : isHovered && draggedReservation && isValidDrop
                                    ? "bg-emerald-50/90 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.55)] cursor-move"
                                    : isHovered && draggedReservation && !isValidDrop
                                    ? "bg-rose-50/80 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.5)] cursor-not-allowed"
                                    : "hover:bg-sky-50/50 cursor-pointer"
                                )}
                                style={{ 
                                  minHeight: "40px",
                                  minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onMouseDown={(e) => {
                                  if (isBlocked) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toast.error(getRoomUnavailableMessage(room));
                                    return;
                                  }
                                  if (!draggedReservation && !isOccupied) {
                                    e.preventDefault();
                                    handleMouseDown(date, category.id, room.id);
                                  }
                                }}
                                onMouseEnter={() => {
                                  if (isDragging && !isOccupied && !isBlocked) {
                                    handleMouseEnter(date, category.id, room.id);
                                  }
                                }}
                                onClick={(e) => {
                                  if (isBlocked) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toast.error(getRoomUnavailableMessage(room));
                                    return;
                                  }
                                }}
                                onMouseUp={(e) => {
                                  if (resizingReservation || isExtendingStay) return;
                                  if (!draggedReservation && !isOccupied) {
                                    e.preventDefault();
                                    handleMouseUp(category.id, room.id, date);
                                  }
                                }}
                                title={
                                  isMaintenance
                                    ? "Quarto em manutenção — indisponível até a conclusão"
                                    : isInterdicted
                                    ? "Quarto interditado — não é possível criar reserva"
                                    : isOccupied
                                    ? "Data ocupada - não é possível criar reserva"
                                    : "Clique para criar reserva"
                                }
                              >
                                {isSelected && (selectionEdge === "start" || selectionEdge === "single") && (
                                  <span
                                    className="pointer-events-none absolute left-0.5 top-1/2 z-[2] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-sky-500 text-white shadow-sm ring-2 ring-white"
                                    title="Check-in"
                                    aria-hidden
                                  >
                                    <LogIn className="h-3 w-3" strokeWidth={2.5} />
                                  </span>
                                )}
                                {isSelected && (selectionEdge === "end" || selectionEdge === "single") && (
                                  <span
                                    className="pointer-events-none absolute right-0.5 top-1/2 z-[2] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-amber-500 text-white shadow-sm ring-2 ring-white"
                                    title="Check-out"
                                    aria-hidden
                                  >
                                    <LogOut className="h-3 w-3" strokeWidth={2.5} />
                                  </span>
                                )}
                              </div>
                            );
                          })}

                          {/* Reservas */}
                          {visibleReservations.map((reservation: any) => {
                              const pos = getReservationPosition(reservation, roomReservations);
                            if (!pos.isVisible) return null;

                            // AJUSTE: Calcular offset de posição se esta reserva começa no dia de checkout de outra
                            let leftOffset = 0;
                            const reservationCheckinStr = normalizeDate(reservation.checkin_date);
                            
                            // Verificar se há outra reserva que termina (checkout) no dia de check-in desta reserva
                            if (reservationCheckinStr) {
                              const reservationWithCheckoutOnThisCheckin = roomReservations.find((otherReservation: any) => {
                                if (otherReservation.id === reservation.id) return false;
                                if (otherReservation.status === "cancelled") return false;
                                if (!isValidReservation(otherReservation)) return false;
                                
                                const otherCheckoutStr = normalizeDate(otherReservation.checkout_date);
                                return otherCheckoutStr === reservationCheckinStr;
                              });
                              
                              if (reservationWithCheckoutOnThisCheckin) {
                                // Calcular posição da outra reserva para obter sua extensão visual
                                const otherPos = getReservationPosition(reservationWithCheckoutOnThisCheckin, roomReservations);
                                if (otherPos.isVisible && otherPos.visualExtension > 0) {
                                  // Ajustar o left desta reserva para começar após a extensão visual da outra
                                  // A extensão visual é uma fração de dia, então convertemos para porcentagem
                                  leftOffset = (otherPos.visualExtension / visibleDates.length) * 100;
                                }
                              }
                            }

                            // Determinar cor baseada no pagamento
                            // NOVA LÓGICA:
                            // - Confirmada (Pago - verde): quando valor base original está pago (paid_amount >= total_amount base)
                            // - Pendente (Pgt Pendente - amarelo): quando há taxas pendentes OU base não paga completamente
                            // - Não Pago (vermelho): quando não há pagamento (paid_amount === 0)
                            let statusColor;
                            let showCheckinDot = false;
                            const showPreCheckinDot =
                              isWebCheckinCompleted(reservation.web_checkin) &&
                              reservation.status !== "checkedin";
                            const paidAmount = Number(reservation.paid_amount || 0);
                            const baseTotalAmount = Number(reservation.total_amount || 0);
                            
                            // Calcular total incluindo taxas extras
                            const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
                              return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
                            }, 0);
                            
                            const totalWithFees = baseTotalAmount + serviceFeesTotal;
                            
                            if (reservation.status === "checkedin") {
                              // Bolinha azul só quando há pendência; quitada = só a cor de check-in
                              const isFullyPaid =
                                (paidAmount >= totalWithFees && totalWithFees > 0) ||
                                (paidAmount >= baseTotalAmount && baseTotalAmount > 0 && serviceFeesTotal <= 0);

                              if (paidAmount === 0) {
                                statusColor = statusConfig.unpaid;
                                showCheckinDot = true;
                              } else if (isFullyPaid) {
                                statusColor = statusConfig.checkedin;
                                showCheckinDot = false;
                              } else {
                                statusColor = statusConfig.pending;
                                showCheckinDot = true;
                              }
                            } else if (
                              reservation.status === "blocked" ||
                              reservation.status === "cancelled" ||
                              reservation.status === "preregistration" ||
                              reservation.status === "checkedout" ||
                              reservation.status === "noshow"
                            ) {
                              // Status especiais: usar cor da legenda
                              statusColor = statusConfig[reservation.status] || statusConfig.confirmed;
                            } else if (paidAmount === 0 || reservation.status === "unpaid") {
                              // Sem pagamento = Não Pago (vermelho)
                              statusColor = statusConfig.unpaid || statusConfig.confirmed;
                            } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
                              // Valor base pago: verificar se há taxas pendentes
                              if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
                                // Base paga MAS com taxas pendentes = Pendente (amarelo)
                                statusColor = statusConfig.pending;
                              } else {
                                // Base paga E sem taxas pendentes = Confirmada (verde)
                              statusColor = statusConfig.confirmed;
                              }
                            } else {
                              // Base não paga completamente = Pendente (amarelo)
                              statusColor = statusConfig.pending;
                            }
                            
                            const isDraggingThis = draggedReservation?.reservation?.id === reservation.id;
                            const isSelectedForSwap = reservationForSwap?.id === reservation.id;
                            const isResizingThis = resizingReservation?.reservation?.id === reservation.id;
                            const previewNightDelta = isResizingThis ? resizingReservation.nightDelta : 0;
                            const previewDuration = Math.max(1, pos.duration + previewNightDelta);
                            const canExtendStay = !["blocked", "cancelled", "checkedout", "noshow"].includes(reservation.status);
                              
                              return (
                                <div
                                  key={reservation.id}
                                  className={cn(
                                  "absolute rounded-md border transition-all duration-150 flex items-center gap-1.5 px-2 py-0.5 group shadow-sm",
                                    statusColor.bg,
                                    statusColor.text,
                                    statusColor.border,
                                  isResizingThis && resizingReservation.conflict && "ring-2 ring-rose-400",
                                  isResizingThis && !resizingReservation.conflict && previewNightDelta > 0 && "ring-2 ring-amber-400",
                                  isResizingThis && previewNightDelta < 0 && "ring-2 ring-sky-400",
                                  isDraggingThis
                                    ? "opacity-30 cursor-grabbing z-50"
                                    : isSelectedForSwap
                                    ? "ring-2 ring-sky-400 ring-offset-1 cursor-pointer z-20 shadow-md"
                                    : "cursor-grab active:cursor-grabbing hover:shadow-md hover:brightness-[0.98] z-10"
                                  )}
                                  style={{
                                  left: `${(pos.startIndex / visibleDates.length) * 100 + leftOffset}%`,
                                  width: `${Math.min((previewDuration / visibleDates.length) * 100 - leftOffset, 100 - ((pos.startIndex / visibleDates.length) * 100 + leftOffset))}%`,
                                  height: "28px",
                                  top: "6px",
                                  margin: "0 2px",
                                  pointerEvents: resizingReservation ? 'none' : 'auto',
                                  userSelect: 'none',
                                  WebkitUserSelect: 'none',
                                  touchAction: 'none',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isHoverPreviewEnabled || draggedReservation || isDragging) return;
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setHoveredReservationPreview({
                                      reservation,
                                      roomLabel: room.name || room.room_number || null,
                                      statusLabel: showCheckinDot
                                        ? `Check-in · ${statusColor.label}`
                                        : statusColor.label,
                                      statusColor: statusColor.legendColor,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top,
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredReservationPreview((prev) =>
                                      prev?.reservation?.id === reservation.id ? null : prev
                                    );
                                  }}
                                  onContextMenu={(e) => handleReservationContextMenu(e, reservation)}
                                  onMouseDown={(e) => {
                                      e.stopPropagation();
                                      setHoveredReservationPreview(null);
                                  handleReservationMouseDown(e, reservation);
                                }}
                                onClick={(e) => {
                                        e.stopPropagation();
                                  
                                  // Se houve drag (ou acabou de soltar no mesmo lugar), não abrir modal
                                  if (isActualDragRef.current || suppressClickAfterDragRef.current) {
                                    return;
                                  }
                                  
                                  // Usar timeout para garantir que o mouseUp foi processado primeiro
                                  clickTimeoutRef.current = setTimeout(() => {
                                    // Verificar novamente se não houve drag
                                    if (isActualDragRef.current || suppressClickAfterDragRef.current) {
                                      return;
                                    }
                                  
                                  // Se há uma reserva selecionada para troca e não é a mesma
                                  if (reservationForSwap && reservationForSwap.id !== reservation.id) {
                                    // Preparar troca
                                    handleReservationSwap(reservationForSwap, reservation);
                                    return;
                                  }

                                  // Se for bloqueio, abrir modal de bloqueio
                                            if (reservation.status === "blocked") {
                                    setSelectedBlockId(reservation.id);
                                    setBlockViewOpen(true);
                                            } else {
                                    // Abrir modal de visualização rápida
                                    setSelectedReservation(reservation);
                                    setQuickViewOpen(true);
                                }
                                  }, 10);
                              }}
                              >
                                {viewDays <= 30 && <GripVertical className="h-3 w-3 opacity-50 flex-shrink-0" />}
                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                  {showPreCheckinDot && (
                                    <span
                                      className="h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white/70 shadow-sm"
                                      style={{ backgroundColor: PRE_CHECKIN_DOT_COLOR }}
                                      title="Pré check-in online concluído"
                                    />
                                  )}
                                  {showCheckinDot && (
                                    <span
                                      className="h-2 w-2 rounded-full flex-shrink-0 ring-2 ring-white/70 shadow-sm"
                                      style={{ backgroundColor: statusConfig.checkedin.legendColor }}
                                      title="Check-in realizado"
                                    />
                                  )}
                                  {reservation.status === "blocked" ? (
                                    <Lock className="h-3 w-3 opacity-70 flex-shrink-0" />
                                  ) : (reservation.adults || 1) + (reservation.children || 0) >= 2 ? (
                                    <Users className="h-3 w-3 opacity-70 flex-shrink-0" aria-hidden title="2 ou mais hóspedes" />
                                  ) : (
                                    <User className="h-3 w-3 opacity-70 flex-shrink-0" aria-hidden />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div 
                                      className="font-semibold truncate leading-tight" 
                                      style={{ fontSize: viewDays <= 30 ? '10px' : '9px' }}
                                    >
                                      {reservation.status === "blocked" 
                                        ? "Bloqueado"
                                        : viewDays <= 60 
                                        ? (reservation.guest_name || reservation.reservation_code)
                                        : (reservation.guest_name?.split(' ')[0] || reservation.reservation_code?.substring(0, 8))
                                      }
                                    </div>
                                    {viewDays <= 30 && reservation.status !== "blocked" && (
                                      <div className="text-[8px] sm:text-[9px] opacity-80 truncate leading-tight">
                                        {[
                                          reservation.channel,
                                          showPreCheckinDot && reservation.status !== "checkedin"
                                            ? "Pré check-in"
                                            : showCheckinDot
                                              ? "Check-in"
                                              : statusColor.label,
                                        ].filter(Boolean).join(" · ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {canExtendStay && (
                                  <div
                                    className="absolute right-0 top-0 bottom-0 z-[4] w-7 cursor-ew-resize group/extend"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      handleStayResizeMouseDown(e, reservation);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Arraste para acrescentar ou reduzir diárias"
                                  >
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      title="Arraste para acrescentar ou reduzir diárias"
                                      className={cn(
                                        "absolute right-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-amber-500 text-white shadow-sm ring-2 ring-white cursor-ew-resize pointer-events-none transition-opacity",
                                        isResizingThis ? "opacity-100" : "opacity-0 group-hover/extend:opacity-100",
                                      )}
                                    >
                                      <LogOut className="h-3 w-3" strokeWidth={2.5} />
                                    </button>
                                  </div>
                                )}
                                {isResizingThis && previewNightDelta !== 0 && (
                                  <span
                                    className={cn(
                                      "pointer-events-none absolute -top-5 right-0 rounded px-1.5 py-0.5 text-[9px] font-semibold text-white shadow",
                                      resizingReservation.conflict
                                        ? "bg-rose-600"
                                        : previewNightDelta < 0
                                          ? "bg-sky-600"
                                          : "bg-amber-600",
                                    )}
                                  >
                                    {resizingReservation.conflict
                                      ? "Indisponível"
                                      : previewNightDelta > 0
                                        ? `+${previewNightDelta} diária${previewNightDelta > 1 ? "s" : ""}`
                                        : `${previewNightDelta} diária${previewNightDelta < -1 ? "s" : ""}`}
                                  </span>
                                )}
                              </div>
                              );
                            })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              };
              
              // Renderizar categorias sem prédio primeiro
              const categoriesWithoutBuilding = categoriesByBuilding.get(null) || [];
              categoriesWithoutBuilding.forEach((category: any) => {
                result.push(renderCategory(category));
              });
              
              // Renderizar prédios com suas categorias
              Array.from(categoriesByBuilding.entries())
                .filter(([buildingId]) => buildingId !== null)
                .forEach(([buildingId, buildingCategories]) => {
                  const buildingInfo = buildingInfoMap.get(buildingId);
                  const buildingName = buildingInfo?.name || `Prédio ${buildingId.substring(0, 8)}`;
                  const isBuildingExpanded = expandedBuildings.has(buildingId);
                  
                  // Contar total de quartos no prédio
                  const totalRoomsInBuilding = buildingCategories.reduce((sum, cat: any) => sum + (cat.rooms?.length || 0), 0);
                  
                  result.push(
                    <div key={`building-${buildingId}`}>
                      {/* Cabeçalho do prédio */}
                      <div className="flex border-b border-slate-200 bg-slate-700 hover:bg-slate-800 transition-colors duration-150 overflow-visible" style={{ minHeight: '32px', width: '100%' }}>
                        <div className="w-32 sm:w-48 md:w-56 flex-shrink-0 px-2 py-1 border-r border-slate-600 bg-slate-700 flex items-center gap-1.5">
                          <button
                            onClick={() => toggleBuilding(buildingId)}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors duration-150 flex-shrink-0 touch-manipulation"
                            aria-label={isBuildingExpanded ? "Recolher prédio" : "Expandir prédio"}
                          >
                            {isBuildingExpanded ? (
                              <ChevronDown className="h-3 w-3 text-slate-200" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-slate-200" />
                            )}
                          </button>
                          <span className="font-semibold text-[10px] sm:text-[11px] uppercase text-slate-100 tracking-wide truncate">{buildingName}</span>
                          <span className="text-[9px] text-slate-300 font-medium bg-white/10 px-1.5 py-0.5 rounded flex-shrink-0">
                            {totalRoomsInBuilding}
                          </span>
                        </div>
                        <div className="flex-1 overflow-visible" style={{ 
                          display: 'grid', 
                          gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`,
                          width: '100%',
                          minWidth: `${visibleDates.length * (viewDays <= 14 ? 90 : viewDays <= 30 ? 70 : viewDays <= 60 ? 50 : 40)}px`
                        }}>
                          {visibleDates.map((date) => (
                            <div
                              key={date.toISOString()}
                              className="border-r border-slate-600/40 last:border-r-0 bg-slate-700/80"
                              style={{ 
                                minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                                minHeight: '32px'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      
                      {/* Categorias do prédio */}
                      {isBuildingExpanded && buildingCategories.map((category: any) => {
                        return renderCategory(category);
                      })}
                    </div>
                  );
                });
              
              return result;
            })()}
          </div>
        </div>
      </Card>

      {/* Dialog de criação rápida */}
      {quickDialogData && (
        <QuickReservationDialog
          open={quickDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              // Pequena janela para ignorar o clique que fechou o dialog.
              suppressQuickDialogUntilRef.current = Date.now() + 250;
            }
            setQuickDialogOpen(open);
            if (!open) setQuickDialogData(null);
          }}
          onProceed={(data) => {
            // Fechar o QuickReservationDialog primeiro
            setQuickDialogOpen(false);
            setQuickDialogData(null);
            
            // Depois chamar onCreateReservation (que pode abrir outro modal)
            if (onCreateReservation) {
              // Usar setTimeout para garantir que o QuickReservationDialog foi fechado
              setTimeout(() => {
              onCreateReservation({
                checkin_date: data.checkin_date,
                checkout_date: data.checkout_date,
                category_id: data.category_id,
                room_id: data.room_id,
                pricing_plan_id: data.pricing_plan_id,
                channel: data.channel,
                adults: data.adults,
                children: data.children,
                total_amount: data.total_amount,
                action: data.action,
                });
              }, 100);
            }
          }}
          onOpenMaintenance={(data) => {
            setQuickDialogOpen(false);
            setQuickDialogData(null);
            setTimeout(() => {
              onOpenMaintenance?.(data);
            }, 100);
          }}
          initialData={quickDialogData}
          rateCalendar={rateCalendar}
        />
      )}

      {/* Thumbnail ao passar o mouse sobre a reserva */}
      {hoveredReservationPreview && isHoverPreviewEnabled && !draggedReservation && !isDragging && (() => {
        const reservation = hoveredReservationPreview.reservation;
        const category = reservation.room_categories;
        const photos: string[] = Array.isArray(category?.display_photos) ? category.display_photos : [];
        const thumbnail = photos[0];
        const roomLabel = hoveredReservationPreview.roomLabel || null;
        const isBlocked = reservation.status === "blocked";
        const blockReason = isBlocked
          ? (reservation.notes?.replace(/^Bloqueio:\s*/i, "")?.trim() || "Não informado")
          : null;
        const previewTitle = isBlocked
          ? "Bloqueio"
          : reservation.guest_name || reservation.reservation_code || "Reserva";
        const baseTotalAmount = Number(reservation.total_amount || 0);
        const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
          return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
        }, 0);
        const totalWithFees = baseTotalAmount + serviceFeesTotal;
        const nights =
          reservation.checkin_date && reservation.checkout_date
            ? Math.max(0, differenceInDays(parseISO(reservation.checkout_date), parseISO(reservation.checkin_date)))
            : 0;

        const cardWidth = 280;
        const left = Math.min(
          Math.max(12, hoveredReservationPreview.x - cardWidth / 2),
          (typeof window !== "undefined" ? window.innerWidth : 1200) - cardWidth - 12
        );
        const top = Math.max(12, hoveredReservationPreview.y - 8);

        return (
          <div
            className="fixed z-[9998] pointer-events-none"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              transform: "translateY(-100%)",
              width: `${cardWidth}px`,
            }}
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
              {thumbnail && !isBlocked ? (
                <div className="relative h-28 w-full bg-slate-100">
                  <img
                    src={thumbnail}
                    alt={category?.name || "Categoria"}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2">
                    <div className="truncate text-xs font-semibold text-white">
                      {previewTitle}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {previewTitle}
                  </div>
                </div>
              )}

              <div className="space-y-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: hoveredReservationPreview.statusColor }}
                    />
                    {hoveredReservationPreview.statusLabel}
                  </span>
                  {!isBlocked && reservation.reservation_code && (
                    <span className="truncate font-mono text-[10px] text-slate-500">
                      {reservation.reservation_code}
                    </span>
                  )}
                </div>

                {isBlocked && (
                  <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
                    <span className="font-medium text-slate-500">Motivo: </span>
                    <span className="text-slate-800">{blockReason}</span>
                  </div>
                )}

                {reservation.checkin_date && reservation.checkout_date && (
                  <div className="text-[11px] text-slate-600">
                    <span className="font-medium text-slate-800">
                      {format(parseISO(reservation.checkin_date), "dd MMM", { locale: ptBR })}
                    </span>
                    {" → "}
                    <span className="font-medium text-slate-800">
                      {format(parseISO(reservation.checkout_date), "dd MMM", { locale: ptBR })}
                    </span>
                    {nights > 0 && (
                      <span className="text-slate-400">
                        {" · "}
                        {nights} {nights === 1 ? "noite" : "noites"}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                  {(category?.name || roomLabel) && (
                    <span className="truncate">
                      {[category?.name, roomLabel].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {!isBlocked && reservation.channel && (
                    <span className="truncate text-slate-500">{reservation.channel}</span>
                  )}
                </div>

                {!isBlocked && totalWithFees > 0 && (
                  <div className="text-[11px] font-semibold text-slate-800">
                    R$ {totalWithFees.toFixed(2).replace(".", ",")}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Preview da reserva sendo arrastada - só mostrar se for drag real */}
      {draggedReservation && dragPosition && isActualDragRef.current && (
        <div
          className="fixed pointer-events-none z-[9999] drag-preview-temp"
          style={{
            left: `${dragPosition.x}px`,
            top: `${dragPosition.y}px`,
            transform: draggedReservation.mouseOffset 
              ? `translate(-${draggedReservation.mouseOffset.x}px, -${draggedReservation.mouseOffset.y}px)` 
              : 'translate(-50%, -50%)',
            opacity: 0.95,
            transition: 'none',
            willChange: 'transform'
          }}
        >
          {(() => {
            // Determinar cor do preview baseada no pagamento
            // Mesma lógica do bloco de reserva
            const reservation = draggedReservation.reservation;
            let previewColor;
            const paidAmount = Number(reservation.paid_amount || 0);
            const baseTotalAmount = Number(reservation.total_amount || 0);
            
            // Calcular total incluindo taxas extras
            const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
              return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
            }, 0);
            
            const totalWithFees = baseTotalAmount + serviceFeesTotal;
            
            if (reservation.status === "checkedin") {
              // Check-in: cor segue o pagamento (pendência após extensão = amarelo)
              if (paidAmount === 0) {
                previewColor = statusConfig.unpaid;
              } else if (paidAmount >= totalWithFees && totalWithFees > 0) {
                previewColor = statusConfig.checkedin;
              } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0 && serviceFeesTotal <= 0) {
                previewColor = statusConfig.checkedin;
              } else {
                previewColor = statusConfig.pending;
              }
            } else if (
              reservation.status === "blocked" ||
              reservation.status === "cancelled" ||
              reservation.status === "preregistration" ||
              reservation.status === "checkedout" ||
              reservation.status === "noshow"
            ) {
              // Status especiais: usar cor da legenda
              previewColor = statusConfig[reservation.status] || statusConfig.confirmed;
            } else if (paidAmount === 0 || reservation.status === "unpaid") {
              // Sem pagamento = Não Pago (vermelho)
              previewColor = statusConfig.unpaid || statusConfig.confirmed;
            } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
              // Valor base pago: verificar se há taxas pendentes
              if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
                // Base paga MAS com taxas pendentes = Pendente (amarelo)
                previewColor = statusConfig.pending;
              } else {
                // Base paga E sem taxas pendentes = Confirmada (verde)
              previewColor = statusConfig.confirmed;
              }
            } else {
              // Base não paga completamente = Pendente (amarelo)
              previewColor = statusConfig.pending;
            }
            
            return (
              <div
                className={cn(
                  "rounded-md px-2.5 py-1.5 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs shadow-xl border touch-manipulation",
                  previewColor.bg,
                  previewColor.text,
                  previewColor.border,
                  "ring-2 ring-white/40"
                )}
                style={{
                  minWidth: viewDays <= 14 ? '180px' : viewDays <= 30 ? '140px' : '100px',
                  minHeight: "32px"
                }}
              >
                <GripVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-50 flex-shrink-0" />
                {draggedReservation.reservation.status === "blocked" ? (
                  <Lock className="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
                ) : (draggedReservation.reservation.adults || 1) + (draggedReservation.reservation.children || 0) >= 2 ? (
                  <Users className="h-3.5 w-3.5 opacity-70 flex-shrink-0" aria-hidden />
                ) : (
                  <User className="h-3.5 w-3.5 opacity-70 flex-shrink-0" aria-hidden />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-xs sm:text-sm">
                    {draggedReservation.reservation.status === "blocked" 
                      ? "Bloqueado"
                      : (draggedReservation.reservation.guest_name || draggedReservation.reservation.reservation_code)
                    }
                  </div>
                  <div className="text-[10px] opacity-70 flex items-center gap-1 mt-0.5">
                    <CalendarIcon className="h-3 w-3" />
                    <span>
                      {format(parseISO(draggedReservation.reservation.checkin_date), "dd/MM")} - {format(parseISO(draggedReservation.reservation.checkout_date), "dd/MM")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal de Visualização Rápida */}
      <ReservationQuickViewModal
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
        reservation={selectedReservation}
        onEdit={() => {
          if (selectedReservation) {
            onReservationAction?.("edit", selectedReservation.id);
          }
        }}
        onLaunchPayment={() => {
          if (selectedReservation) {
            setReservationForPayment(selectedReservation);
            setPaymentModalOpen(true);
          }
        }}
        onViewDetails={() => {
          if (selectedReservation) {
            const currentId = establishmentId || localStorage.getItem("selectedEstablishmentId");
            if (currentId) {
              if (selectedReservation?.reservation_code) {
                navigate(`/${currentId}/reservas/${selectedReservation.reservation_code}`);
              } else {
                // Fallback: se não encontrar o código, usar o ID
                navigate(`/${currentId}/reservas/${selectedReservation.id}`);
              }
            } else {
              onSelectReservation?.(selectedReservation.id);
            }
          }
        }}
        onTransfer={() => {
          if (selectedReservation) {
            setReservationToTransfer(selectedReservation);
            setTransferModalOpen(true);
          }
        }}
        onReallocate={
          selectedReservation?.status !== "blocked" && selectedReservation?.status !== "cancelled"
            ? () => {
                if (selectedReservation) {
                  setReservationToReallocate(selectedReservation);
                  setReallocationModalOpen(true);
                }
              }
            : undefined
        }
        onCancel={canDelete("reservations") ? () => {
          if (selectedReservation) {
            onReservationAction?.("cancel", selectedReservation.id);
          }
        } : undefined}
      />

      {/* Modal de Transferência */}
      <ReservationTransferModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
        reservation={reservationToTransfer}
        onSuccess={() => {
          // Recarregar dados após transferência
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["web_checkin"] }); // Invalidar web_checkin para atualizar dados da acomodação
          setReservationToTransfer(null);
        }}
      />

      {/* Modal de Realocação entre estabelecimentos */}
      <ReservationReallocationModal
        open={reallocationModalOpen}
        onOpenChange={(open) => {
          setReallocationModalOpen(open);
          if (!open) setReservationToReallocate(null);
        }}
        reservation={reservationToReallocate}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
          queryClient.invalidateQueries({ queryKey: ["financial"] });
          setReservationToReallocate(null);
          setQuickViewOpen(false);
          setSelectedReservation(null);
        }}
      />

      {/* Modal de Lançamento de Pagamento */}
      <ReservationPaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        reservation={reservationForPayment}
        onSuccess={() => {
          // Recarregar dados após lançar pagamento
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          setReservationForPayment(null);
        }}
      />

      {/* Modal de Visualização de Bloqueio */}
      {selectedBlockId && (
        <BlockViewDialog
          open={blockViewOpen}
          onOpenChange={(open) => {
            setBlockViewOpen(open);
            if (!open) {
              setSelectedBlockId(null);
            }
          }}
          reservationId={selectedBlockId}
          onDelete={async () => {
            try {
              // Buscar dados do bloqueio antes de cancelar
              const { data: blockReservation } = await supabase
                .from("reservations")
                .select(`
                  *,
                  rooms (*),
                  room_categories (*)
                `)
                .eq("id", selectedBlockId)
                .single();

              // Cancelar a reserva de bloqueio
              const { error } = await supabase
                .from("reservations")
                .update({ status: "cancelled" })
                .eq("id", selectedBlockId);

              if (error) throw error;

              // Registrar log de atividade
              if (blockReservation) {
                try {
                  const roomName = blockReservation.rooms?.name || 
                                 blockReservation.rooms?.room_number || 
                                 blockReservation.room_categories?.name || 
                                 "N/A";
                  const blockReason = blockReservation.notes?.replace(/^Bloqueio:\s*/i, "") || "Não informado";
                  
                  await logActivity({
                    actionType: "unblocked",
                    entityType: "block",
                    entityId: blockReservation.id,
                    entityCode: null, // Bloqueios não têm código de reserva
                    description: `Quarto ${roomName} desbloqueado (bloqueio de ${blockReservation.checkin_date} a ${blockReservation.checkout_date})`,
                    oldValues: {
                      status: "blocked",
                      room_id: blockReservation.room_id,
                      room_name: roomName,
                      checkin_date: blockReservation.checkin_date,
                      checkout_date: blockReservation.checkout_date,
                      reason: blockReason,
                    },
                    newValues: {
                      status: "cancelled",
                    },
                    metadata: {
                      reservation_id: blockReservation.id,
                    },
                  });
                } catch (logError) {
                  console.error("Erro ao registrar log de desbloqueio:", logError);
                  // Não interromper o fluxo principal
                }
              }

              // Invalidar queries para atualizar a UI
              queryClient.invalidateQueries({ queryKey: ["reservations"] });
              queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
              queryClient.invalidateQueries({ queryKey: ["rooms"] });

              const estUnblock = String(blockReservation?.establishment_id ?? "").trim();
              scheduleChannelSyncAfterInventoryChange(estUnblock || null);
              
              toast.success("Quarto desbloqueado com sucesso!");
              setBlockViewOpen(false);
              setSelectedBlockId(null);
            } catch (error: any) {
              toast.error(error.message || "Erro ao desbloquear quarto");
            }
          }}
        />
      )}

      {/* Diálogo de confirmação de encurtamento de estadia */}
      <Dialog
        open={!!pendingShorten}
        onOpenChange={(open) => {
          if (!open && !isExtendingStay) {
            setPendingShorten(null);
            setRefundShortenedNights(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encurtar diárias</DialogTitle>
            <DialogDescription>
              Confirme a redução da estadia
              {pendingShorten?.reservation?.reservation_code
                ? ` da reserva ${pendingShorten.reservation.reservation_code}`
                : ""}
              .
            </DialogDescription>
          </DialogHeader>

          {pendingShorten && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border p-3 space-y-1.5">
                <p>
                  <span className="text-muted-foreground">Checkout:</span>{" "}
                  <span className="font-medium">
                    {format(parseISO(pendingShorten.oldCheckout), "dd/MM/yyyy")} →{" "}
                    {format(parseISO(pendingShorten.newCheckout), "dd/MM/yyyy")}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Diárias removidas:</span>{" "}
                  <span className="font-medium">{pendingShorten.removedNights}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Valor das diárias:</span>{" "}
                  <span className="font-medium text-rose-600">
                    −{formatCurrency(pendingShorten.removedAmount)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Novo total:</span>{" "}
                  <span className="font-medium">{formatCurrency(pendingShorten.newTotal)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Valor pago:</span>{" "}
                  <span className="font-medium">{formatCurrency(pendingShorten.paidAmount)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">
                    Pendente {refundShortenedNights && pendingShorten.refundableAmount > 0 ? "com estorno" : "sem estorno"}:
                  </span>{" "}
                  <span className="font-medium">
                    {formatCurrency(
                      Math.max(
                        0,
                        pendingShorten.newTotal -
                          (pendingShorten.paidAmount -
                            (refundShortenedNights ? pendingShorten.refundableAmount : 0)),
                      ),
                    )}
                  </span>
                </p>
              </div>

              {pendingShorten.refundableAmount > 0 ? (
                <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="refund_shortened_nights"
                      checked={refundShortenedNights}
                      onCheckedChange={(checked) => setRefundShortenedNights(checked === true)}
                      disabled={isExtendingStay}
                    />
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor="refund_shortened_nights"
                        className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                      >
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                        Estornar valor das diárias
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Remove o valor correspondente dos pagamentos da reserva.
                      </p>
                      <p className="text-xs font-semibold text-emerald-600">
                        Valor a estornar: {formatCurrency(pendingShorten.refundableAmount)}
                      </p>
                      {!refundShortenedNights && pendingShorten.paidAmount > pendingShorten.newTotal && (
                        <p className="text-xs text-amber-600">
                          Sem estorno, o valor pago ficará acima do novo total (crédito na reserva).
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Não há pagamentos suficientes para estorno nesta redução.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isExtendingStay}
              onClick={() => {
                setPendingShorten(null);
                setRefundShortenedNights(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isExtendingStay || !pendingShorten}
              onClick={() => void confirmShortenStay()}
            >
              {isExtendingStay ? "Salvando..." : "Confirmar encurtamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação de Movimentação */}
      <AlertDialog open={moveConfirmOpen} onOpenChange={(open) => !isMoving && setMoveConfirmOpen(open)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isMoving ? "Movendo Reserva..." : "Confirmar Movimentação de Reserva"}
            </AlertDialogTitle>
            {isMoving && (
              <div className="flex items-center justify-center py-4">
                <div className="flex flex-col items-center gap-3">
                  <svg
                    className="animate-spin h-8 w-8 text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="text-sm text-muted-foreground">Processando movimentação...</p>
                </div>
              </div>
            )}
            <div className={`space-y-4 mt-4 text-sm text-muted-foreground ${isMoving ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-semibold mb-2">Reserva: {pendingMove?.reservation.reservation_code || "N/A"}</p>
                
                <div className="space-y-3 mt-4">
                  <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-900/20">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2">📍 Posição Atual:</p>
                    <div className="text-sm space-y-1">
                      <p><strong>Quarto:</strong> {pendingMove?.oldRoomName}</p>
                      <p><strong>Check-in:</strong> {pendingMove?.oldCheckin}</p>
                      <p><strong>Check-out:</strong> {pendingMove?.oldCheckout}</p>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-900/20">
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">➡️ Nova Posição:</p>
                    <div className="text-sm space-y-1">
                      <p><strong>Quarto:</strong> {pendingMove?.newRoomName}</p>
                      <p><strong>Check-in:</strong> {pendingMove?.newCheckin}</p>
                      <p><strong>Check-out:</strong> {pendingMove?.newCheckout}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <strong>⚠️ Atenção:</strong> Esta ação não pode ser desfeita automaticamente. 
                    Verifique se não há conflitos de reserva antes de confirmar.
                  </p>
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelMove} disabled={isMoving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmMove} 
              className="bg-primary"
              disabled={isMoving}
            >
              {isMoving ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Movendo...
                </span>
              ) : (
                "Confirmar Movimentação"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Confirmação de Troca */}
      <AlertDialog open={swapConfirmOpen} onOpenChange={setSwapConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Troca de Reservas</AlertDialogTitle>
            <div className="space-y-4 mt-4 text-sm text-muted-foreground">
              <div>
                <p className="font-semibold mb-4 text-base">
                  Você está prestes a trocar as posições de duas reservas:
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                   {/* Reserva 1 */}
                   <div className="border rounded-lg p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20">
                     <p className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 sm:mb-3">
                       📋 Reserva 1: {pendingSwap?.reservation1.reservation_code || "N/A"}
                      </p>
                     <div className="text-xs sm:text-sm space-y-2">
                       <div className="border-b pb-2">
                         <p className="font-semibold text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">📍 Posição Atual:</p>
                         <p className="break-words"><strong>Quarto:</strong> {pendingSwap?.reservation1OldRoomName}</p>
                         <p className="break-words"><strong>Check-in:</strong> {pendingSwap?.reservation1OldCheckin}</p>
                         <p className="break-words"><strong>Check-out:</strong> {pendingSwap?.reservation1OldCheckout}</p>
                       </div>
                       <div className="pt-2">
                         <p className="font-semibold text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">➡️ Nova Posição:</p>
                         <p className="break-words"><strong>Quarto:</strong> {pendingSwap?.reservation2OldRoomName}</p>
                         <p className="break-words"><strong>Check-in:</strong> {pendingSwap?.reservation2OldCheckin}</p>
                         <p className="break-words"><strong>Check-out:</strong> {pendingSwap?.reservation2OldCheckout}</p>
                       </div>
                     </div>
                   </div>

                   {/* Reserva 2 */}
                   <div className="border rounded-lg p-3 sm:p-4 bg-green-50 dark:bg-green-900/20">
                     <p className="text-xs sm:text-sm font-semibold text-green-900 dark:text-green-100 mb-2 sm:mb-3">
                       📋 Reserva 2: {pendingSwap?.reservation2.reservation_code || "N/A"}
                      </p>
                     <div className="text-xs sm:text-sm space-y-2">
                       <div className="border-b pb-2">
                         <p className="font-semibold text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">📍 Posição Atual:</p>
                         <p className="break-words"><strong>Quarto:</strong> {pendingSwap?.reservation2OldRoomName}</p>
                         <p className="break-words"><strong>Check-in:</strong> {pendingSwap?.reservation2OldCheckin}</p>
                         <p className="break-words"><strong>Check-out:</strong> {pendingSwap?.reservation2OldCheckout}</p>
                       </div>
                       <div className="pt-2">
                         <p className="font-semibold text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1">➡️ Nova Posição:</p>
                         <p className="break-words"><strong>Quarto:</strong> {pendingSwap?.reservation1OldRoomName}</p>
                         <p className="break-words"><strong>Check-in:</strong> {pendingSwap?.reservation1OldCheckin}</p>
                         <p className="break-words"><strong>Check-out:</strong> {pendingSwap?.reservation1OldCheckout}</p>
                       </div>
                     </div>
                   </div>
                 </div>

                 <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                   <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                    <strong>⚠️ Atenção:</strong> Esta ação trocará completamente as posições das duas reservas 
                    (quarto, datas de check-in e check-out). Esta ação não pode ser desfeita automaticamente. 
                    Verifique se não há conflitos antes de confirmar.
                  </p>
                </div>
              </div>
            </div>
          </AlertDialogHeader>
           <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
             <AlertDialogCancel onClick={cancelSwap} className="w-full sm:w-auto order-2 sm:order-1">Cancelar</AlertDialogCancel>
             <AlertDialogAction onClick={confirmSwap} className="bg-primary w-full sm:w-auto order-1 sm:order-2">
               Confirmar Troca
             </AlertDialogAction>
           </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Tarifários */}
      {ratePlansModalData && (
        <RatePlansModal
          open={ratePlansModalOpen}
          onOpenChange={setRatePlansModalOpen}
          categoryId={ratePlansModalData.categoryId}
          categoryName={ratePlansModalData.categoryName}
          date={ratePlansModalData.date}
        />
      )}
    </div>
  );
};

