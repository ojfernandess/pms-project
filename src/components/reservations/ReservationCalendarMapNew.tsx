import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, eachDayOfInterval, parseISO, startOfDay, isSameDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservations } from "@/hooks/useReservations";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

const statusConfig: Record<string, { 
  bg: string; 
  text: string; 
  label: string; 
  border: string;
}> = {
  pending: { bg: "bg-amber-100", text: "text-amber-900", label: "Pendente", border: "border-amber-400" },
  confirmed: { bg: "bg-teal-500", text: "text-white", label: "Confirmada", border: "border-teal-600" },
  checkedin: { bg: "bg-blue-500", text: "text-white", label: "Check-in", border: "border-blue-600" },
  checkedout: { bg: "bg-slate-200", text: "text-slate-800", label: "Check-out", border: "border-slate-300" },
  cancelled: { bg: "bg-red-500", text: "text-white", label: "Cancelada", border: "border-red-600" },
  noshow: { bg: "bg-rose-500", text: "text-white", label: "No Show", border: "border-rose-600" },
  blocked: { bg: "bg-slate-800", text: "text-white", label: "Bloqueada", border: "border-slate-900" },
  preregistration: { bg: "bg-purple-500", text: "text-white", label: "Pré-reserva", border: "border-purple-600" },
};

