import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const useDashboard = () => {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Faturamento hoje
  const todayRevenueQuery = useQuery({
    queryKey: ["dashboard_today_revenue"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", `${today}T00:00:00`)
        .lte("payment_date", `${today}T23:59:59`);
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data: payments, error } = await query;

      if (error) throw error;
      const todayTotal = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Faturamento ontem para comparação
      let yesterdayQuery = supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", `${yesterdayStr}T00:00:00`)
        .lte("payment_date", `${yesterdayStr}T23:59:59`);
      
      if (establishmentId) {
        yesterdayQuery = yesterdayQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: yesterdayPayments } = await yesterdayQuery;

      const yesterdayTotal = yesterdayPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
      const change = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : 0;

      return { total: todayTotal, change };
    },
  });

  // Taxa de ocupação
  const occupancyQuery = useQuery({
    queryKey: ["dashboard_occupancy"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      // Total de quartos
      let roomsQuery = supabase.from("rooms").select("id");
      
      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: allRooms, error: roomsError } = await roomsQuery;

      if (roomsError) throw roomsError;
      const totalRooms = allRooms?.length || 0;

      // Quartos ocupados hoje
      let reservationsQuery = supabase
        .from("reservations")
        .select("room_id, status, checkout_date")
        .lte("checkin_date", today)
        .in("status", ["confirmed"]);
      
      if (establishmentId) {
        reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: occupiedRooms, error: occupiedError } = await reservationsQuery;

      if (occupiedError) throw occupiedError;

      // Filtrar no código para garantir que checkout_date >= today
      // E incluir também checkedin se existir nos dados
      const activeReservations = occupiedRooms?.filter(
        (reservation) => 
          reservation.checkout_date >= today &&
          (reservation.status === "confirmed" || reservation.status === "checkedin")
      ) || [];

      const occupiedCount = new Set(activeReservations.map((r) => r.room_id).filter(Boolean)).size;
      const occupancyRate = totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0;

      return { rate: occupancyRate, occupied: occupiedCount, total: totalRooms };
    },
  });

  // Check-ins hoje
  const checkinsQuery = useQuery({
    queryKey: ["dashboard_checkins"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase
        .from("reservations")
        .select("id, status")
        .eq("checkin_date", today)
        .in("status", ["pending", "confirmed"]);
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data: checkins, error } = await query;

      if (error) throw error;
      const total = checkins?.length || 0;
      const pending = checkins?.filter((r) => r.status === "pending").length || 0;

      return { total, pending };
    },
  });

  // RevPAR (Revenue per Available Room)
  const revparQuery = useQuery({
    queryKey: ["dashboard_revpar"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const establishmentId = getSelectedEstablishmentId();
      // Receita do mês
      let paymentsQuery = supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", startOfMonth.toISOString().split("T")[0])
        .lte("payment_date", endOfMonth.toISOString().split("T")[0]);
      
      if (establishmentId) {
        paymentsQuery = paymentsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: payments, error: paymentsError } = await paymentsQuery;

      if (paymentsError) throw paymentsError;
      const revenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Total de quartos
      let roomsQuery = supabase.from("rooms").select("id");
      
      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: rooms, error: roomsError } = await roomsQuery;

      if (roomsError) throw roomsError;
      const totalRooms = rooms?.length || 0;

      // Dias no mês
      const daysInMonth = endOfMonth.getDate();

      // RevPAR = Receita / (Quartos * Dias)
      const revpar = totalRooms > 0 && daysInMonth > 0 ? revenue / (totalRooms * daysInMonth) : 0;

      // RevPAR do mês anterior para comparação
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      let prevPaymentsQuery = supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", prevMonthStart.toISOString().split("T")[0])
        .lte("payment_date", prevMonthEnd.toISOString().split("T")[0]);
      
      if (establishmentId) {
        prevPaymentsQuery = prevPaymentsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: prevPayments } = await prevPaymentsQuery;

      const prevRevenue = prevPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
      const prevDays = prevMonthEnd.getDate();
      const prevRevpar = totalRooms > 0 && prevDays > 0 ? prevRevenue / (totalRooms * prevDays) : 0;
      const change = prevRevpar > 0 ? ((revpar - prevRevpar) / prevRevpar) * 100 : 0;

      return { value: revpar, change };
    },
  });

  // Ocupação dos últimos 30 dias
  const occupancyHistoryQuery = useQuery({
    queryKey: ["dashboard_occupancy_history"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let roomsQuery = supabase.from("rooms").select("id");
      
      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: rooms, error: roomsError } = await roomsQuery;

      if (roomsError) throw roomsError;
      const totalRooms = rooms?.length || 0;

      if (totalRooms === 0) return [];

      const data = [];
      const today = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        let reservationsQuery = supabase
          .from("reservations")
          .select("room_id, status, checkout_date")
          .lte("checkin_date", dateStr)
          .in("status", ["confirmed"]);
        
        if (establishmentId) {
          reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
        }
        
        const { data: reservations } = await reservationsQuery;

        // Filtrar no código para garantir que checkout_date >= dateStr
        // E incluir também checkedin se existir nos dados
        const activeReservations = reservations?.filter(
          (reservation) => 
            reservation.checkout_date >= dateStr &&
            (reservation.status === "confirmed" || reservation.status === "checkedin")
        ) || [];

        const occupied = new Set(activeReservations.map((r) => r.room_id).filter(Boolean)).size;
        const occupancy = (occupied / totalRooms) * 100;

        data.push({
          date: date.getDate().toString().padStart(2, "0"),
          occupancy: Math.round(occupancy),
        });
      }

      return data;
    },
  });

  // Faturamento dos últimos 30 dias
  const revenueHistoryQuery = useQuery({
    queryKey: ["dashboard_revenue_history"],
    queryFn: async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);

      const establishmentId = getSelectedEstablishmentId();
      let query = supabase
        .from("payments")
        .select("amount, payment_date")
        .gte("payment_date", startDate.toISOString().split("T")[0])
        .order("payment_date", { ascending: true });
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data: payments, error } = await query;

      if (error) throw error;

      // Agrupar por dia
      const byDay: Record<string, number> = {};
      payments?.forEach((payment) => {
        const date = new Date(payment.payment_date);
        const day = date.getDate().toString().padStart(2, "0");
        byDay[day] = (byDay[day] || 0) + Number(payment.amount || 0);
      });

      // Preencher todos os dias dos últimos 30 dias
      const data = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const day = date.getDate().toString().padStart(2, "0");
        data.push({
          date: day,
          revenue: byDay[day] || 0,
        });
      }

      return data;
    },
  });

  // Alertas
  const alertsQuery = useQuery({
    queryKey: ["dashboard_alerts"],
    queryFn: async () => {
      const alerts = [];

      const establishmentId = getSelectedEstablishmentId();
      // Reservas não pagas vencidas
      let unpaidQuery = supabase
        .from("reservations")
        .select("id")
        .lt("checkin_date", today)
        .in("status", ["pending", "confirmed"])
        .eq("payment_status", "pending");
      
      if (establishmentId) {
        unpaidQuery = unpaidQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: unpaidReservations } = await unpaidQuery;

      if (unpaidReservations && unpaidReservations.length > 0) {
        alerts.push({
          type: "warning",
          message: `${unpaidReservations.length} reserva(s) não paga(s) vencida(s)`,
          description: "Requer ação imediata",
        });
      }

      // Quartos em manutenção
      let maintenanceQuery = supabase
        .from("maintenance_tickets")
        .select("id")
        .in("status", ["open", "in_progress"]);
      
      if (establishmentId) {
        maintenanceQuery = maintenanceQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: maintenanceRooms } = await maintenanceQuery;

      if (maintenanceRooms && maintenanceRooms.length > 0) {
        alerts.push({
          type: "maintenance",
          message: `${maintenanceRooms.length} quarto(s) em manutenção`,
          description: "Verificar status",
        });
      }

      // Sistema funcionando
      alerts.push({
        type: "success",
        message: "Sistema funcionando normalmente",
        description: "Última sincronização: agora",
      });

      return alerts;
    },
  });

  return {
    todayRevenue: todayRevenueQuery.data,
    occupancy: occupancyQuery.data,
    checkins: checkinsQuery.data,
    revpar: revparQuery.data,
    occupancyHistory: occupancyHistoryQuery.data || [],
    revenueHistory: revenueHistoryQuery.data || [],
    alerts: alertsQuery.data || [],
    isLoading:
      todayRevenueQuery.isLoading ||
      occupancyQuery.isLoading ||
      checkinsQuery.isLoading ||
      revparQuery.isLoading ||
      occupancyHistoryQuery.isLoading ||
      revenueHistoryQuery.isLoading ||
      alertsQuery.isLoading,
  };
};

