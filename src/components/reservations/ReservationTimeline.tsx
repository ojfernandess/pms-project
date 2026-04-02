import { useState, useMemo, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/reservationUtils";
import { cn } from "@/lib/utils";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";

interface Reservation {
  id: string;
  reservation_code: string;
  checkin_date: string;
  checkout_date: string;
  status: string;
  total_amount: number;
  guest_name?: string | null;
  guest?: { full_name: string };
  financial_responsible?: { full_name: string };
  rooms?: { room_number: string };
  room_categories?: { name: string };
}

interface ReservationTimelineProps {
  reservations: Reservation[];
  isLoading: boolean;
  onUpdateReservation: (id: string, updates: { checkin_date?: string; checkout_date?: string }) => Promise<void>;
  onReplaceReservation: (id: string, newRoomId: string) => Promise<void>;
  onSelectReservation: (id: string) => void;
  canUpdate?: boolean;
}

export const ReservationTimeline = ({
  reservations,
  isLoading,
  onUpdateReservation,
  onReplaceReservation,
  onSelectReservation,
  canUpdate = true,
}: ReservationTimelineProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; date: Date } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; date: Date; side: "left" | "right" } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Calcular período visível (4 semanas)
  const startDate = useMemo(() => {
    const date = new Date(currentDate);
    date.setDate(1); // Primeiro dia do mês
    const dayOfWeek = date.getDay();
    date.setDate(date.getDate() - dayOfWeek); // Voltar para domingo
    return date;
  }, [currentDate]);

  const endDate = useMemo(() => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + 27); // 4 semanas
    return date;
  }, [startDate]);

  // Gerar array de dias
  const days = useMemo(() => {
    const daysArray = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      daysArray.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return daysArray;
  }, [startDate, endDate]);

  // Agrupar reservas por quarto
  const reservationsByRoom = useMemo(() => {
    const grouped: Record<string, Reservation[]> = {};
    reservations.forEach((reservation) => {
      const roomKey = reservation.rooms?.room_number || reservation.room_categories?.name || "Sem quarto";
      if (!grouped[roomKey]) {
        grouped[roomKey] = [];
      }
      grouped[roomKey].push(reservation);
    });
    return grouped;
  }, [reservations]);

  // Calcular posição e largura de uma reserva
  const getReservationStyle = (reservation: Reservation) => {
    const checkin = new Date(reservation.checkin_date);
    const checkout = new Date(reservation.checkout_date);
    const daysDiff = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

    const startOffset = Math.ceil((checkin.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const left = (startOffset / 28) * 100;
    const width = (daysDiff / 28) * 100;

    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - left, width)}%`,
    };
  };

  // Verificar se uma reserva está no período visível
  const isInVisibleRange = (reservation: Reservation) => {
    const checkin = new Date(reservation.checkin_date);
    const checkout = new Date(reservation.checkout_date);
    return checkout >= startDate && checkin <= endDate;
  };

  // Converter posição X para data
  const xToDate = (x: number): Date => {
    if (!timelineRef.current) return new Date();
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeX = x - rect.left;
    const percentage = relativeX / rect.width;
    const daysOffset = Math.round(percentage * 28);
    const date = new Date(startDate);
    date.setDate(date.getDate() + daysOffset);
    return date;
  };

  // Handlers de drag
  const handleMouseDown = (e: React.MouseEvent, reservation: Reservation, side?: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    
    if (side) {
      setResizingId(reservation.id);
      setResizeStart({ 
        x: e.clientX, 
        date: new Date(side === "left" ? reservation.checkin_date : reservation.checkout_date), 
        side 
      });
    } else {
      setDraggingId(reservation.id);
      setDragStart({ 
        x: e.clientX, 
        date: new Date(reservation.checkin_date) 
      });
    }
  };


  useEffect(() => {
    const moveHandler = (e: MouseEvent) => {
      // Feedback visual durante drag
    };
    
    const upHandler = async (e: MouseEvent) => {
      if (!timelineRef.current) return;

      if (draggingId && dragStart) {
        const deltaX = e.clientX - dragStart.x;
        const deltaDays = Math.round((deltaX / timelineRef.current.offsetWidth) * 28);
        const reservation = reservations.find((r) => r.id === draggingId);
        
        if (reservation && Math.abs(deltaDays) > 0) {
          const newCheckin = new Date(reservation.checkin_date);
          newCheckin.setDate(newCheckin.getDate() + deltaDays);
          const newCheckout = new Date(reservation.checkout_date);
          newCheckout.setDate(newCheckout.getDate() + deltaDays);
          
          try {
            await onUpdateReservation(draggingId, {
              checkin_date: newCheckin.toISOString().split("T")[0],
              checkout_date: newCheckout.toISOString().split("T")[0],
            });
          } catch (error) {
            console.error("Erro ao atualizar reserva:", error);
          }
        }
        
        setDraggingId(null);
        setDragStart(null);
      } else if (resizingId && resizeStart) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaDays = Math.round((deltaX / timelineRef.current.offsetWidth) * 28);
        const reservation = reservations.find((r) => r.id === resizingId);
        
        if (reservation && Math.abs(deltaDays) > 0) {
          try {
            if (resizeStart.side === "left") {
              const newCheckin = new Date(resizeStart.date);
              newCheckin.setDate(newCheckin.getDate() + deltaDays);
              const checkout = new Date(reservation.checkout_date);
              if (newCheckin < checkout) {
                await onUpdateReservation(resizingId, {
                  checkin_date: newCheckin.toISOString().split("T")[0],
                });
              }
            } else {
              const newCheckout = new Date(resizeStart.date);
              newCheckout.setDate(newCheckout.getDate() + deltaDays);
              const checkin = new Date(reservation.checkin_date);
              if (newCheckout > checkin) {
                await onUpdateReservation(resizingId, {
                  checkout_date: newCheckout.toISOString().split("T")[0],
                });
              }
            }
          } catch (error) {
            console.error("Erro ao atualizar reserva:", error);
          }
        }
        
        setResizingId(null);
        setResizeStart(null);
      }
    };

    if (draggingId || resizingId) {
      window.addEventListener("mousemove", moveHandler);
      window.addEventListener("mouseup", upHandler);
      return () => {
        window.removeEventListener("mousemove", moveHandler);
        window.removeEventListener("mouseup", upHandler);
      };
    }
  }, [draggingId, resizingId, dragStart, resizeStart, reservations, onUpdateReservation]);

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-primary";
      case "checkedin":
        return "bg-success";
      case "checkedout":
        return "bg-muted";
      case "pending":
        return "bg-warning";
      case "cancelled":
        return "bg-destructive";
      default:
        return "bg-secondary";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigateMonth("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h3>
          <Button variant="outline" size="sm" onClick={() => navigateMonth("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hoje
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div ref={timelineRef} className="min-w-full">
          {/* Cabeçalho com dias */}
          <div className="flex border-b mb-2 sticky top-0 bg-background z-10">
            <div className="w-48 flex-shrink-0 border-r p-2 font-medium">Quarto</div>
            <div className="flex-1 flex">
              {days.map((day, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex-1 border-r p-2 text-center text-xs",
                    day.getDay() === 0 && "bg-muted/50",
                    day.toDateString() === new Date().toDateString() && "bg-primary/10 font-bold"
                  )}
                >
                  <div>{day.getDate()}</div>
                  <div className="text-muted-foreground">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Linhas de quartos */}
          <div className="space-y-1">
            {Object.entries(reservationsByRoom).map(([roomKey, roomReservations]) => (
              <div key={roomKey} className="flex border-b min-h-[60px] relative">
                <div className="w-48 flex-shrink-0 border-r p-2 flex items-center">
                  <div>
                    <div className="font-medium">{roomKey}</div>
                    <div className="text-xs text-muted-foreground">
                      {roomReservations.filter(isInVisibleRange).length} reserva(s)
                    </div>
                  </div>
                </div>
                <div className="flex-1 relative">
                  {roomReservations.filter(isInVisibleRange).map((reservation) => {
                    const style = getReservationStyle(reservation);
                    const isDragging = draggingId === reservation.id;
                    const isResizing = resizingId === reservation.id;
                    
                    return (
                      <div
                        key={reservation.id}
                        className={cn(
                          "absolute top-1 bottom-1 rounded px-2 py-1 text-xs",
                          canUpdate && "hover:opacity-90 transition-opacity",
                          getStatusColor(reservation.status),
                          isDragging && "opacity-50 z-50",
                          isResizing && "opacity-50 z-50"
                        )}
                        style={{
                          left: style.left,
                          width: style.width,
                          minWidth: "60px",
                        }}
                        onClick={() => onSelectReservation(reservation.id)}
                        onMouseDown={canUpdate ? (e) => handleMouseDown(e, reservation) : undefined}
                        className={cn(
                          canUpdate && "cursor-move",
                          !canUpdate && "cursor-pointer"
                        )}
                      >
                        <div className="flex items-center justify-between h-full">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{reservation.reservation_code}</div>
                            <div className="truncate">{reservationGuestDisplayName(reservation, "Sem cliente")}</div>
                            <div className="text-xs opacity-80">
                              {formatDate(reservation.checkin_date)} - {formatDate(reservation.checkout_date)}
                            </div>
                          </div>
                          {/* Handles de resize */}
                          {canUpdate && (
                            <>
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleMouseDown(e, reservation, "left");
                                }}
                              />
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleMouseDown(e, reservation, "right");
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary" />
          <span>Confirmada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-success" />
          <span>Check-in</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-warning" />
          <span>Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-destructive" />
          <span>Cancelada</span>
        </div>
      </div>
    </Card>
  );
};

