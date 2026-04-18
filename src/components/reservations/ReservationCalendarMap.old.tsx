import { useState, useMemo, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, eachDayOfInterval, parseISO, startOfDay, isSameDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, GripVertical, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservations } from "@/hooks/useReservations";
import { usePricing } from "@/hooks/usePricing";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/reservationUtils";
import { QuickReservationDialog } from "./QuickReservationDialog";
import { toast } from "sonner";

interface ReservationCalendarMapProps {
  onSelectReservation?: (id: string) => void;
  onCreateReservation?: (data: {
    checkin_date: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
  }) => void;
  onReservationAction?: (action: "edit" | "checkin" | "checkout" | "cancel", reservationId: string) => void;
}

// Configuração de cores estilo Hospedin - mais vibrantes e profissionais
const statusConfig: Record<string, { 
  bg: string; 
  text: string; 
  label: string; 
  border: string;
  dot: string;
}> = {
  pending: { 
    bg: "bg-amber-100", 
    text: "text-amber-900", 
    label: "Pendente", 
    border: "border-amber-400",
    dot: "bg-amber-500"
  },
  confirmed: { 
    bg: "bg-teal-500", 
    text: "text-white", 
    label: "Confirmada", 
    border: "border-teal-600",
    dot: "bg-teal-600"
  },
  checkedin: { 
    bg: "bg-blue-500", 
    text: "text-white", 
    label: "Check-in", 
    border: "border-blue-600",
    dot: "bg-blue-600"
  },
  checkedout: { 
    bg: "bg-slate-200", 
    text: "text-slate-800", 
    label: "Check-out", 
    border: "border-slate-300",
    dot: "bg-slate-400"
  },
  cancelled: { 
    bg: "bg-red-500", 
    text: "text-white", 
    label: "Cancelada", 
    border: "border-red-600",
    dot: "bg-red-600"
  },
  noshow: { 
    bg: "bg-rose-500", 
    text: "text-white", 
    label: "No Show", 
    border: "border-rose-600",
    dot: "bg-rose-600"
  },
  blocked: { 
    bg: "bg-slate-800", 
    text: "text-white", 
    label: "Bloqueada", 
    border: "border-slate-900",
    dot: "bg-slate-900"
  },
  preregistration: { 
    bg: "bg-purple-500", 
    text: "text-white", 
    label: "Pré-reserva", 
    border: "border-purple-600",
    dot: "bg-purple-600"
  },
};

