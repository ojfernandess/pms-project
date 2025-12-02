import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users, Activity, Loader2 } from "lucide-react";
import { format, eachDayOfInterval, addDays } from "date-fns";
import { formatCurrency } from "@/lib/reservationUtils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

interface RateMetricsSummaryProps {
  categories: any[];
  selectedPlan: string;
  startDate: Date;
  viewDays: number;
}

export const RateMetricsSummary = ({
  categories,
  selectedPlan,
  startDate,
  viewDays,
}: RateMetricsSummaryProps) => {
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  const dates = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, viewDays - 1),
    });
  }, [startDate, viewDays]);

  // Calcular métricas agregadas usando useQuery com busca direta do banco
  const { data: displayMetrics, isLoading, error } = useQuery({
    queryKey: ["rate_metrics_summary", categories.map(c => c.id).join(","), selectedPlan, startDate.toISOString(), viewDays],
    queryFn: async () => {
      try {
        const establishmentId = getEstablishmentId();
        if (!establishmentId || !selectedPlan || categories.length === 0 || dates.length === 0) {
          return {
            adr: 0,
            revpar: 0,
            occupancy: 0,
            projectedOccupancy: 0,
            pickupRate: 0,
            revenue: 0,
            bookings: 0,
          };
        }

        const startDateStr = format(dates[0], "yyyy-MM-dd");
        const endDateStr = format(dates[dates.length - 1], "yyyy-MM-dd");
        const categoryIds = categories.map(c => c.id);

        // Buscar todas as reservas do período de uma vez
        const { data: reservations } = await supabase
          .from("reservations")
          .select(`
            id,
            checkin_date,
            checkout_date,
            status,
            room_id,
            category_id,
            total_amount,
            paid_amount,
            created_at
          `)
          .eq("establishment_id", establishmentId)
          .neq("status", "cancelled")
          .or(`and(checkout_date.gte.${startDateStr},checkin_date.lte.${endDateStr})`);

        // Buscar todos os quartos das categorias
        const { data: rooms } = await supabase
          .from("rooms")
          .select("id, category_id")
          .eq("establishment_id", establishmentId)
          .in("category_id", categoryIds);

        if (!reservations || !rooms) {
          return {
            adr: 0,
            revpar: 0,
            occupancy: 0,
            projectedOccupancy: 0,
            pickupRate: 0,
            revenue: 0,
            bookings: 0,
          };
        }

        // Agrupar quartos por categoria
        const roomsByCategory = new Map<string, any[]>();
        rooms.forEach((room: any) => {
          if (!roomsByCategory.has(room.category_id)) {
            roomsByCategory.set(room.category_id, []);
          }
          roomsByCategory.get(room.category_id)!.push(room);
        });

        // Calcular métricas agregadas
        let totalRevenue = 0;
        let totalBookings = 0;
        let totalOccupiedRoomNights = 0;
        let totalAvailableRoomNights = 0;
        let totalPickupCount = 0;
        const sevenDaysAgo = format(addDays(new Date(), -7), "yyyy-MM-dd");

        for (const date of dates) {
          const dateStr = format(date, "yyyy-MM-dd");
          
          for (const category of categories) {
            const categoryRooms = roomsByCategory.get(category.id) || [];
            const totalRooms = categoryRooms.length;
            totalAvailableRoomNights += totalRooms;

            // Contar quartos ocupados nesta data
            let occupiedRooms = 0;
            let categoryRevenue = 0;
            let categoryBookings = 0;

            for (const reservation of reservations) {
              const checkin = format(new Date(reservation.checkin_date), "yyyy-MM-dd");
              const checkout = format(new Date(reservation.checkout_date), "yyyy-MM-dd");
              
              // Verificar se a reserva ocupa esta data
              if (dateStr >= checkin && dateStr < checkout) {
                // Verificar se é da categoria
                const isCategoryReservation = 
                  (reservation.room_id && categoryRooms.some((r: any) => r.id === reservation.room_id)) ||
                  (!reservation.room_id && reservation.category_id === category.id);

                if (isCategoryReservation) {
                  occupiedRooms++;
                  categoryRevenue += Number(reservation.paid_amount || reservation.total_amount || 0);
                  categoryBookings++;
                  
                  // Pickup rate: reservas criadas nos últimos 7 dias
                  if (reservation.checkin_date === dateStr && reservation.created_at >= `${sevenDaysAgo}T00:00:00`) {
                    totalPickupCount++;
                  }
                }
              }
            }

            totalOccupiedRoomNights += occupiedRooms;
            totalRevenue += categoryRevenue;
            totalBookings += categoryBookings;
          }
        }

        // Calcular métricas finais
        const adr = totalBookings > 0 ? totalRevenue / totalBookings : 0;
        const revpar = totalAvailableRoomNights > 0 ? totalRevenue / totalAvailableRoomNights : 0;
        const occupancy = totalAvailableRoomNights > 0 ? (totalOccupiedRoomNights / totalAvailableRoomNights) * 100 : 0;
        const pickupRate = dates.length > 0 ? totalPickupCount / (dates.length * 7) : 0; // Reservas por dia

        return {
          adr: Math.round(adr * 100) / 100,
          revpar: Math.round(revpar * 100) / 100,
          occupancy: Math.round(occupancy * 100) / 100,
          projectedOccupancy: Math.round(occupancy * 100) / 100, // Por enquanto igual
          pickupRate: Math.round(pickupRate * 100) / 100,
          revenue: Math.round(totalRevenue * 100) / 100,
          bookings: totalBookings,
        };
      } catch (err) {
        console.error("Erro ao calcular métricas agregadas:", err);
        return {
          adr: 0,
          revpar: 0,
          occupancy: 0,
          projectedOccupancy: 0,
          pickupRate: 0,
          revenue: 0,
          bookings: 0,
        };
      }
    },
    enabled: categories.length > 0 && !!selectedPlan && dates.length > 0,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Valores padrão enquanto carrega
  const metrics = displayMetrics || {
    adr: 0,
    revpar: 0,
    occupancy: 0,
    projectedOccupancy: 0,
    pickupRate: 0,
    revenue: 0,
    bookings: 0,
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    console.error("Erro ao carregar métricas:", error);
    // Continuar mostrando valores padrão mesmo com erro
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">ADR Médio</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(metrics.adr)}
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {metrics.bookings > 0 ? `${metrics.bookings} reservas` : "Sem dados"}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">RevPAR</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(metrics.revpar)}
            </div>
          </div>
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Receita por quarto disponível
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Ocupação</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {metrics.occupancy.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Proj: {metrics.projectedOccupancy.toFixed(1)}%
            </div>
          </div>
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">Ocupação atual vs. projetada</div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Pickup Rate</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {metrics.pickupRate.toFixed(2)}/dia
            </div>
          </div>
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <Activity className="w-6 h-6 text-orange-600" />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">Velocidade de reservas (últimos 7 dias)</div>
      </Card>
    </div>
  );
};