export const ReservationCalendarMap = ({ 
  onSelectReservation, 
  onCreateReservation, 
  onReservationAction 
}: ReservationCalendarMapProps) => {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [viewDays, setViewDays] = useState(30);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickDialogData, setQuickDialogData] = useState<{
    checkin_date: string;
    checkout_date: string;
    category_id?: string;
    room_id?: string;
  } | null>(null);

  // Estados para drag de criação de reserva
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ date: Date; categoryId?: string; roomId?: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);

  // Estados para drag de reserva existente
  const [draggedReservation, setDraggedReservation] = useState<{
    reservation: any;
    startIndex: number;
    roomId: string;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ dateIndex: number; roomId: string } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // Calcular datas visíveis
  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, viewDays - 1)
    });
  }, [startDate, viewDays]);

  // Buscar categorias e quartos
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["occupancy_map_rooms", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      const { data, error } = await supabase
        .from("room_categories")
        .select(`
          *,
          rooms:rooms!inner(*)
        `)
        .eq("establishment_id", establishmentId)
        .order("name")
        .order("rooms(room_number)", { foreignTable: "rooms" });

      if (error) throw error;
      return data || [];
    },
  });

  // Buscar reservas
  const { data: reservations = [] } = useQuery({
    queryKey: ["reservations", visibleDates[0]?.toISOString(), visibleDates[visibleDates.length - 1]?.toISOString()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      const start = format(visibleDates[0], "yyyy-MM-dd");
      const end = format(visibleDates[visibleDates.length - 1], "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          *,
          room_categories(*)
        `)
        .eq("establishment_id", establishmentId)
        .gte("checkout_date", start)
        .lte("checkin_date", end)
        .neq("status", "cancelled");

      if (error) throw error;
      return data || [];
    },
  });

  // Agrupar reservas por quarto
  const reservationsByRoom = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    reservations.forEach((r: any) => {
      if (r.room_id) {
        if (!grouped[r.room_id]) grouped[r.room_id] = [];
        grouped[r.room_id].push(r);
      }
    });
    return grouped;
  }, [reservations]);

  // Função para verificar se uma data está ocupada
  // REGRA: Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
  // Exemplo: Reserva 14/11-15/11 ocupa APENAS o dia 14/11, o dia 15/11 está LIVRE
  const isDateOccupied = useCallback((date: Date, roomId: string, excludeReservationId?: string): boolean => {
    const dateStr = format(startOfDay(date), "yyyy-MM-dd");
    const roomReservations = reservationsByRoom[roomId] || [];

    for (const reservation of roomReservations) {
      if (reservation.id === excludeReservationId) continue;
      if (reservation.status === "cancelled") continue;

      const checkin = reservation.checkin_date?.split('T')[0] || reservation.checkin_date;
      const checkout = reservation.checkout_date?.split('T')[0] || reservation.checkout_date;

      if (!checkin || !checkout) continue;

      // Se a data é exatamente o checkout, NÃO está ocupada (checkout exclusivo)
      if (dateStr === checkout) continue;

      // Verificar se a data está no intervalo [checkin, checkout)
      if (dateStr >= checkin && dateStr < checkout) {
        return true;
      }
    }

    return false;
  }, [reservationsByRoom]);

  // Calcular posição de uma reserva no grid
  const getReservationPosition = useCallback((reservation: any) => {
    const checkin = parseISO(reservation.checkin_date);
    const checkout = parseISO(reservation.checkout_date);
    const duration = differenceInDays(checkout, checkin);

    const startIndex = visibleDates.findIndex((d) => isSameDay(d, checkin));
    if (startIndex === -1) return { startIndex: -1, duration: 0, isVisible: false };

    return {
      startIndex,
      duration,
      isVisible: startIndex >= 0 && startIndex + duration <= visibleDates.length
    };
  }, [visibleDates]);

  // Handlers para criar reserva (drag)
  const handleMouseDown = (date: Date, categoryId?: string, roomId?: string) => {
    if (draggedReservation) return;
    if (roomId && isDateOccupied(date, roomId)) return;

    setDragStart({ date: startOfDay(date), categoryId, roomId });
    setDragEnd(startOfDay(date));
    setIsDragging(true);
  };

  const handleMouseEnter = (date: Date, categoryId?: string, roomId?: string) => {
    if (!isDragging || !dragStart || draggedReservation) return;
    if (dragStart.categoryId && categoryId !== dragStart.categoryId) return;
    if (dragStart.roomId && roomId !== dragStart.roomId) return;

    const endDate = startOfDay(date);
    const startDate = dragStart.date;
    const minDate = startDate < endDate ? startDate : endDate;
    const maxDate = startDate > endDate ? startDate : endDate;

    // Verificar se há conflito no intervalo
    if (roomId) {
      const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
      const hasConflict = datesInRange.some((d) => isDateOccupied(d, roomId));
      if (hasConflict) return;
    }

    setDragEnd(endDate);
  };

  const handleMouseUp = (categoryId?: string, roomId?: string, date?: Date) => {
    if (draggedReservation) return;

    if (!isDragging || !dragStart || !dragEnd) {
      // Clique direto sem drag
      if (date && roomId && !isDateOccupied(date, roomId)) {
        const clickedDate = startOfDay(date);
        setQuickDialogData({
          checkin_date: format(clickedDate, "yyyy-MM-dd"),
          checkout_date: format(addDays(clickedDate, 1), "yyyy-MM-dd"),
          category_id: categoryId,
          room_id: roomId,
        });
        setQuickDialogOpen(true);
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const start = dragStart.date;
    const end = dragEnd;
    const minDate = start < end ? start : end;
    const maxDate = start > end ? start : end;

    if (roomId) {
      const datesInRange = eachDayOfInterval({ start: minDate, end: maxDate });
      const hasConflict = datesInRange.some((d) => isDateOccupied(d, roomId));
      if (hasConflict) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }
    }

    setQuickDialogData({
      checkin_date: format(minDate, "yyyy-MM-dd"),
      checkout_date: format(addDays(maxDate, 1), "yyyy-MM-dd"),
      category_id: categoryId || dragStart.categoryId,
      room_id: roomId || dragStart.roomId,
    });
    setQuickDialogOpen(true);

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Handlers para mover reserva existente
  const handleReservationMouseDown = (e: React.MouseEvent, reservation: any) => {
    e.preventDefault();
    e.stopPropagation();

    if (["blocked", "cancelled", "checkedout"].includes(reservation.status)) return;
    if (!reservation.room_id) return;

    const pos = getReservationPosition(reservation);
    if (!pos.isVisible) return;

    setDraggedReservation({
      reservation,
      startIndex: pos.startIndex,
      roomId: reservation.room_id
    });
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleReservationMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedReservation || !gridRef.current) return;

    setDragPosition({ x: e.clientX, y: e.clientY });

    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellWidth = rect.width / visibleDates.length;
    const cellHeight = 50;

    const dateIndex = Math.max(0, Math.min(Math.floor(x / cellWidth), visibleDates.length - 1));
    
    // Encontrar o quarto baseado na posição Y
    let targetRoomId = draggedReservation.roomId;
    let rowIndex = 0;
    
    categories.forEach((category: any) => {
      if (!expandedCategories.has(category.id)) return;
      category.rooms?.forEach((room: any) => {
        if (rowIndex * cellHeight <= y && y < (rowIndex + 1) * cellHeight) {
          targetRoomId = room.id;
        }
        rowIndex++;
      });
    });

    setHoveredCell({ dateIndex, roomId: targetRoomId });
  }, [draggedReservation, visibleDates, categories, expandedCategories]);

  const handleReservationMouseUp = useCallback(async () => {
    if (!draggedReservation || !hoveredCell) {
      setDraggedReservation(null);
      setDragPosition(null);
      setHoveredCell(null);
      return;
    }

    const newCheckinDate = visibleDates[hoveredCell.dateIndex];
    const oldCheckin = parseISO(draggedReservation.reservation.checkin_date);
    const oldCheckout = parseISO(draggedReservation.reservation.checkout_date);
    const duration = differenceInDays(oldCheckout, oldCheckin);
    const newCheckoutDate = addDays(newCheckinDate, duration);

    // Verificar conflitos
    const datesInRange = eachDayOfInterval({ start: newCheckinDate, end: addDays(newCheckinDate, duration - 1) });
    const hasConflict = datesInRange.some((d) => isDateOccupied(d, hoveredCell.roomId, draggedReservation.reservation.id));

    if (hasConflict) {
      toast.error("Já existe uma reserva neste período");
      setDraggedReservation(null);
      setDragPosition(null);
      setHoveredCell(null);
      return;
    }

    // Atualizar reserva
    try {
      const { error } = await supabase
        .from("reservations")
        .update({
          checkin_date: format(newCheckinDate, "yyyy-MM-dd"),
          checkout_date: format(newCheckoutDate, "yyyy-MM-dd"),
          room_id: hoveredCell.roomId
        })
        .eq("id", draggedReservation.reservation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Reserva movida com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao mover reserva");
    }

    setDraggedReservation(null);
    setDragPosition(null);
    setHoveredCell(null);
  }, [draggedReservation, hoveredCell, visibleDates, isDateOccupied, queryClient]);

  // Listener global para drag de reserva
  useEffect(() => {
    if (!draggedReservation) return;

    document.addEventListener("mousemove", handleReservationMouseMove);
    document.addEventListener("mouseup", handleReservationMouseUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleReservationMouseMove);
      document.removeEventListener("mouseup", handleReservationMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [draggedReservation, handleReservationMouseMove, handleReservationMouseUp]);

  // Listener global para drag de criação
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      handleMouseUp();
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

  if (categoriesLoading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(startDate, "dd 'de' MMMM", { locale: ptBR })}
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

          <Button
            variant="outline"
            size="icon"
            onClick={() => setStartDate(addDays(startDate, -viewDays))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStartDate(addDays(startDate, viewDays))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Select value={viewDays.toString()} onValueChange={(v) => setViewDays(Number(v))}>
            <SelectTrigger className="w-[120px]">
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

      {/* Grid */}
      <Card className="p-4 overflow-x-auto">
        <div className="min-w-full">
          {/* Cabeçalho com datas */}
          <div className="flex border-b">
            <div className="w-48 sm:w-56 flex-shrink-0 p-2 border-r font-semibold text-xs">
              Categoria / Quarto
            </div>
            <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)` }}>
              {visibleDates.map((date) => (
                <div key={date.toISOString()} className="border-r last:border-r-0 p-2 text-center text-xs">
                  <div className="font-semibold">{format(date, "EEE", { locale: ptBR })}</div>
                  <div className="text-muted-foreground">{format(date, "dd/MM")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Linhas de categorias e quartos */}
          <div ref={gridRef}>
            {categories.map((category: any) => {
              const isExpanded = expandedCategories.has(category.id);
              const rooms = category.rooms || [];

              return (
                <div key={category.id}>
                  {/* Linha da categoria */}
                  <div className="flex border-b bg-slate-50/40">
                    <div className="w-48 sm:w-56 flex-shrink-0 p-2 border-r flex items-center gap-2">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="p-1 hover:bg-slate-200 rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <span className="font-bold text-xs uppercase">{category.name}</span>
                      <span className="text-xs text-muted-foreground">({rooms.length})</span>
                    </div>
                    <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)` }}>
                      {visibleDates.map((date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const isSelected = isDateInSelection(date, category.id);
                        const isOccupied = rooms.some((room: any) => isDateOccupied(date, room.id));

                        return (
                          <div
                            key={date.toISOString()}
                            className={cn(
                              "border-r last:border-r-0 p-2 text-center text-xs min-w-[90px]",
                              isOccupied
                                ? "bg-red-50/50 cursor-not-allowed opacity-60"
                                : isSelected
                                ? "bg-primary/10 ring-1 ring-primary/20 cursor-pointer"
                                : "hover:bg-muted/30 cursor-pointer"
                            )}
                            onMouseDown={(e) => {
                              if (!draggedReservation && !isOccupied) {
                                e.preventDefault();
                                handleMouseDown(date, category.id);
                              }
                            }}
                            onMouseEnter={() => {
                              if (isDragging && !isOccupied) {
                                handleMouseEnter(date, category.id);
                              }
                            }}
                            onMouseUp={(e) => {
                              if (!draggedReservation && !isOccupied) {
                                e.preventDefault();
                                handleMouseUp(category.id, undefined, date);
                              }
                            }}
                            title={isOccupied ? "Data ocupada" : "Clique para criar reserva"}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Linhas dos quartos */}
                  {isExpanded && rooms.map((room: any) => {
                    const roomReservations = reservationsByRoom[room.id] || [];
                    const visibleReservations = roomReservations.filter((r: any) => {
                      const pos = getReservationPosition(r);
                      return pos.isVisible;
                    });

                    return (
                      <div key={room.id} className="flex border-b hover:bg-slate-50/50 relative" style={{ minHeight: "50px" }}>
                        <div className="w-48 sm:w-56 flex-shrink-0 p-2 border-r bg-white text-xs">
                          <div className="font-semibold text-[11px]">{category.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Quarto {room.room_number}
                          </div>
                        </div>
                        <div 
                          className="flex-1 relative"
                          style={{ 
                            display: 'grid', 
                            gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)`,
                            gap: 0
                          }}
                        >
                          {/* Células de fundo */}
                          {visibleDates.map((date, dateIndex) => {
                            const isSelected = isDateInSelection(date, category.id, room.id);
                            const isOccupied = isDateOccupied(date, room.id, draggedReservation?.reservation?.id);
                            const isHovered = hoveredCell?.roomId === room.id && hoveredCell?.dateIndex === dateIndex;
                            const isValidDrop = draggedReservation && hoveredCell?.roomId === room.id && 
                              !isDateOccupied(date, room.id, draggedReservation.reservation.id);

                            return (
                              <div
                                key={date.toISOString()}
                                className={cn(
                                  "border-r border-slate-100 last:border-r-0 transition-all min-w-[90px] relative",
                                  isOccupied
                                    ? "bg-red-50/40 cursor-not-allowed border-red-200"
                                    : isSelected
                                    ? "bg-blue-100/60 ring-2 ring-blue-300/50 cursor-pointer"
                                    : isHovered && draggedReservation && isValidDrop
                                    ? "bg-emerald-100/70 ring-2 ring-emerald-400/60"
                                    : isHovered && draggedReservation && !isValidDrop
                                    ? "bg-red-100/60 ring-2 ring-red-400/60"
                                    : "hover:bg-slate-50/80 cursor-pointer"
                                )}
                                style={{ minHeight: "50px" }}
                                onMouseDown={(e) => {
                                  if (!draggedReservation && !isOccupied) {
                                    e.preventDefault();
                                    handleMouseDown(date, category.id, room.id);
                                  }
                                }}
                                onMouseEnter={() => {
                                  if (isDragging && !isOccupied) {
                                    handleMouseEnter(date, category.id, room.id);
                                  }
                                }}
                                onMouseUp={(e) => {
                                  if (!draggedReservation && !isOccupied) {
                                    e.preventDefault();
                                    handleMouseUp(category.id, room.id, date);
                                  }
                                }}
                                title={isOccupied ? "Data ocupada - não é possível criar reserva" : "Clique para criar reserva"}
                              />
                            );
                          })}

                          {/* Reservas */}
                          {visibleReservations.map((reservation: any) => {
                            const pos = getReservationPosition(reservation);
                            if (!pos.isVisible) return null;

                            const statusColor = statusConfig[reservation.status] || statusConfig.confirmed;
                            const isDraggingThis = draggedReservation?.reservation?.id === reservation.id;

                            return (
                              <div
                                key={reservation.id}
                                className={cn(
                                  "absolute rounded-sm border transition-all flex items-center gap-1.5 px-2 py-1 group",
                                  statusColor.bg,
                                  statusColor.text,
                                  statusColor.border,
                                  isDraggingThis
                                    ? "opacity-30 cursor-grabbing z-50"
                                    : "cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-[1.01] z-10"
                                )}
                                style={{
                                  left: `${(pos.startIndex / visibleDates.length) * 100}%`,
                                  width: `${(pos.duration / visibleDates.length) * 100}%`,
                                  height: "28px",
                                  top: "11px",
                                  margin: "0 1px",
                                  pointerEvents: 'auto',
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleReservationMouseDown(e, reservation);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectReservation?.(reservation.id);
                                }}
                              >
                                <GripVertical className="h-3 w-3 opacity-50" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-semibold truncate">
                                    {reservation.guest_name || reservation.reservation_code}
                                  </div>
                                  {reservation.guest_name && (
                                    <div className="text-[9px] opacity-80 truncate">
                                      {reservation.reservation_code}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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

      {/* Dialog de criação rápida */}
      {quickDialogData && (
        <QuickReservationDialog
          open={quickDialogOpen}
          onOpenChange={(open) => {
            setQuickDialogOpen(open);
            if (!open) setQuickDialogData(null);
          }}
          onProceed={(data) => {
            if (onCreateReservation) {
              onCreateReservation({
                checkin_date: data.checkin_date,
                checkout_date: data.checkout_date,
                category_id: data.category_id,
                room_id: data.room_id,
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

