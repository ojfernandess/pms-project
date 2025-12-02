import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, startOfDay, subDays, addDays, isSameDay } from "date-fns";

export interface RateMetrics {
  date: string;
  categoryId: string;
  pricingPlanId?: string;
  adr: number; // Average Daily Rate
  revpar: number; // Revenue Per Available Room
  occupancy: number; // Occupancy percentage
  projectedOccupancy: number; // Projected occupancy
  pickupRate: number; // Booking velocity (reservations per day)
  totalRooms: number;
  occupiedRooms: number;
  revenue: number;
  bookingsCount: number;
  cancellationsCount: number;
}

export interface DemandHistory {
  date: string;
  categoryId: string;
  bookingsCount: number;
  cancellationsCount: number;
  revenue: number;
  averageRate: number;
}

export const useRateMetrics = () => {
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Calcular ocupação atual e projetada seguindo a lógica do PMS
  // Lógica: checkin_date <= date < checkout_date (check-in inclusivo, check-out exclusivo)
  const calculateOccupancy = async (
    categoryId: string,
    date: Date
  ): Promise<{ current: number; projected: number; totalRooms: number; occupiedRooms: number }> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return { current: 0, projected: 0, totalRooms: 0, occupiedRooms: 0 };

    const dateStr = format(date, "yyyy-MM-dd");

    // Buscar todos os quartos da categoria
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("category_id", categoryId);
    
    if (roomsError) {
      console.error("Erro ao buscar quartos:", roomsError);
      return { current: 0, projected: 0, totalRooms: 0, occupiedRooms: 0 };
    }

    const totalRooms = rooms?.length || 0;
    
    if (totalRooms === 0) {
      return { current: 0, projected: 0, totalRooms: 0, occupiedRooms: 0 };
    }

    // Buscar todas as reservas que podem ocupar esta data
    // Lógica do PMS: checkin_date <= date < checkout_date
    const { data: allReservations } = await supabase
      .from("reservations")
      .select("id, checkin_date, checkout_date, status, room_id, category_id")
      .eq("establishment_id", establishmentId)
      .neq("status", "cancelled")
      .lte("checkin_date", dateStr)
      .gt("checkout_date", dateStr);

    if (!allReservations) {
      return { current: 0, projected: 0, totalRooms, occupiedRooms: 0 };
    }

    const roomIds = new Set(rooms.map((r: any) => r.id));

    // Verificar quarto por quarto se está ocupado (seguindo lógica do PMS)
    let occupiedRooms = 0;
    for (const room of rooms) {
      // Verificar se há alguma reserva ocupando este quarto nesta data
      const isOccupied = allReservations.some((r: any) => {
        // Se a reserva tem room_id, verificar se é este quarto
        if (r.room_id && r.room_id === room.id) {
          const checkin = format(new Date(r.checkin_date), "yyyy-MM-dd");
          const checkout = format(new Date(r.checkout_date), "yyyy-MM-dd");
          // Check-in INCLUSIVO (>=), Check-out EXCLUSIVO (<)
          // Se a data é exatamente o checkout, NÃO está ocupada
          if (dateStr === checkout) return false;
          return dateStr >= checkin && dateStr < checkout;
        }
        // Se não tem room_id, verificar pela category_id
        if (!r.room_id && r.category_id === categoryId) {
          const checkin = format(new Date(r.checkin_date), "yyyy-MM-dd");
          const checkout = format(new Date(r.checkout_date), "yyyy-MM-dd");
          if (dateStr === checkout) return false;
          return dateStr >= checkin && dateStr < checkout;
        }
        return false;
      });

      if (isOccupied) {
        occupiedRooms++;
      }
    }

    const currentOccupancy = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    
    // Ocupação projetada é a mesma que a atual (já consideramos todas as reservas futuras)
    // A diferença seria considerar reservas que ainda não foram confirmadas, mas por enquanto
    // usamos a mesma lógica
    const projectedOccupancy = currentOccupancy;

    return {
      current: Math.round(currentOccupancy * 100) / 100,
      projected: Math.round(projectedOccupancy * 100) / 100,
      totalRooms,
      occupiedRooms,
    };
  };

  // Calcular velocidade de reservas (pickup rate)
  const calculatePickupRate = async (
    categoryId: string,
    date: Date,
    daysBack: number = 7
  ): Promise<number> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return 0;

    const dateStr = format(date, "yyyy-MM-dd");
    const startDate = format(subDays(date, daysBack), "yyyy-MM-dd");

    // Buscar reservas criadas nos últimos N dias para esta data
    const { data: reservations } = await supabase
      .from("reservations")
      .select("id, created_at, checkin_date")
      .eq("establishment_id", establishmentId)
      .eq("category_id", categoryId)
      .eq("checkin_date", dateStr)
      .neq("status", "cancelled")
      .gte("created_at", `${startDate}T00:00:00`);

    const bookingsCount = reservations?.length || 0;
    return bookingsCount / daysBack; // Reservas por dia
  };

  // Buscar histórico de demanda
  const getDemandHistory = async (
    categoryId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DemandHistory[]> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return [];

    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");

    // Buscar reservas do período histórico (último ano)
    const historicalStart = format(subDays(startDate, 365), "yyyy-MM-dd");
    const historicalEnd = format(subDays(startDate, 1), "yyyy-MM-dd");

    const { data: reservations } = await supabase
      .from("reservations")
      .select("id, checkin_date, total_amount, paid_amount, status, created_at")
      .eq("establishment_id", establishmentId)
      .eq("category_id", categoryId)
      .gte("checkin_date", historicalStart)
      .lte("checkin_date", historicalEnd);

    if (!reservations) return [];

    // Agrupar por data
    const historyMap = new Map<string, DemandHistory>();

    reservations.forEach((reservation: any) => {
      const dateStr = reservation.checkin_date;
      if (!historyMap.has(dateStr)) {
        historyMap.set(dateStr, {
          date: dateStr,
          categoryId,
          bookingsCount: 0,
          cancellationsCount: 0,
          revenue: 0,
          averageRate: 0,
        });
      }

      const entry = historyMap.get(dateStr)!;
      if (reservation.status === "cancelled") {
        entry.cancellationsCount++;
      } else {
        entry.bookingsCount++;
        entry.revenue += Number(reservation.paid_amount || reservation.total_amount || 0);
      }
    });

    // Calcular média de tarifa
    Array.from(historyMap.values()).forEach(entry => {
      if (entry.bookingsCount > 0) {
        entry.averageRate = entry.revenue / entry.bookingsCount;
      }
    });

    return Array.from(historyMap.values());
  };

  // Calcular métricas completas para uma data/categoria
  const getMetricsForDate = async (
    categoryId: string,
    date: Date,
    pricingPlanId?: string
  ): Promise<RateMetrics> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) {
      return {
        date: format(date, "yyyy-MM-dd"),
        categoryId,
        pricingPlanId,
        adr: 0,
        revpar: 0,
        occupancy: 0,
        projectedOccupancy: 0,
        pickupRate: 0,
        totalRooms: 0,
        occupiedRooms: 0,
        revenue: 0,
        bookingsCount: 0,
        cancellationsCount: 0,
      };
    }

    const dateStr = format(date, "yyyy-MM-dd");

    // Calcular ocupação
    const occupancyData = await calculateOccupancy(categoryId, date);

    // Calcular pickup rate
    const pickupRate = await calculatePickupRate(categoryId, date);

    // Buscar reservas para calcular ADR e receita seguindo a lógica do PMS
    // Receita = paid_amount (valor pago) quando disponível, senão total_amount
    // Considerar apenas reservas que ocupam quartos desta categoria nesta data
    const { data: allReservations } = await supabase
      .from("reservations")
      .select(`
        id, 
        total_amount, 
        paid_amount, 
        status, 
        room_id, 
        category_id,
        checkin_date,
        checkout_date,
        reservation_service_fees(amount, quantity)
      `)
      .eq("establishment_id", establishmentId)
      .neq("status", "cancelled")
      .lte("checkin_date", dateStr)
      .gt("checkout_date", dateStr);

    if (!allReservations) {
      return {
        date: dateStr,
        categoryId,
        pricingPlanId,
        adr: 0,
        revpar: 0,
        occupancy: occupancyData.current,
        projectedOccupancy: occupancyData.projected,
        pickupRate: Math.round(pickupRate * 100) / 100,
        totalRooms: occupancyData.totalRooms,
        occupiedRooms: occupancyData.occupiedRooms,
        revenue: 0,
        bookingsCount: 0,
        cancellationsCount: 0,
      };
    }

    // Buscar quartos da categoria
    const { data: categoryRoomsForRevenue } = await supabase
      .from("rooms")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("category_id", categoryId);

    const categoryRoomIdsForRevenue = new Set(categoryRoomsForRevenue?.map((r: any) => r.id) || []);

    // Filtrar reservas que ocupam quartos desta categoria nesta data específica
    const validReservations = allReservations.filter((r: any) => {
      const checkin = format(new Date(r.checkin_date), "yyyy-MM-dd");
      const checkout = format(new Date(r.checkout_date), "yyyy-MM-dd");
      
      // Verificar se a reserva ocupa esta data (check-in inclusivo, check-out exclusivo)
      if (dateStr === checkout) return false;
      if (!(dateStr >= checkin && dateStr < checkout)) return false;

      // Verificar se a reserva é da categoria
      if (r.room_id) {
        return categoryRoomIdsForRevenue.has(r.room_id);
      }
      return r.category_id === categoryId;
    });

    // Calcular receita: usar paid_amount quando disponível (lógica do PMS)
    // Se não houver paid_amount, usar total_amount
    const bookingsCount = validReservations.length;
    const revenue = validReservations.reduce((sum, r: any) => {
      const paidAmount = Number(r.paid_amount || 0);
      const totalAmount = Number(r.total_amount || 0);
      // Usar paid_amount se disponível, senão total_amount
      return sum + (paidAmount > 0 ? paidAmount : totalAmount);
    }, 0);

    // ADR = Average Daily Rate = Receita total / Número de reservas
    const adr = bookingsCount > 0 ? revenue / bookingsCount : 0;
    
    // RevPAR = Revenue Per Available Room = Receita total / Total de quartos disponíveis
    const revpar = occupancyData.totalRooms > 0 ? (revenue / occupancyData.totalRooms) : 0;

    // Buscar cancelamentos
    const { data: cancellations } = await supabase
      .from("reservations")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("category_id", categoryId)
      .eq("checkin_date", dateStr)
      .eq("status", "cancelled");

    return {
      date: dateStr,
      categoryId,
      pricingPlanId,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      occupancy: occupancyData.current,
      projectedOccupancy: occupancyData.projected,
      pickupRate: Math.round(pickupRate * 100) / 100,
      totalRooms: occupancyData.totalRooms,
      occupiedRooms: occupancyData.occupiedRooms,
      revenue: Math.round(revenue * 100) / 100,
      bookingsCount,
      cancellationsCount: cancellations?.length || 0,
    };
  };

  // Buscar métricas para um período
  const getMetricsForPeriod = useQuery({
    queryKey: ["rate_metrics", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      // Buscar todas as categorias
      const { data: categories } = await supabase
        .from("room_categories")
        .select("id")
        .eq("establishment_id", establishmentId);

      if (!categories || categories.length === 0) return [];

      // Calcular métricas para os próximos 90 dias
      const today = startOfDay(new Date());
      const endDate = addDays(today, 90);
      const dates = [];
      for (let d = today; d <= endDate; d = addDays(d, 1)) {
        dates.push(d);
      }

      const metrics: RateMetrics[] = [];
      for (const category of categories) {
        for (const date of dates) {
          const metric = await getMetricsForDate(category.id, date);
          metrics.push(metric);
        }
      }

      return metrics;
    },
    enabled: !!selectedEstablishment?.id,
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  return {
    calculateOccupancy,
    calculatePickupRate,
    getDemandHistory,
    getMetricsForDate,
    getMetricsForPeriod: getMetricsForPeriod.data || [],
    isLoadingMetrics: getMetricsForPeriod.isLoading,
  };
};

