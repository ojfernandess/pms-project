import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export interface OwnerDashboardData {
  // Faturamento
  revenue: {
    today: number;
    month: number;
    year: number;
    change: number; // % vs mês anterior
  };
  
  // Reservas
  reservations: {
    total: number;
    confirmed: number;
    pending: number;
    today: number;
    thisMonth: number;
  };
  
  // Cancelamentos
  cancellations: {
    today: number;
    thisMonth: number;
    thisYear: number;
    revenueLost: number; // Receita perdida com cancelamentos
    recent: Array<{
      id: string;
      reservation_code: string;
      guest_name: string;
      checkin_date: string;
      total_amount: number;
      cancelled_at: string;
    }>;
  };
  
  // Bloqueios
  blocks: {
    active: number;
    thisMonth: number;
    recent: Array<{
      id: string;
      room_number: string;
      checkin_date: string;
      checkout_date: string;
      reason: string;
    }>;
  };
  
  // Manutenção
  maintenance: {
    open: number;
    inProgress: number;
    urgent: number;
    completed: number;
    recent: Array<{
      id: string;
      title: string;
      room_number: string;
      priority: string;
      status: string;
      opened_at: string;
    }>;
  };
  
  // Ocupação
  occupancy: {
    rate: number;
    occupied: number;
    available: number;
    total: number;
  };
  
  // Gráficos
  revenueHistory: Array<{ date: string; revenue: number }>;
  occupancyHistory: Array<{ date: string; occupancy: number }>;
  cancellationsHistory: Array<{ date: string; count: number; revenue: number }>;
}