export const ReservationCalendarMap = ({ 
  onSelectReservation, 
  onCreateReservation, 
  onReservationAction 
}: ReservationCalendarMapProps) => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [viewDays, setViewDays] = useState<number>(20);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Estado para seleção por arraste (criar nova reserva)
  const [dragStart, setDragStart] = useState<{ 
    date: Date; 
    categoryId?: string; 
    roomId?: string;
    dateIndex: number;
  } | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wasDragging, setWasDragging] = useState(false);

  // Estado para drag & drop de reservas existentes (lógica refatorada baseada em referência funcional)
  const [draggedReservation, setDraggedReservation] = useState<{
    reservation: any;
    originalPosition: { startIndex: number; roomId: string; duration: number };
  } | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{
    offsetX: number;
    offsetY: number;
    rectLeft: number;
    rectTop: number;
  } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ 
    roomId: string; 
    dateIndex: number;
  } | null>(null);
  const [isValidDrop, setIsValidDrop] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState<number>(100);
  const headerOffset = 200; // Largura da coluna de categorias/quartos
  
  // Refs para manter referências atualizadas dos handlers
  const handleMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleUpRef = useRef<(() => void) | null>(null);

  // Estado para modal rápido
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickDialogData, setQuickDialogData] = useState<{
    checkin_date: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
  } | null>(null);

  // Buscar categorias e quartos
  const { data: categoriesData } = useQuery<any[]>({
    queryKey: ["room_categories_with_rooms", establishmentId],
    queryFn: async () => {
      let categoriesQuery = supabase
        .from("room_categories")
        .select(`
          *,
          rooms (*)
        `)
        .order("name");
      
      if (establishmentId) {
        categoriesQuery = categoriesQuery.eq("establishment_id", establishmentId);
      }

      const { data: categories, error } = await categoriesQuery;
      if (error) throw error;

      const categoriesWithRooms = (categories || []).map((cat: any) => ({
        ...cat,
        rooms: (cat.rooms || [])
          .filter((r: any) => r.category_id === cat.id)
          .sort((a: any, b: any) => 
            a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
          ),
      }));

      return categoriesWithRooms;
    },
  });

  // Expandir todas as categorias por padrão
  useEffect(() => {
    if (categoriesData && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categoriesData.map((cat: any) => cat.id)));
    }
  }, [categoriesData, expandedCategories.size]);

  // Buscar reservas
  const { reservations, updateReservation } = useReservations();
  const { calculatePrice } = usePricing();

  // Filtrar categorias
  const filteredCategories = useMemo(() => {
    if (!categoriesData) return [];
    if (selectedCategoryId === "all") return categoriesData;
    return categoriesData.filter((cat: any) => cat.id === selectedCategoryId);
  }, [categoriesData, selectedCategoryId]);

  // Calcular datas visíveis (normalizadas para meia-noite)
  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startOfDay(startDate),
      end: startOfDay(addDays(startDate, viewDays - 1)),
    });
  }, [startDate, viewDays]);

  // 🔧 REFATORAÇÃO: Agrupar reservas usando Map para evitar duplicatas
  const reservationsByRoom = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    
    // Usar Map para remover duplicatas automaticamente (chave = reservation.id)
    const uniqueReservationsMap = new Map<string, any>();
    
    reservations.forEach((r: any) => {
      // Ignorar canceladas
      if (r.status === "cancelled") return;
      
      // Se já existe, não adicionar de novo (evita duplicatas)
      if (!uniqueReservationsMap.has(r.id)) {
        uniqueReservationsMap.set(r.id, r);
      }
    });
    
    const uniqueReservations = Array.from(uniqueReservationsMap.values());
    
    // Separar reservas com quarto e sem quarto
    const reservationsWithRoom: any[] = [];
    const reservationsByCategory: Record<string, any[]> = {};
    
    uniqueReservations.forEach((reservation: any) => {
      if (reservation.room_id) {
        // Tem quarto específico
        reservationsWithRoom.push(reservation);
      } else if (reservation.category_id) {
        // Não tem quarto, apenas categoria (pendente)
        if (!reservationsByCategory[reservation.category_id]) {
          reservationsByCategory[reservation.category_id] = [];
        }
        reservationsByCategory[reservation.category_id].push(reservation);
      }
    });
    
    // Agrupar reservas com quarto
    reservationsWithRoom.forEach((reservation: any) => {
      if (!grouped[reservation.room_id]) {
        grouped[reservation.room_id] = [];
      }
      grouped[reservation.room_id].push(reservation);
    });
    
    // Para reservas sem quarto, replicar para todos os quartos da categoria
    Object.entries(reservationsByCategory).forEach(([categoryId, categoryReservations]) => {
      const category = categoriesData?.find((cat: any) => cat.id === categoryId);
      if (!category?.rooms) return;
      
      category.rooms.forEach((room: any) => {
        if (!grouped[room.id]) {
          grouped[room.id] = [];
        }
        // Adicionar reservas da categoria (sem duplicar)
        categoryReservations.forEach(catRes => {
          const alreadyExists = grouped[room.id].some(r => r.id === catRes.id);
          if (!alreadyExists) {
            grouped[room.id].push(catRes);
          }
        });
      });
    });
    
    return grouped;
  }, [reservations, categoriesData]);

  // Calcular posição de uma reserva - corrigido para funcionar com qualquer número de dias
  const getReservationPosition = (reservation: any) => {
    // Usar strings de data para evitar problemas de timezone
    const checkinStr = reservation.checkin_date; // "YYYY-MM-DD"
    const checkoutStr = reservation.checkout_date; // "YYYY-MM-DD"
    
    // Converter para Date apenas para cálculos visuais
    const checkin = startOfDay(parseISO(checkinStr));
    const checkout = startOfDay(parseISO(checkoutStr));
    
    // Normalizar todas as datas visíveis
    const normalizedVisibleDates = visibleDates.map(d => startOfDay(d));
    const firstVisible = normalizedVisibleDates[0];
    const lastVisible = normalizedVisibleDates[normalizedVisibleDates.length - 1];
    
    // Verificar se a reserva está visível no período
    if (checkout <= firstVisible || checkin >= lastVisible) {
      return {
        startIndex: -1,
        duration: 0,
        isVisible: false,
        checkinDate: checkin,
        checkoutDate: checkout,
      };
    }
    
    // Encontrar o índice do check-in
    let startIndex = -1;
    for (let i = 0; i < normalizedVisibleDates.length; i++) {
      if (isSameDay(normalizedVisibleDates[i], checkin)) {
        startIndex = i;
        break;
      }
    }
    
    // Se reserva começa antes do período visível
    if (startIndex < 0 && checkin < firstVisible) {
      startIndex = 0;
    }
    
    if (startIndex < 0) {
      return {
        startIndex: -1,
        duration: 0,
        isVisible: false,
        checkinDate: checkin,
        checkoutDate: checkout,
      };
    }
    
    // 🔧 CORREÇÃO: Calcular duração usando diferença de dias
    // Check-in é INCLUSIVO, Check-out é EXCLUSIVO
    // Exemplo: 15/11 a 21/11 = 6 dias (15, 16, 17, 18, 19, 20)
    const totalDays = differenceInDays(checkout, checkin);
    
    // Calcular quantos dias estão visíveis
    let visibleDays = totalDays;
    
    // Se a reserva termina depois do último dia visível
    const daysUntilEnd = normalizedVisibleDates.length - startIndex;
    if (visibleDays > daysUntilEnd) {
      visibleDays = daysUntilEnd;
    }
    
    // Garantir duração mínima
    const finalDuration = Math.max(1, visibleDays);
    
    // 🔍 DEBUG: Log apenas se houver problema (duração muito pequena ou muito grande)
    if (finalDuration === 1 && totalDays > 1) {
      console.warn(`⚠️ Duração incorreta para reserva ${reservation.id.substring(0, 8)}:`, {
        checkin: checkinStr,
        checkout: checkoutStr,
        totalDays,
        calculatedDuration: finalDuration,
        startIndex
      });
    }
    
    return {
      startIndex,
      duration: finalDuration,
      isVisible: true,
      checkinDate: checkin,
      checkoutDate: checkout,
    };
  };

  // 🔧 REFATORAÇÃO: Verificação de conflitos simplificada e robusta
  // Check-in é INCLUSIVO (>=), Check-out é EXCLUSIVO (<)
  // Exemplo: Reserva 14/11-15/11 ocupa APENAS o dia 14/11, o dia 15/11 está LIVRE
  const hasConflictForDate = (date: Date, categoryId?: string, roomId?: string, excludeReservationId?: string) => {
    const dateStr = format(startOfDay(date), "yyyy-MM-dd");
    
    // Usar as reservas únicas do useMemo (sem duplicatas)
    const uniqueReservationsMap = new Map<string, any>();
    reservations.forEach((r: any) => {
      if (r.status !== "cancelled" && r.id !== excludeReservationId) {
        uniqueReservationsMap.set(r.id, r);
      }
    });
    
    const uniqueReservations = Array.from(uniqueReservationsMap.values());
    
    // Se especificou um quarto, filtrar apenas reservas desse quarto
    const reservationsToCheck = roomId 
      ? uniqueReservations.filter((r: any) => r.room_id === roomId)
      : categoryId
      ? uniqueReservations.filter((r: any) => {
          const reservationCategoryId = r.category_id || r.room_categories?.id;
          return reservationCategoryId === categoryId;
        })
      : uniqueReservations;
    
    // Debug: Log todas as reservas sendo verificadas para a data
    if (process.env.NODE_ENV === 'development' && (dateStr === "2025-11-15" || dateStr.includes("-15"))) {
      console.log(`🔍 Verificando conflito para data ${dateStr}:`, {
        roomId: roomId?.substring(0, 8) || "undefined (categoria)",
        categoryId: categoryId?.substring(0, 8) || "undefined",
        totalReservations: reservationsToCheck.length,
        reservations: reservationsToCheck.map((r: any) => ({
          id: r.id?.substring(0, 8),
          checkin: r.checkin_date?.split('T')[0],
          checkout: r.checkout_date?.split('T')[0],
          roomId: r.room_id?.substring(0, 8),
          status: r.status
        }))
      });
    }
    
    // Verificar cada reserva
    for (const reservation of reservationsToCheck) {
      const checkinStr = reservation.checkin_date;
      const checkoutStr = reservation.checkout_date;
      
      // Garantir que as datas estão no formato correto (YYYY-MM-DD)
      // Remover qualquer informação de timezone ou hora
      const normalizedCheckin = checkinStr ? checkinStr.split('T')[0] : checkinStr;
      const normalizedCheckout = checkoutStr ? checkoutStr.split('T')[0] : checkoutStr;
      
      // Validação: garantir que as datas são válidas
      if (!normalizedCheckin || !normalizedCheckout) {
        console.warn(`⚠️ Reserva com data inválida:`, {
          reservationId: reservation.id?.substring(0, 8),
          checkin: checkinStr,
          checkout: checkoutStr
        });
        continue;
      }
      
      // IMPORTANTE: Se a data é exatamente o checkout, NÃO é conflito (checkout exclusivo)
      // Esta verificação deve vir ANTES da verificação de range
      if (dateStr === normalizedCheckout) {
        // Data é o checkout - não está ocupada (checkout exclusivo)
        // Log para debug (especialmente para dia 15)
        if (process.env.NODE_ENV === 'development' && (dateStr === "2025-11-15" || dateStr.includes("-15"))) {
          console.log(`✅ Data ${dateStr} é checkout de reserva ${reservation.id?.substring(0, 8)} - LIVRE (checkout exclusivo)`, {
            reservationId: reservation.id?.substring(0, 8),
            checkin: normalizedCheckin,
            checkout: normalizedCheckout,
            status: reservation.status,
            roomId: roomId?.substring(0, 8)
          });
        }
        continue; // Pular para próxima reserva
      }
      
      // Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
      // Exemplo: Reserva 14/11 a 15/11 ocupa APENAS o dia 14/11, o dia 15/11 está LIVRE
      // dateStr = "2025-11-15", checkinStr = "2025-11-14", checkoutStr = "2025-11-15"
      // Como já verificamos acima que dateStr !== checkoutStr, então:
      // isDateInRange = "2025-11-15" >= "2025-11-14" && "2025-11-15" < "2025-11-15" = false (correto!)
      const isDateInRange = dateStr >= normalizedCheckin && dateStr < normalizedCheckout;
      
      if (isDateInRange) {
        // Log apenas para debug quando encontrar conflito (apenas em desenvolvimento)
        // Log especial para dia 15 para debug
        if (process.env.NODE_ENV === 'development') {
          const shouldLog = roomId || dateStr === "2025-11-15" || dateStr.includes("-15");
          if (shouldLog) {
            console.log(`🔴 CONFLITO encontrado para data ${dateStr}:`, {
              date: dateStr,
              reservationId: reservation.id?.substring(0, 8),
              checkin: normalizedCheckin,
              checkout: normalizedCheckout,
              roomId: roomId?.substring(0, 8),
              reservationRoomId: reservation.room_id?.substring(0, 8),
              status: reservation.status,
              isInRange: isDateInRange,
              check1: `${dateStr} >= ${normalizedCheckin} = ${dateStr >= normalizedCheckin}`,
              check2: `${dateStr} < ${normalizedCheckout} = ${dateStr < normalizedCheckout}`,
              // Verificar se a data é checkout (não deveria chegar aqui se for)
              isCheckout: dateStr === normalizedCheckout
            });
          }
        }
        return true;
      }
    }
    
    // Se chegou aqui, não há conflito
    // Log para debug se a data estava sendo verificada como checkout
    if (process.env.NODE_ENV === 'development' && (dateStr === "2025-11-15" || dateStr.includes("-15"))) {
      const checkoutDates = reservationsToCheck.map((r: any) => {
        const checkout = r.checkout_date?.split('T')[0] || r.checkout_date;
        return checkout;
      });
      const checkinDates = reservationsToCheck.map((r: any) => {
        const checkin = r.checkin_date?.split('T')[0] || r.checkin_date;
        return checkin;
      });
      
      if (checkoutDates.includes(dateStr)) {
        console.log(`✅ Data ${dateStr} é checkout de alguma reserva - SEM CONFLITO (retornando false)`, {
          roomId: roomId?.substring(0, 8) || "undefined (categoria)",
          categoryId: categoryId?.substring(0, 8) || "undefined",
          totalReservations: reservationsToCheck.length,
          reservations: reservationsToCheck.map((r: any) => ({
            id: r.id?.substring(0, 8),
            checkin: r.checkin_date?.split('T')[0],
            checkout: r.checkout_date?.split('T')[0],
            roomId: r.room_id?.substring(0, 8),
            status: r.status
          }))
        });
      } else if (checkinDates.includes(dateStr)) {
        // Se a data é check-in de alguma reserva, deveria ter conflito
        console.log(`⚠️ Data ${dateStr} é check-in mas não foi detectado conflito - VERIFICAR!`, {
          roomId: roomId?.substring(0, 8) || "undefined (categoria)",
          categoryId: categoryId?.substring(0, 8) || "undefined",
          totalReservations: reservationsToCheck.length,
          reservations: reservationsToCheck.map((r: any) => ({
            id: r.id?.substring(0, 8),
            checkin: r.checkin_date?.split('T')[0],
            checkout: r.checkout_date?.split('T')[0],
            roomId: r.room_id?.substring(0, 8),
            status: r.status
          }))
        });
      } else {
        // Data não é checkout nem check-in de nenhuma reserva
        console.log(`ℹ️ Data ${dateStr} não é checkout nem check-in - SEM CONFLITO (retornando false)`, {
          roomId: roomId?.substring(0, 8) || "undefined (categoria)",
          categoryId: categoryId?.substring(0, 8) || "undefined",
          totalReservations: reservationsToCheck.length
        });
      }
    }

    return false;
  };

  // Calcular ocupação e disponibilidade por data
  const getDateOccupancy = useMemo(() => {
    const occupancy: Record<string, { occupied: number; total: number; percentage: number; available: number; price: number }> = {};
    
    visibleDates.forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      let occupied = 0;
      let total = 0;
      let minPrice = Infinity;
      
      filteredCategories?.forEach((category: any) => {
        const rooms = category.rooms || [];
        total += rooms.length;
        
        rooms.forEach((room: any) => {
          const roomReservations = reservationsByRoom[room.id] || [];
          // Verificar se o quarto está ocupado nesta data
          // Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
          const hasReservation = roomReservations.some((r: any) => {
            const checkinStr = r.checkin_date;
            const checkoutStr = r.checkout_date;
            // Normalizar datas para remover timezone
            const normalizedCheckin = checkinStr ? checkinStr.split('T')[0] : checkinStr;
            const normalizedCheckout = checkoutStr ? checkoutStr.split('T')[0] : checkoutStr;
            // A data está ocupada se: dateStr >= checkinStr && dateStr < checkoutStr
            return dateStr >= normalizedCheckin && dateStr < normalizedCheckout;
          });
          
          if (hasReservation) {
            occupied++;
          }
          
          const price = Number(category.base_price) || 0;
          if (price > 0 && price < minPrice) {
            minPrice = price;
          }
        });
      });
      
      const percentage = total > 0 ? Math.round((occupied / total) * 100) : 0;
      const available = total - occupied;
      
      occupancy[dateStr] = {
        occupied,
        total,
        percentage,
        available,
        price: minPrice === Infinity ? 0 : minPrice,
      };
    });
    
    return occupancy;
  }, [visibleDates, filteredCategories, reservationsByRoom]);

  // Toggle categoria
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const getStatusColor = (status: string) => {
    return statusConfig[status] || statusConfig.confirmed;
  };

  // Verificar se uma data está selecionada
  const isDateInSelection = (date: Date, categoryId?: string, roomId?: string) => {
    if (!dragStart || !dragEnd) return false;
    if (dragStart.categoryId && categoryId !== dragStart.categoryId) return false;
    if (dragStart.roomId && roomId !== dragStart.roomId) return false;
    
    const dateNormalized = startOfDay(date);
    const startNormalized = startOfDay(dragStart.date);
    const endNormalized = startOfDay(dragEnd);
    
    const minDate = startNormalized < endNormalized ? startNormalized : endNormalized;
    const maxDate = startNormalized > endNormalized ? startNormalized : endNormalized;
    
    return dateNormalized >= minDate && dateNormalized <= maxDate;
  };

  // Handlers para arraste (criar nova reserva)
  const handleMouseDown = (date: Date, categoryId?: string, roomId?: string) => {
    if (draggedReservation) return; // Não iniciar novo arraste se já está arrastando uma reserva
    
    // Verificar se há conflito antes de permitir iniciar a seleção
    if (hasConflictForDate(date, categoryId, roomId)) {
      return; // Não permitir iniciar seleção em data ocupada
    }
    
    const dateIndex = visibleDates.findIndex((d) => isSameDay(d, date));
    setDragStart({ date: startOfDay(date), categoryId, roomId, dateIndex });
    setDragEnd(startOfDay(date));
    setIsDragging(true);
    setWasDragging(false);
  };

  const handleMouseEnter = (date: Date, categoryId?: string, roomId?: string) => {
    if (!isDragging || !dragStart || draggedReservation) return;
    if (dragStart.categoryId && categoryId !== dragStart.categoryId) return;
    if (dragStart.roomId && roomId !== dragStart.roomId) return;
    
    // Verificar se a data tem conflito antes de incluir na seleção
    if (hasConflictForDate(date, categoryId, roomId)) {
      return; // Não incluir datas ocupadas na seleção
    }
    
    setDragEnd(startOfDay(date));
    setWasDragging(true);
  };

  const handleMouseUp = (categoryId?: string, roomId?: string, date?: Date) => {
    if (draggedReservation) return; // Não processar se está arrastando uma reserva
    
    // Se não estava arrastando mas tem dragStart, usar a data clicada diretamente
    if (!wasDragging && date) {
      // Clique direto em uma célula - criar reserva de 1 dia
      const clickedDate = startOfDay(date);
      
      // Verificar se há conflito na data clicada
      if (hasConflictForDate(clickedDate, categoryId, roomId)) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        setWasDragging(false);
        return;
      }
      
      const checkinDate = format(clickedDate, "yyyy-MM-dd");
      const checkoutDate = format(addDays(clickedDate, 1), "yyyy-MM-dd");
      
      console.log("📅 CRIANDO RESERVA (clique direto):");
      console.log("  Data clicada:", format(clickedDate, "dd/MM"));
      console.log("  Check-in (inclusivo):", checkinDate);
      console.log("  Check-out (exclusivo):", checkoutDate);
      
      setQuickDialogData({
        checkin_date: checkinDate,
        checkout_date: checkoutDate,
        category_id: categoryId,
        room_id: roomId,
      });
      setQuickDialogOpen(true);
      
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setWasDragging(false);
      return;
    }
    
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setWasDragging(false);
      return;
    }

    if (dragStart.categoryId && categoryId !== dragStart.categoryId) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setWasDragging(false);
      return;
    }
    if (dragStart.roomId && roomId !== dragStart.roomId) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setWasDragging(false);
      return;
    }

    const start = startOfDay(dragStart.date);
    const end = startOfDay(dragEnd);
    const minDate = start < end ? start : end;
    const maxDate = start > end ? start : end;

    // ⚠️ ATENÇÃO: maxDate representa o ÚLTIMO DIA que o hóspede vai OCUPAR o quarto
    // Não é o dia de check-out, é o último dia de estadia
    
    // Exemplo:
    // - Usuário seleciona apenas 14/11: minDate=14/11, maxDate=14/11 → 1 diária
    // - Usuário arrasta 14/11 até 15/11: minDate=14/11, maxDate=15/11 → 2 diárias
    
    // Verificar se há conflito no período selecionado
    // IMPORTANTE: A reserva criada vai ocupar de minDate até maxDate (inclusive)
    // O checkout será maxDate + 1 (exclusivo), então a reserva ocupa minDate, minDate+1, ..., maxDate
    // Exemplo: Seleciona 14 a 15 → ocupa 14 e 15, checkout = 16 (exclusivo)
    // Exemplo: Seleciona apenas 14 → ocupa 14, checkout = 15 (exclusivo)
    const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
    // Verificar conflitos em todos os dias que serão ocupados (minDate até maxDate, inclusive)
    const hasConflict = datesInRange.some((d) => hasConflictForDate(d, categoryId, roomId));
    
    if (hasConflict) {
      // Não permitir criar reserva se há conflito
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setWasDragging(false);
      return;
    }

    // ✅ Check-in: primeiro dia selecionado (dia que o hóspede chega)
    const checkinDate = format(minDate, "yyyy-MM-dd");
    
    // ✅ Check-out: dia SEGUINTE ao último dia selecionado (dia que o hóspede sai)
    // Regra: Check-out sempre é o dia SEGUINTE ao último dia de estadia
    // Exemplos:
    //   - Seleciona 14/11 → check-in: 14/11, check-out: 15/11 (1 diária)
    //   - Seleciona 14/11-15/11 → check-in: 14/11, check-out: 16/11 (2 diárias)
    //   - Seleciona 14/11-16/11 → check-in: 14/11, check-out: 17/11 (3 diárias)
    const checkoutDate = format(addDays(maxDate, 1), "yyyy-MM-dd");

    // 🔍 DEBUG: Log para entender o comportamento
    console.log("📅 CRIANDO RESERVA:");
    console.log("  Dias selecionados na grade:", format(minDate, "dd/MM"), "até", format(maxDate, "dd/MM"));
    console.log("  Dias verificados para conflito:", datesInRange.map(d => format(d, "dd/MM")).join(", "));
    console.log("  Check-in (inclusivo):", checkinDate);
    console.log("  Check-out (exclusivo):", checkoutDate);
    console.log("  Dias que serão OCUPADOS pela reserva:", datesInRange.map(d => format(d, "dd/MM")).join(", "));
    console.log("  Dia que estará LIVRE (checkout exclusivo):", checkoutDate);

    setQuickDialogData({
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      category_id: categoryId || dragStart.categoryId,
      room_id: roomId || dragStart.roomId,
    });
    setQuickDialogOpen(true);

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setWasDragging(false);
  };

  // Função auxiliar para calcular duração real de uma reserva
  const getReservationRealDuration = (reservation: any): number => {
    const checkin = parseISO(reservation.checkin_date);
    const checkout = parseISO(reservation.checkout_date);
    return differenceInDays(checkout, checkin);
  };

  // Validar posição de reserva
  // 🔧 REFATORAÇÃO: Validação simplificada usando hasConflictForDate
  const validateReservationPosition = (
    reservation: any,
    newStartIndex: number,
    newDuration: number,
    newRoomId: string
  ) => {
    // Validar limites
    if (newStartIndex < 0 || newStartIndex + newDuration > visibleDates.length) {
      return { isValid: false, reason: "Fora do período visível" };
    }

    // Validar cada dia do período
    for (let i = 0; i < newDuration; i++) {
      const date = visibleDates[newStartIndex + i];
      const dateStr = format(date, "yyyy-MM-dd");
      const hasConflict = hasConflictForDate(date, undefined, newRoomId, reservation.id);
      
      if (hasConflict) {
        // Debug: Log detalhado do conflito
        if (process.env.NODE_ENV === 'development') {
          console.log(`❌ Conflito detectado na validação:`, {
            date: dateStr,
            reservationId: reservation.id?.substring(0, 8),
            newStartIndex,
            newDuration,
            newRoomId: newRoomId?.substring(0, 8),
            dayIndex: i,
            originalCheckin: reservation.checkin_date?.split('T')[0],
            originalCheckout: reservation.checkout_date?.split('T')[0]
          });
        }
        return { isValid: false, reason: "Conflito com outra reserva" };
      }
    }

    return { isValid: true };
  };

  // Handler para iniciar drag de reserva
  // 🔧 Handler para iniciar drag (baseado em lógica funcional de referência)
  const handleReservationMouseDown = (e: React.MouseEvent, reservation: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("🎯 MouseDown capturado:", {
      code: reservation.reservation_code,
      status: reservation.status,
      hasRoom: !!reservation.room_id
    });
    
    // Não permitir drag de reservas bloqueadas, canceladas ou check-out
    if (["blocked", "cancelled", "checkedout"].includes(reservation.status)) {
      console.log("❌ Status não permite drag:", reservation.status);
      return;
    }

    // Não permitir drag de reservas sem quarto específico (pendentes)
    if (!reservation.room_id) {
      console.log("❌ Sem quarto definido");
      toast.error("Reservas sem quarto definido não podem ser movidas");
      return;
    }

    // Capturar informações do bloco sendo arrastado
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = getReservationPosition(reservation);
    
    console.log("✅ Iniciando drag:", {
      startIndex: pos.startIndex,
      duration: pos.duration,
      roomId: reservation.room_id.substring(0, 8)
    });
    
    setDraggedReservation({
      reservation,
      originalPosition: {
        startIndex: pos.startIndex,
        roomId: reservation.room_id,
        duration: pos.duration,
      },
    });
    
    setDragStartPos({
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      rectLeft: rect.left,
      rectTop: rect.top,
    });
    
    setCurrentMousePos({ x: e.clientX, y: e.clientY });
    
    // Prevenir seleção de texto durante drag
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  // 🔧 Handler para movimento durante drag (baseado em lógica funcional de referência)
  const handleReservationMouseMove = (e: MouseEvent) => {
    console.log("🖱️ handleReservationMouseMove chamado");
    
    if (!draggedReservation) {
      console.log("❌ Sem draggedReservation");
      return;
    }
    if (!gridRef.current) {
      console.log("❌ Sem gridRef");
      return;
    }
    if (!dragStartPos) {
      console.log("❌ Sem dragStartPos");
      return;
    }

    // Atualizar posição do cursor
    setCurrentMousePos({ x: e.clientX, y: e.clientY });

    // Obter dimensões do grid
    const gridRect = gridRef.current.getBoundingClientRect();
    console.log("📐 Grid rect:", {
      left: gridRect.left,
      top: gridRect.top,
      width: gridRect.width,
      height: gridRect.height
    });
    const availableWidth = gridRect.width - headerOffset;
    const calculatedCellWidth = availableWidth / visibleDates.length;
    const cellHeight = 40;

    // Posição do mouse relativa à grade (descontando a coluna de quartos)
    const relativeX = e.clientX - gridRect.left - headerOffset;
    const relativeY = e.clientY - gridRect.top;

    // Calcular duração REAL da reserva (não apenas a visível)
    const realDuration = getReservationRealDuration(draggedReservation.reservation);
    
    // Calcular coluna (data) baseado na posição
    const col = Math.max(0, Math.min(Math.floor(relativeX / calculatedCellWidth), visibleDates.length - realDuration));

    // Calcular linha (quarto) baseado na posição
    const rowIndex = Math.max(0, Math.floor(relativeY / cellHeight));
    let targetRoomId = draggedReservation.originalPosition.roomId;
    let currentRowIndex = 0;
    
    // Mapear linha para quarto
    filteredCategories?.forEach((category: any) => {
      if (!expandedCategories.has(category.id)) return;
      category.rooms?.forEach((room: any) => {
        if (currentRowIndex === rowIndex) {
          targetRoomId = room.id;
        }
        currentRowIndex++;
      });
    });
    
    // Validar posição usando a função existente com duração real
    const validation = validateReservationPosition(
      draggedReservation.reservation,
      col,
      realDuration,
      targetRoomId
    );

    // Debug: Log da validação
    if (process.env.NODE_ENV === 'development') {
      const startDate = visibleDates[col];
      const endDate = visibleDates[Math.min(col + realDuration - 1, visibleDates.length - 1)];
      console.log(`🔍 Validação de posição:`, {
        isValid: validation.isValid,
        reason: validation.reason,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        col,
        realDuration,
        targetRoomId: targetRoomId?.substring(0, 8),
        reservationId: draggedReservation.reservation.id?.substring(0, 8)
      });
    }

    // Atualizar estados
    setIsValidDrop(validation.isValid);
    setHoveredCell({ roomId: targetRoomId, dateIndex: col });
    setCellWidth(calculatedCellWidth);
  };

  // 🔧 Handler para soltar reserva (baseado em lógica funcional de referência)
  const handleReservationMouseUp = async () => {
    console.log("🔍 handleReservationMouseUp - Estados:", {
      hasDraggedReservation: !!draggedReservation,
      hasHoveredCell: !!hoveredCell,
      isValidDrop,
      hoveredCell
    });
    
    // Se não há drag em andamento, cancelar
    if (!draggedReservation || !hoveredCell) {
      console.log("⚠️ Cancelando: Sem drag ou hoveredCell");
      // Limpar estados
      setDraggedReservation(null);
      setDragStartPos(null);
      setCurrentMousePos(null);
      setHoveredCell(null);
      setIsValidDrop(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      return;
    }

    // Se posição inválida, cancelar
    if (!isValidDrop) {
      console.log("⚠️ Cancelando: Posição inválida");
      toast.error("Posição inválida. Já existe uma reserva nesse período.");
      // Limpar estados
      setDraggedReservation(null);
      setDragStartPos(null);
      setCurrentMousePos(null);
      setHoveredCell(null);
      setIsValidDrop(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      return;
    }

    // Calcular nova posição
    // Usar a duração REAL da reserva (diferença entre checkout e checkin originais)
    const realDuration = getReservationRealDuration(draggedReservation.reservation);
    
    const newStartIndex = hoveredCell.dateIndex;
    const newCheckinDate = visibleDates[newStartIndex];
    // Checkout é o dia seguinte ao último dia de estadia (check-in + duração real)
    const newCheckoutDate = addDays(newCheckinDate, realDuration);

    // Salvar dados para atualização
    const updateData = {
      id: draggedReservation.reservation.id,
      checkin_date: format(newCheckinDate, "yyyy-MM-dd"),
      checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
      room_id: hoveredCell.roomId,
    };
    
    console.log("🔄 Movendo reserva:", {
      code: draggedReservation.reservation.reservation_code,
      from: `${draggedReservation.originalPosition.startIndex} (${draggedReservation.reservation.checkin_date})`,
      to: `${newStartIndex} (${updateData.checkin_date})`,
      newRoom: hoveredCell.roomId.substring(0, 8),
    });
    
    // ⚡ CRÍTICO: Resetar TODOS os estados IMEDIATAMENTE (antes do async)
    setDraggedReservation(null);
    setDragStartPos(null);
    setCurrentMousePos(null);
    setHoveredCell(null);
    setIsValidDrop(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    // Agora atualizar no banco (assíncrono)
    try {
      await updateReservation(updateData);
      
      // Limpar cache COMPLETAMENTE e recarregar
      queryClient.removeQueries({ queryKey: ["reservations"] });
      queryClient.removeQueries({ queryKey: ["rooms"] });
      queryClient.removeQueries({ queryKey: ["occupancy_map_rooms"] });
      
      // Forçar refetch imediato para garantir dados atualizados
      await queryClient.refetchQueries({ queryKey: ["reservations"] });
      
      toast.success("Reserva movida com sucesso!");
      console.log("✅ Reserva atualizada e cache recarregado");
      
    } catch (error: any) {
      console.error("❌ Erro ao atualizar reserva:", error);
      toast.error("Erro ao mover reserva. Tente novamente.");
    }
  };

  // Atualizar refs dos handlers
  useEffect(() => {
    handleMoveRef.current = handleReservationMouseMove;
    handleUpRef.current = handleReservationMouseUp;
  });

  // 🔧 Listener global para drag de reserva (baseado em lógica funcional de referência)
  useEffect(() => {
    if (!draggedReservation || !dragStartPos) {
      return;
    }

    console.log("✅ useEffect: Adicionando listeners globais");

    const handleMove = (e: MouseEvent) => {
      console.log("🔄 Listener global mousemove disparado");
      handleMoveRef.current?.(e);
    };

    const handleUp = () => {
      console.log("⬆️ MouseUp global capturado");
      handleUpRef.current?.();
    };

    // Adicionar listeners globais
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      console.log("🧹 useEffect: Removendo listeners");
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [draggedReservation, dragStartPos]);

  return (
    <div className="space-y-4">
      {/* Barra de Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start text-left font-normal h-9">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(startOfDay(date))}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setStartDate(startOfDay(addDays(startDate, -viewDays)))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setStartDate(startOfDay(new Date()))}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setStartDate(startOfDay(addDays(startDate, viewDays)))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Select value={viewDays.toString()} onValueChange={(v) => setViewDays(Number(v))}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="14">14 dias</SelectItem>
              <SelectItem value="20">20 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categoriesData?.map((cat: any) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mapa de Reservas */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {/* Cabeçalho com datas - Estilo Hospedin */}
          <div className="sticky top-0 z-20 bg-white border-b-2 border-slate-200 shadow-sm">
            {/* Linha 1: Datas */}
            <div className="flex border-b border-slate-200">
              <div className="w-48 sm:w-56 p-2 border-r bg-slate-50 flex-shrink-0">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {format(startDate, "MMMM yyyy", { locale: ptBR })}
                </div>
              </div>
              <div className="flex-1 flex min-w-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`, gap: 0 }}>
                {visibleDates.map((date) => {
                  const isToday = isSameDay(date, new Date());
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const dateStr = format(date, "yyyy-MM-dd");
                  const occupancy = getDateOccupancy[dateStr];
                  
                  return (
                    <div 
                      key={date.toISOString()} 
                      className={cn(
                        "border-r border-slate-200 last:border-r-0 p-1.5 text-center min-w-[90px] transition-colors",
                        isToday && "bg-blue-100 border-blue-300",
                        isWeekend && !isToday && "bg-slate-50"
                      )}
                      style={{ boxSizing: "border-box" }}
                    >
                      <div className={cn(
                        "text-[10px] font-bold uppercase mb-0.5 tracking-wide",
                        isToday ? "text-blue-700" : "text-slate-600"
                      )}>
                        {format(date, "EEE", { locale: ptBR })}
                      </div>
                      <div className={cn(
                        "text-xs font-bold mb-0.5",
                        isToday ? "text-blue-800" : "text-slate-800"
                      )}>
                        {format(date, "dd")} {format(date, "MMM", { locale: ptBR }).toUpperCase()}
                      </div>
                      {occupancy && (
                        <div className="text-[9px] font-semibold text-slate-600">
                          {occupancy.percentage}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Linha 2: Preços e Disponibilidade - Estilo Hospedin */}
            <div className="flex bg-slate-50/50">
              <div className="w-48 sm:w-56 p-2 border-r bg-slate-50 flex-shrink-0">
                <div className="text-[10px] font-semibold text-slate-600 uppercase">
                  Preço / Disp.
                </div>
              </div>
              <div className="flex-1 flex min-w-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`, gap: 0 }}>
                {visibleDates.map((date) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const occupancy = getDateOccupancy[dateStr];
                  const isToday = isSameDay(date, new Date());
                  
                  return (
                    <div 
                      key={date.toISOString()} 
                      className={cn(
                        "border-r border-slate-200 last:border-r-0 p-1.5 text-center min-w-[90px]",
                        isToday && "bg-blue-50"
                      )}
                      style={{ boxSizing: "border-box" }}
                    >
                      {occupancy && (
                        <>
                          <div className="text-[10px] font-semibold text-slate-700 mb-0.5">
                            {occupancy.available} {occupancy.available === 1 ? 'disp.' : 'disp.'}
                          </div>
                          {occupancy.price > 0 && (
                            <div className="text-[9px] font-bold text-emerald-700">
                              R$ {occupancy.price.toFixed(2).replace('.', ',')}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Linhas de categorias e quartos */}
          <div className="divide-y">
            {filteredCategories?.map((category: any) => {
              const isExpanded = expandedCategories.has(category.id);
              const rooms = category.rooms || [];

              return (
                <div key={category.id}>
                  {/* Linha da Categoria - Estilo Hospedin */}
                  <div className="flex hover:bg-slate-50/70 transition-colors border-b border-slate-200 bg-slate-50/40">
                    <div className="w-48 sm:w-56 p-2 border-r border-slate-200 bg-slate-50 flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-600" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                        )}
                      </button>
                      <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">{category.name}</span>
                      <span className="text-[10px] text-slate-600 font-semibold">
                        ({rooms.length})
                      </span>
                    </div>
                    <div className="flex-1 flex min-w-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`, gap: 0 }}>
                      {visibleDates.map((date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const price = Number(category.base_price) || 0;
                        const isSelected = isDateInSelection(date, category.id);
                        // Excluir a reserva sendo arrastada da verificação de conflito para evitar bloqueio fantasma
                        const excludeReservationId = draggedReservation?.reservation?.id;
                        const hasConflict = hasConflictForDate(date, category.id, undefined, excludeReservationId);
                        
                        // Debug: Log quando há conflito na célula de categoria (especialmente dia 15)
                        if (hasConflict && process.env.NODE_ENV === 'development' && (dateStr === "2025-11-15" || dateStr.includes("-15"))) {
                          // Obter todas as reservas da categoria para debug
                          const categoryReservationsList = reservations.filter((r: any) => {
                            if (r.status === "cancelled" || r.id === excludeReservationId) return false;
                            const reservationCategoryId = r.category_id || r.room_categories?.id;
                            return reservationCategoryId === category.id;
                          });
                          
                          console.log(`🔴 CÉLULA DE CATEGORIA BLOQUEADA - hasConflictForDate retornou TRUE para data ${dateStr}`, {
                            date: dateStr,
                            categoryId: category.id?.substring(0, 8),
                            excludeReservationId: excludeReservationId?.substring(0, 8),
                            // Verificar todas as reservas da categoria
                            categoryReservations: categoryReservationsList.map((r: any) => ({
                              id: r.id?.substring(0, 8),
                              checkin: r.checkin_date?.split('T')[0],
                              checkout: r.checkout_date?.split('T')[0],
                              status: r.status,
                              roomId: r.room_id?.substring(0, 8)
                            }))
                          });
                        }
                        
                        return (
                          <div
                            key={date.toISOString()}
                            className={cn(
                              "border-r last:border-r-0 p-2 text-center text-xs transition-colors min-w-[90px]",
                              hasConflict 
                                ? "bg-red-50/50 cursor-not-allowed opacity-60" 
                                : isSelected 
                                ? "bg-primary/10 ring-1 ring-primary/20 cursor-pointer" 
                                : "hover:bg-muted/30 cursor-pointer"
                            )}
                            style={{ boxSizing: "border-box" }}
                            onMouseDown={(e) => {
                              if (!draggedReservation && !hasConflict) {
                                e.preventDefault();
                                handleMouseDown(date, category.id);
                              }
                            }}
                            onMouseEnter={() => {
                              if (!draggedReservation && !hasConflict) {
                                handleMouseEnter(date, category.id);
                              }
                            }}
                            onMouseUp={(e) => {
                              if (draggedReservation) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              if (!draggedReservation && !hasConflict) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleMouseUp(category.id, undefined, date);
                              }
                            }}
                            title={hasConflict ? "Data ocupada - não é possível criar reserva" : "Clique para criar reserva"}
                          >
                            <div className={cn(
                              "font-medium",
                              hasConflict ? "text-red-600 line-through" : "text-muted-foreground"
                            )}>
                              {formatCurrency(price)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Linhas dos Quartos */}
                  {isExpanded && rooms.map((room: any) => {
                    const roomReservations = reservationsByRoom[room.id] || [];
                    const visibleReservations = roomReservations.filter((r: any) => {
                      const pos = getReservationPosition(r);
                      return pos.isVisible;
                    });

                    return (
                      <div 
                        key={room.id} 
                        className="flex hover:bg-slate-50/50 transition-colors relative border-b border-slate-100"
                      >
                        <div className="w-48 sm:w-56 p-2 pl-6 border-r border-slate-200 bg-white text-xs flex-shrink-0">
                          <div className="font-semibold text-slate-900 text-[11px]">{category.name}</div>
                          <div className="text-[10px] text-slate-600 mt-0.5 font-medium">
                            Quarto {room.room_number}
                          </div>
                        </div>
                        <div 
                          ref={gridRef}
                          className="flex-1 flex min-w-0 relative" 
                          style={{ 
                            minHeight: "40px", 
                            position: "relative",
                            display: 'grid',
                            gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`,
                            gap: 0,
                            pointerEvents: 'none' // Permite que eventos passem para os elementos filhos
                          }}
                        >
                          {/* Células de fundo */}
                          {visibleDates.map((date, dateIndex) => {
                            const isSelected = isDateInSelection(date, category.id, room.id);
                            const isHovered = hoveredCell?.roomId === room.id && hoveredCell?.dateIndex === dateIndex;
                            // Excluir a reserva sendo arrastada da verificação de conflito para evitar bloqueio fantasma
                            const excludeReservationId = draggedReservation?.reservation?.id;
                            const dateStr = format(date, "yyyy-MM-dd");
                            const hasConflict = hasConflictForDate(date, category.id, room.id, excludeReservationId);
                            
                            // Debug: Log quando há conflito para data específica (especialmente dia 15)
                            if (hasConflict && process.env.NODE_ENV === 'development' && (dateStr === "2025-11-15" || dateStr.includes("-15"))) {
                              console.log(`🔴 CÉLULA BLOQUEADA - hasConflictForDate retornou TRUE para data ${dateStr}`, {
                                date: dateStr,
                                roomId: room.id?.substring(0, 8),
                                categoryId: category.id?.substring(0, 8),
                                excludeReservationId: excludeReservationId?.substring(0, 8),
                                // Verificar reservas do quarto
                                roomReservations: (reservationsByRoom[room.id] || []).map((r: any) => ({
                                  id: r.id?.substring(0, 8),
                                  checkin: r.checkin_date?.split('T')[0],
                                  checkout: r.checkout_date?.split('T')[0],
                                  status: r.status
                                }))
                              });
                            }
                            
                            // 🔧 CORREÇÃO: Verificar se a data é checkout de alguma reserva do quarto
                            // Se for checkout, NÃO deve ter conflito (checkout exclusivo)
                            const roomReservations = reservationsByRoom[room.id] || [];
                            const isCheckoutDate = roomReservations.some((r: any) => {
                              if (r.id === excludeReservationId) return false;
                              const checkout = r.checkout_date?.split('T')[0] || r.checkout_date;
                              return checkout === dateStr;
                            });
                            
                            // Se a data é checkout, forçar hasConflict = false
                            const finalHasConflict = isCheckoutDate ? false : hasConflict;
                            
                            // Debug: Verificar se há conflito falso positivo (apenas em desenvolvimento)
                            if (hasConflict && !finalHasConflict && process.env.NODE_ENV === 'development') {
                              console.log(`🔧 CORREÇÃO APLICADA: Data ${dateStr} é checkout - removendo conflito falso positivo`, {
                                date: dateStr,
                                roomId: room.id?.substring(0, 8),
                                categoryId: category.id?.substring(0, 8)
                              });
                            }
                            
                            if (finalHasConflict && process.env.NODE_ENV === 'development') {
                              // Verificar se realmente há uma reserva ocupando esta data
                              const hasActualReservation = roomReservations.some((r: any) => {
                                if (r.id === excludeReservationId) return false;
                                const checkin = r.checkin_date?.split('T')[0] || r.checkin_date;
                                const checkout = r.checkout_date?.split('T')[0] || r.checkout_date;
                                // Check-in INCLUSIVO, Check-out EXCLUSIVO
                                const isOccupied = dateStr >= checkin && dateStr < checkout;
                                return isOccupied;
                              });
                              
                              if (!hasActualReservation) {
                                console.error(`❌ CÉLULA BLOQUEADA INCORRETAMENTE - Data ${dateStr} está marcada como conflito mas não há reserva ocupando:`, {
                                  date: dateStr,
                                  roomId: room.id?.substring(0, 8),
                                  categoryId: category.id?.substring(0, 8),
                                  roomReservations: roomReservations.map((r: any) => ({
                                    id: r.id?.substring(0, 8),
                                    checkin: r.checkin_date?.split('T')[0],
                                    checkout: r.checkout_date?.split('T')[0],
                                    status: r.status
                                  })),
                                  // Verificar se alguma reserva tem checkout nesta data
                                  checkouts: roomReservations.map((r: any) => {
                                    const checkout = r.checkout_date?.split('T')[0] || r.checkout_date;
                                    return { id: r.id?.substring(0, 8), checkout, isCheckout: checkout === dateStr };
                                  })
                                });
                              }
                            }
                            
                            return (
                              <div
                                key={date.toISOString()}
                                className={cn(
                                  "border-r border-slate-100 last:border-r-0 transition-all duration-100 min-w-[90px] relative",
                                  finalHasConflict
                                    ? "bg-red-50/40 cursor-not-allowed border-red-200"
                                    : isSelected 
                                    ? "bg-blue-100/60 ring-2 ring-blue-300/50 cursor-pointer border-blue-200" 
                                    : isHovered && isValidDrop
                                    ? "bg-emerald-100/70 ring-2 ring-emerald-400/60 cursor-move border-emerald-300 shadow-inner"
                                    : isHovered && !isValidDrop
                                    ? "bg-red-100/60 ring-2 ring-red-400/60 cursor-not-allowed border-red-300 shadow-inner"
                                    : "hover:bg-slate-50/80 cursor-pointer border-slate-100"
                                )}
                                style={{ boxSizing: "border-box", pointerEvents: draggedReservation ? 'none' : 'auto' }}
                                onMouseDown={(e) => {
                                  if (!draggedReservation && !finalHasConflict) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMouseDown(date, category.id, room.id);
                                  }
                                }}
                                onMouseEnter={() => {
                                  if (!draggedReservation && !finalHasConflict) {
                                    handleMouseEnter(date, category.id, room.id);
                                  }
                                }}
                                onMouseUp={(e) => {
                                  if (draggedReservation) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  if (!draggedReservation && !finalHasConflict) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMouseUp(category.id, room.id, date);
                                  }
                                }}
                                title={finalHasConflict ? "Data ocupada - não é possível criar reserva" : "Clique para criar reserva"}
                              />
                            );
                          })}

                          {/* Reservas usando grid-column */}
                          {visibleReservations.map((reservation: any) => {
                              const pos = getReservationPosition(reservation);
                              if (!pos.isVisible || pos.startIndex < 0) return null;

                              // 🔧 Se é o bloco sendo arrastado, renderizar com opacidade reduzida
                              const isBeingDragged = draggedReservation?.reservation?.id === reservation.id;

                              const statusColor = getStatusColor(reservation.status);
                              // Só permite drag se tiver quarto específico e não for blocked/cancelled/checkedout
                              const canDrag = reservation.room_id && !["blocked", "cancelled", "checkedout"].includes(reservation.status);
                              
                              // Usar grid-column para posicionamento preciso
                              // grid-column começa em 1, não em 0
                              // gridColumnEnd é EXCLUSIVO, então não precisa adicionar 1
                              const gridColumnStart = pos.startIndex + 1;
                              const gridColumnEnd = gridColumnStart + pos.duration;
                              
                              // Debug: Verificar se a duração está correta
                              const checkinDate = format(pos.checkinDate, "yyyy-MM-dd");
                              const checkoutDate = format(pos.checkoutDate, "yyyy-MM-dd");
                              const expectedDuration = differenceInDays(pos.checkoutDate, pos.checkinDate);
                              
                              if (pos.duration !== expectedDuration && process.env.NODE_ENV === 'development') {
                                console.warn(`⚠️ Duração da reserva não corresponde:`, {
                                  reservationId: reservation.id?.substring(0, 8),
                                  checkin: checkinDate,
                                  checkout: checkoutDate,
                                  expectedDuration,
                                  actualDuration: pos.duration,
                                  startIndex: pos.startIndex,
                                  gridColumnStart,
                                  gridColumnEnd
                                });
                              }

                              return (
                                <div
                                  key={reservation.id}
                                  className={cn(
                                    "rounded-sm border transition-all z-10 flex items-center gap-1.5 px-2 py-1 group relative overflow-hidden",
                                    statusColor.bg,
                                    statusColor.text,
                                    statusColor.border,
                                    canDrag 
                                      ? "cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-[1.01] hover:z-30" 
                                      : "cursor-pointer hover:shadow-sm hover:brightness-105"
                                  )}
                                  style={{
                                    gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                                    gridRow: 1,
                                    minWidth: "50px",
                                    boxSizing: "border-box",
                                    opacity: isBeingDragged ? 0.3 : 1,
                                    height: "28px",
                                    margin: "2px 0", // Margem vertical apenas, sem margem horizontal para não afetar o grid
                                    pointerEvents: 'auto', // Garante que eventos de mouse funcionem
                                    zIndex: isBeingDragged ? 5 : 10,
                                  }}
                                  onMouseDown={(e) => {
                                    console.log("🔵 onMouseDown no bloco", { canDrag, code: reservation.reservation_code });
                                    e.stopPropagation(); // Impede que o evento chegue nas células de fundo
                                    if (canDrag) {
                                      handleReservationMouseDown(e, reservation);
                                    } else {
                                      // Para reservas que não podem arrastar, abrir com clique normal
                                      e.preventDefault();
                                      onSelectReservation?.(reservation.id);
                                    }
                                  }}
                                >
                                  {/* Indicador de reserva sem quarto específico */}
                                  {!reservation.room_id && (
                                    <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold shadow-sm z-20">
                                      SEM QUARTO
                                    </div>
                                  )}
                                  
                                  {/* Badge de status - aparece no hover */}
                                  <div className={cn(
                                    "absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap shadow-sm z-30",
                                    statusColor.dot,
                                    "text-white"
                                  )}>
                                    {statusConfig[reservation.status]?.label || "Reserva"}
                                  </div>

                                  {/* Botão de cancelar/remover (para bloqueios e reservas pendentes) */}
                                  {(reservation.status === "blocked" || reservation.status === "pending" || reservation.status === "preregistration") && (
                                    <button
                                      className={cn(
                                        "absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-40 shadow-lg hover:scale-110",
                                        reservation.status === "blocked" 
                                          ? "bg-slate-700 hover:bg-slate-800" 
                                          : "bg-red-500 hover:bg-red-600",
                                        "text-white"
                                      )}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        
                                        const actionText = reservation.status === "blocked" ? "desbloquear" : "cancelar";
                                        
                                        if (window.confirm(`Deseja realmente ${actionText} esta ${reservation.status === "blocked" ? "unidade bloqueada" : "reserva"}?`)) {
                                          try {
                                            if (reservation.status === "blocked") {
                                              // Para bloqueios, deletar o registro
                                              const { error } = await supabase
                                                .from("reservations")
                                                .delete()
                                                .eq("id", reservation.id);
                                              
                                              if (error) throw error;
                                              toast.success("Bloqueio removido com sucesso!");
                                            } else {
                                              // Para reservas pendentes/pré-reservas, apenas cancelar
                                              const { error } = await supabase
                                                .from("reservations")
                                                .update({ status: "cancelled" })
                                                .eq("id", reservation.id);
                                              
                                              if (error) throw error;
                                              toast.success("Reserva cancelada com sucesso!");
                                            }
                                            
                                            queryClient.invalidateQueries({ queryKey: ["reservations"] });
                                            queryClient.invalidateQueries({ queryKey: ["rooms"] });
                                            queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
                                          } catch (error: any) {
                                            toast.error(error.message || `Erro ao ${actionText}`);
                                          }
                                        }
                                      }}
                                      title={reservation.status === "blocked" ? "Remover bloqueio" : "Cancelar reserva"}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {/* Conteúdo principal - Estilo Hospedin */}
                                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                    <div className="flex-1 min-w-0">
                                      {reservation.clients?.full_name ? (
                                        <div className="text-[11px] font-bold truncate leading-tight">
                                          {reservation.clients.full_name}
                                        </div>
                                      ) : (
                                        <div className="text-[11px] font-bold truncate leading-tight">
                                          {reservation.reservation_code || reservation.id.substring(0, 8).toUpperCase()}
                                        </div>
                                      )}
                                      {reservation.reservation_code && reservation.clients?.full_name && (
                                        <div className="text-[9px] opacity-80 truncate leading-tight">
                                          {reservation.reservation_code}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              );
                            })}

                          {/* Preview na grade removido - usando apenas o preview que segue o cursor */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 🔧 Preview fixo que segue o cursor (baseado em lógica funcional de referência) */}
      {draggedReservation && currentMousePos && dragStartPos && (
        <div
          className={cn(
            "fixed pointer-events-none rounded-lg shadow-2xl border-2 flex items-center justify-center font-semibold text-sm z-50",
            isValidDrop 
              ? "bg-emerald-500 text-white border-emerald-600" 
              : "bg-red-500 text-white border-red-600"
          )}
            style={{
              left: currentMousePos.x - dragStartPos.offsetX,
              top: currentMousePos.y - dragStartPos.offsetY,
              width: (() => {
                // Calcular duração real para o preview
                const realDuration = getReservationRealDuration(draggedReservation.reservation);
                return realDuration * cellWidth;
              })(),
              height: 32,
              opacity: 0.8,
            }}
        >
          {draggedReservation.reservation.reservation_code || draggedReservation.reservation.id.substring(0, 8).toUpperCase()}
        </div>
      )}

      {/* Legenda Minimalista */}
      <div className="flex flex-wrap gap-4 items-center text-sm">
        <span className="font-medium text-muted-foreground">Legenda:</span>
        {Object.entries(statusConfig).map(([status, config]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", config.dot)} />
            <span className="text-xs text-muted-foreground">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Modal Rápido */}
      {quickDialogData && (
        <QuickReservationDialog
          open={quickDialogOpen}
          onOpenChange={(open) => {
            setQuickDialogOpen(open);
            if (!open) {
              setQuickDialogData(null);
            }
          }}
          onProceed={(data) => {
            if (onCreateReservation) {
              onCreateReservation({
                checkin_date: data.checkin_date,
                checkout_date: data.checkout_date,
                category_id: data.category_id,
                room_id: data.room_id,
                channel: data.channel,
                pricing_plan_id: data.pricing_plan_id,
                adults: data.adults,
                children: data.children,
                total_amount: data.total_amount,
                action: data.action,
              } as any);
            }
            setQuickDialogOpen(false);
            setQuickDialogData(null);
          }}
          initialData={quickDialogData}
        />
      )}

    </div>
  );
};
