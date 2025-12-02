import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2, Eye, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/reservationUtils";
import { useNavigate } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export const RecentReservations = () => {
  const navigate = useNavigate();
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.numeric_id || selectedEstablishment?.id;
  
  const { data: reservations, isLoading } = useQuery({
    queryKey: ["recent_reservations", selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) {
        return [];
      }

      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = nextWeek.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          id,
          checkin_date,
          checkout_date,
          status,
          reservation_code,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name),
          rooms(room_number, name)
        `)
        .eq("establishment_id", selectedEstablishment.id)
        .gte("checkin_date", today)
        .lte("checkin_date", nextWeekStr)
        .in("status", ["pending", "confirmed", "preregistration"])
        .neq("status", "cancelled")
        .order("checkin_date", { ascending: true })
        .limit(10);

      if (error) {
        console.error("Erro ao buscar próximas chegadas:", error);
        throw error;
      }
      
      // Log para debug
      if (data && data.length > 0) {
        console.log("Reservas encontradas:", data.map((r: any) => ({
          id: r.id,
          reservation_code: r.reservation_code,
          guest: r.guest?.full_name || r.financial_responsible?.full_name
        })));
      }
      
      return data || [];
    },
  });

  const getStatusBadge = (status: string) => {
    if (status === "confirmed") {
      return <Badge variant="default">Confirmada</Badge>;
    }
    if (status === "preregistration") {
      return <Badge variant="outline">Pré-registro</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const getGuestName = (reservation: any) => {
    return reservation.guest?.full_name || 
           reservation.financial_responsible?.full_name || 
           "N/A";
  };

  const getRoomInfo = (reservation: any) => {
    const room = reservation.rooms;
    if (room) {
      return Array.isArray(room) ? room[0] : room;
    }
    return null;
  };

  const formatCheckinDate = (date: string) => {
    const checkinDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkinDate.setHours(0, 0, 0, 0);

    const diffTime = checkinDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Amanhã";
    return formatDate(date);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Próximas Chegadas</h3>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : reservations && reservations.length > 0 ? (
      <div className="space-y-3">
          {reservations.map((reservation: any) => {
            const room = getRoomInfo(reservation);
            const roomNumber = room?.room_number || room?.name || "Não atribuído";
            
            const handleNavigateToDetails = (e?: React.MouseEvent) => {
              if (e) {
                e.stopPropagation();
                e.preventDefault();
              }
              
              // Usar numeric_id se disponível, caso contrário usar o id UUID
              const establishmentIdentifier = selectedEstablishment?.numeric_id || selectedEstablishment?.id;
              
              if (!establishmentIdentifier) {
                console.warn("Establishment ID não encontrado");
                return;
              }

              // O ReservationDetails busca por reservation_code, então precisamos do código
              if (!reservation.reservation_code) {
                console.error("Reservation code não disponível:", reservation);
                return;
              }

              const path = `/${establishmentIdentifier}/reservas/${reservation.reservation_code}`;
              console.log("Navegando para detalhes da reserva:", path, { 
                establishmentIdentifier,
                numeric_id: selectedEstablishment?.numeric_id,
                establishment_id: selectedEstablishment?.id,
                reservation_code: reservation.reservation_code,
                reservation_id: reservation.id
              });
              
              try {
                // Tentar navegação com React Router primeiro
                navigate(path, { replace: false });
              } catch (error) {
                console.error("Erro ao navegar:", error);
                window.location.href = path;
              }
            };

            return (
              <div 
                key={reservation.id} 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors gap-3 cursor-pointer group"
                onClick={handleNavigateToDetails}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNavigateToDetails();
                  }
                }}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {getGuestName(reservation)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roomNumber} • {formatCheckinDate(reservation.checkin_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(reservation.status)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNavigateToDetails}
                    className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                    title="Ver detalhes da reserva"
                    disabled={!selectedEstablishment || !reservation.reservation_code}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
      ) : (
        <div className="text-center py-4 text-sm text-muted-foreground">
          Nenhuma chegada prevista
        </div>
      )}
    </Card>
  );
};