export const useOwnerDashboard = () => {
  const { selectedEstablishment } = useEstablishment();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Query principal que busca todos os dados
  const dashboardQuery = useQuery({
    queryKey: ["owner_dashboard", selectedEstablishment?.id, today],
    queryFn: async (): Promise<OwnerDashboardData> => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) {
        throw new Error("Estabelecimento não selecionado");
      }

      // 1. FATURAMENTO
      // Faturamento hoje
      const { data: todayPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("establishment_id", establishmentId)
        .gte("payment_date", `${today}T00:00:00`)
        .lte("payment_date", `${today}T23:59:59`);
      
      const todayRevenue = todayPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Faturamento do mês
      const { data: monthPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("establishment_id", establishmentId)
        .gte("payment_date", startOfMonth.toISOString().split("T")[0])
        .lte("payment_date", endOfMonth.toISOString().split("T")[0]);
      
      const monthRevenue = monthPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Faturamento do ano
      const { data: yearPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("establishment_id", establishmentId)
        .gte("payment_date", startOfYear.toISOString().split("T")[0])
        .lte("payment_date", endOfMonth.toISOString().split("T")[0]);
      
      const yearRevenue = yearPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Faturamento mês anterior (para comparação)
      const { data: prevMonthPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("establishment_id", establishmentId)
        .gte("payment_date", prevMonthStart.toISOString().split("T")[0])
        .lte("payment_date", prevMonthEnd.toISOString().split("T")[0]);
      
      const prevMonthRevenue = prevMonthPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
      const revenueChange = prevMonthRevenue > 0 ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;

      // 2. RESERVAS
      const { data: allReservations } = await supabase
        .from("reservations")
        .select("id, status, checkin_date, total_amount, paid_amount")
        .eq("establishment_id", establishmentId)
        .neq("status", "cancelled");

      const confirmed = allReservations?.filter((r: any) => {
        const paid = Number(r.paid_amount || 0);
        const total = Number(r.total_amount || 0);
        return paid >= total && total > 0;
      }).length || 0;

      const pending = allReservations?.filter((r: any) => {
        const paid = Number(r.paid_amount || 0);
        const total = Number(r.total_amount || 0);
        return paid < total && paid > 0;
      }).length || 0;

      const todayReservations = allReservations?.filter((r: any) => r.checkin_date === today).length || 0;
      const monthReservations = allReservations?.filter((r: any) => 
        r.checkin_date >= startOfMonth.toISOString().split("T")[0] &&
        r.checkin_date <= endOfMonth.toISOString().split("T")[0]
      ).length || 0;

      // 3. CANCELAMENTOS
      // Buscar todas as reservas canceladas primeiro
      const { data: allCancelled } = await supabase
        .from("reservations")
        .select("id, total_amount, cancelled_at, updated_at")
        .eq("establishment_id", establishmentId)
        .eq("status", "cancelled");

      // Filtrar por data no código (caso cancelled_at seja null, usar updated_at)
      const cancelledToday = (allCancelled || []).filter((r: any) => {
        const cancelledDate = r.cancelled_at || r.updated_at;
        if (!cancelledDate) return false;
        const dateStr = cancelledDate.split("T")[0];
        return dateStr === today;
      });

      const cancelledMonth = (allCancelled || []).filter((r: any) => {
        const cancelledDate = r.cancelled_at || r.updated_at;
        if (!cancelledDate) return false;
        const dateStr = cancelledDate.split("T")[0];
        return dateStr >= startOfMonth.toISOString().split("T")[0] &&
               dateStr <= endOfMonth.toISOString().split("T")[0];
      });

      const cancelledYear = (allCancelled || []).filter((r: any) => {
        const cancelledDate = r.cancelled_at || r.updated_at;
        if (!cancelledDate) return false;
        const dateStr = cancelledDate.split("T")[0];
        return dateStr >= startOfYear.toISOString().split("T")[0] &&
               dateStr <= endOfMonth.toISOString().split("T")[0];
      });

      const revenueLost = cancelledMonth?.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0;

      // Cancelamentos recentes (últimos 10)
      const { data: recentCancellations } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          total_amount,
          cancelled_at,
          updated_at,
          guest:clients!guest_id(full_name)
        `)
        .eq("establishment_id", establishmentId)
        .eq("status", "cancelled")
        .order("cancelled_at", { ascending: false, nullsFirst: false })
        .limit(10);

      const cancellationsRecent = (recentCancellations || [])
        .sort((a: any, b: any) => {
          const dateA = a.cancelled_at || a.updated_at || "";
          const dateB = b.cancelled_at || b.updated_at || "";
          return dateB.localeCompare(dateA);
        })
        .slice(0, 10)
        .map((r: any) => ({
          id: r.id,
          reservation_code: r.reservation_code || "",
          guest_name: r.guest?.full_name || "N/A",
          checkin_date: r.checkin_date,
          total_amount: Number(r.total_amount || 0),
          cancelled_at: r.cancelled_at || r.updated_at,
        }));

      // 4. BLOQUEIOS
      const { data: activeBlocks } = await supabase
        .from("reservations")
        .select("id")
        .eq("establishment_id", establishmentId)
        .eq("status", "blocked")
        .gte("checkout_date", today);

      const { data: monthBlocks } = await supabase
        .from("reservations")
        .select("id")
        .eq("establishment_id", establishmentId)
        .eq("status", "blocked")
        .gte("checkin_date", startOfMonth.toISOString().split("T")[0])
        .lte("checkin_date", endOfMonth.toISOString().split("T")[0]);

      // Bloqueios recentes
      const { data: recentBlocks } = await supabase
        .from("reservations")
        .select(`
          id,
          checkin_date,
          checkout_date,
          notes,
          rooms(room_number)
        `)
        .eq("establishment_id", establishmentId)
        .eq("status", "blocked")
        .order("created_at", { ascending: false })
        .limit(10);

      const blocksRecent = (recentBlocks || []).map((r: any) => ({
        id: r.id,
        room_number: r.rooms?.room_number || "N/A",
        checkin_date: r.checkin_date,
        checkout_date: r.checkout_date,
        reason: r.notes?.replace(/^Bloqueio:\s*/i, "") || "Sem motivo",
      }));

      // 5. MANUTENÇÃO
      const { data: maintenanceTickets } = await supabase
        .from("maintenance_tickets")
        .select(`
          id,
          title,
          priority,
          status,
          opened_at,
          rooms(room_number)
        `)
        .eq("establishment_id", establishmentId);

      const open = maintenanceTickets?.filter((t: any) => t.status === "open").length || 0;
      const inProgress = maintenanceTickets?.filter((t: any) => t.status === "in_progress").length || 0;
      const urgent = maintenanceTickets?.filter((t: any) => t.priority === "urgent" && t.status !== "completed").length || 0;
      const completed = maintenanceTickets?.filter((t: any) => t.status === "completed").length || 0;

      const maintenanceRecent = (maintenanceTickets || [])
        .filter((t: any) => t.status !== "completed")
        .sort((a: any, b: any) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        .slice(0, 10)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          room_number: t.rooms?.room_number || "N/A",
          priority: t.priority,
          status: t.status,
          opened_at: t.opened_at,
        }));

      // 6. OCUPAÇÃO
      const { data: allRooms } = await supabase
        .from("rooms")
        .select("id")
        .eq("establishment_id", establishmentId);

      const totalRooms = allRooms?.length || 0;

      const { data: occupiedRooms } = await supabase
        .from("reservations")
        .select("room_id")
        .eq("establishment_id", establishmentId)
        .lte("checkin_date", today)
        .gte("checkout_date", today)
        .in("status", ["confirmed", "checkedin"]);

      const occupiedCount = new Set(occupiedRooms?.map((r) => r.room_id).filter(Boolean)).size;
      const occupancyRate = totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0;

      // 7. HISTÓRICO DE FATURAMENTO (últimos 30 dias)
      const revenueHistory = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const { data: dayPayments } = await supabase
          .from("payments")
          .select("amount")
          .eq("establishment_id", establishmentId)
          .gte("payment_date", `${dateStr}T00:00:00`)
          .lte("payment_date", `${dateStr}T23:59:59`);

        const dayRevenue = dayPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
        revenueHistory.push({
          date: date.getDate().toString().padStart(2, "0"),
          revenue: dayRevenue,
        });
      }

      // 8. HISTÓRICO DE OCUPAÇÃO (últimos 30 dias)
      const occupancyHistory = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const { data: dayReservations } = await supabase
          .from("reservations")
          .select("room_id")
          .eq("establishment_id", establishmentId)
          .lte("checkin_date", dateStr)
          .gte("checkout_date", dateStr)
          .in("status", ["confirmed", "checkedin"]);

        const dayOccupied = new Set(dayReservations?.map((r) => r.room_id).filter(Boolean)).size;
        const dayOccupancy = totalRooms > 0 ? (dayOccupied / totalRooms) * 100 : 0;
        occupancyHistory.push({
          date: date.getDate().toString().padStart(2, "0"),
          occupancy: Math.round(dayOccupancy),
        });
      }

      // 9. HISTÓRICO DE CANCELAMENTOS (últimos 30 dias)
      const cancellationsHistory = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        // Filtrar cancelamentos do dia usando os dados já buscados
        const dayCancellations = (allCancelled || []).filter((r: any) => {
          const cancelledDate = r.cancelled_at || r.updated_at;
          if (!cancelledDate) return false;
          return cancelledDate.split("T")[0] === dateStr;
        });

        const dayCount = dayCancellations.length;
        const dayRevenue = dayCancellations.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
        cancellationsHistory.push({
          date: date.getDate().toString().padStart(2, "0"),
          count: dayCount,
          revenue: dayRevenue,
        });
      }

      return {
        revenue: {
          today: todayRevenue,
          month: monthRevenue,
          year: yearRevenue,
          change: revenueChange,
        },
        reservations: {
          total: allReservations?.length || 0,
          confirmed,
          pending,
          today: todayReservations,
          thisMonth: monthReservations,
        },
        cancellations: {
          today: cancelledToday?.length || 0,
          thisMonth: cancelledMonth?.length || 0,
          thisYear: cancelledYear?.length || 0,
          revenueLost,
          recent: cancellationsRecent,
        },
        blocks: {
          active: activeBlocks?.length || 0,
          thisMonth: monthBlocks?.length || 0,
          recent: blocksRecent,
        },
        maintenance: {
          open,
          inProgress,
          urgent,
          completed,
          recent: maintenanceRecent,
        },
        occupancy: {
          rate: Math.round(occupancyRate),
          occupied: occupiedCount,
          available: totalRooms - occupiedCount,
          total: totalRooms,
        },
        revenueHistory,
        occupancyHistory,
        cancellationsHistory,
      };
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  return {
    data: dashboardQuery.data,
    isLoading: dashboardQuery.isLoading,
    error: dashboardQuery.error,
    refetch: dashboardQuery.refetch,
  };
};

