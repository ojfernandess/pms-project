import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";

export interface FinancialPeriod {
  startDate: string;
  endDate: string;
}

export const useFinancialReports = (period?: FinancialPeriod) => {
  const { selectedEstablishment } = useEstablishment();
  
  // Período padrão: mês atual
  const getDefaultPeriod = (): FinancialPeriod => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  };

  const currentPeriod = period || getDefaultPeriod();
  
  // Obter establishmentId do contexto ou localStorage
  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      // Sincronizar com localStorage
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Faturamento total no período (excluindo canceladas)
  const revenueQuery = useQuery({
    queryKey: ["financial_revenue", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      // Buscar todas as reservas no período, exceto canceladas
      let query = supabase
        .from("reservations")
        .select("total_amount, checkin_date, checkout_date, status, paid_amount")
        .gte("checkin_date", currentPeriod.startDate)
        .lte("checkin_date", currentPeriod.endDate)
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Erro na query de faturamento:", error);
        throw error;
      }

      // Filtrar apenas status válidos (não canceladas)
      const validStatuses = ["confirmed", "checkedin", "checkedout", "pending", "preregistration", "blocked"];
      const filteredData = data?.filter((r: any) => validStatuses.includes(r.status)) || [];

      // Calcular faturamento total (soma de total_amount das reservas válidas)
      const total = filteredData.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0;
      
      return { total, count: filteredData.length || 0 };
    },
  });

  // Recebimentos (pagamentos) - apenas de reservas não canceladas
  const paymentsQuery = useQuery({
    queryKey: ["financial_payments", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      
      // Buscar pagamentos do período com join nas reservas para filtrar canceladas
      let query = supabase
        .from("payments")
        .select(`
          amount, 
          payment_method, 
          payment_date,
          reservation_id,
          reservations!inner(status)
        `)
        .gte("payment_date", `${currentPeriod.startDate}T00:00:00`)
        .lte("payment_date", `${currentPeriod.endDate}T23:59:59`)
        .neq("reservations.status", "cancelled"); // Excluir pagamentos de reservas canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data: payments, error } = await query;

      if (error) {
        console.error("Erro na query de pagamentos:", error);
        // Se der erro no join, fazer query simples e filtrar depois
        let simpleQuery = supabase
          .from("payments")
          .select("amount, payment_method, payment_date, reservation_id")
          .gte("payment_date", `${currentPeriod.startDate}T00:00:00`)
          .lte("payment_date", `${currentPeriod.endDate}T23:59:59`);
        
        if (establishmentId) {
          simpleQuery = simpleQuery.eq("establishment_id", establishmentId);
        }
        
        const { data: allPayments, error: simpleError } = await simpleQuery;
        if (simpleError) throw simpleError;
        
        // Buscar status das reservas
        const reservationIds = [...new Set(allPayments?.map(p => p.reservation_id).filter(Boolean) || [])];
        if (reservationIds.length > 0) {
          const { data: reservations } = await supabase
            .from("reservations")
            .select("id, status")
            .in("id", reservationIds);
          
          const cancelledIds = new Set(
            reservations?.filter(r => r.status === "cancelled").map(r => r.id) || []
          );
          
          // Filtrar pagamentos de reservas canceladas
          const validPayments = allPayments?.filter(p => 
            !p.reservation_id || !cancelledIds.has(p.reservation_id)
          ) || [];
          
          const total = validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
          const byMethod = validPayments.reduce((acc: Record<string, number>, p) => {
            const method = p.payment_method || "outro";
            acc[method] = (acc[method] || 0) + Number(p.amount || 0);
            return acc;
          }, {}) || {};
          
          return { total, count: validPayments.length || 0, byMethod };
        }
        
        return { total: 0, count: 0, byMethod: {} };
      }

      // Filtrar pagamentos válidos (reservas não canceladas)
      const validPayments = payments?.filter((p: any) => {
        const reservation = Array.isArray(p.reservations) ? p.reservations[0] : p.reservations;
        return reservation && reservation.status !== "cancelled";
      }) || [];

      const total = validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
      
      // Agrupar por método de pagamento
      const byMethod = validPayments.reduce((acc: Record<string, number>, p) => {
        const method = p.payment_method || "outro";
        acc[method] = (acc[method] || 0) + Number(p.amount || 0);
        return acc;
      }, {}) || {};

      return { total, count: validPayments.length || 0, byMethod };
    },
  });

  // A receber (reservas não canceladas sem pagamento completo)
  const pendingQuery = useQuery({
    queryKey: ["financial_pending", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      // Buscar todas as reservas no período, exceto canceladas
      let query = supabase
        .from("reservations")
        .select("total_amount, paid_amount, status, checkin_date, checkout_date")
        .gte("checkin_date", currentPeriod.startDate)
        .lte("checkout_date", currentPeriod.endDate)
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Erro na query de pendentes:", error);
        throw error;
      }

      // Filtrar apenas status válidos (não canceladas)
      const validStatuses = ["pending", "confirmed", "checkedin", "checkedout", "preregistration"];
      const filteredData = data?.filter((r: any) => validStatuses.includes(r.status)) || [];

      // Calcular valor pendente (total_amount - paid_amount) apenas para reservas com saldo pendente
      const total = filteredData.reduce((sum, r) => {
        const totalAmount = Number(r.total_amount || 0);
        const paidAmount = Number(r.paid_amount || 0);
        const pending = totalAmount - paidAmount;
        return sum + (pending > 0 ? pending : 0);
      }, 0) || 0;

      // Contar apenas reservas com saldo pendente
      const count = filteredData.filter(r => {
        const totalAmount = Number(r.total_amount || 0);
        const paidAmount = Number(r.paid_amount || 0);
        return totalAmount - paidAmount > 0;
      }).length || 0;

      return { total, count };
    },
  });

  // Faturamento por dia (excluindo canceladas)
  const dailyRevenueQuery = useQuery({
    queryKey: ["financial_daily_revenue", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      let query = supabase
        .from("reservations")
        .select("total_amount, checkin_date, status")
        .gte("checkin_date", currentPeriod.startDate)
        .lte("checkin_date", currentPeriod.endDate)
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Erro na query de faturamento diário:", error);
        throw error;
      }

      // Filtrar apenas status válidos (não canceladas)
      const validStatuses = ["confirmed", "checkedin", "checkedout", "pending", "preregistration"];
      const filteredData = data?.filter((r: any) => validStatuses.includes(r.status)) || [];

      // Agrupar por dia
      const byDay = filteredData.reduce((acc: Record<string, number>, r) => {
        const day = r.checkin_date;
        acc[day] = (acc[day] || 0) + Number(r.total_amount || 0);
        return acc;
      }, {}) || {};

      // Converter para array ordenado
      const dailyData = Object.entries(byDay)
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return dailyData;
    },
  });

  // Faturamento por canal (OTAs) - excluindo canceladas
  const channelRevenueQuery = useQuery({
    queryKey: ["financial_channel_revenue", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      let query = supabase
        .from("reservations")
        .select("total_amount, channel, status")
        .gte("checkin_date", currentPeriod.startDate)
        .lte("checkin_date", currentPeriod.endDate)
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Erro na query de faturamento por canal:", error);
        throw error;
      }

      // Filtrar apenas status válidos (não canceladas)
      const validStatuses = ["confirmed", "checkedin", "checkedout", "pending", "preregistration"];
      const filteredData = data?.filter((r: any) => validStatuses.includes(r.status)) || [];

      const byChannel = filteredData.reduce((acc: Record<string, number>, r) => {
        const channel = r.channel || "direct";
        acc[channel] = (acc[channel] || 0) + Number(r.total_amount || 0);
        return acc;
      }, {}) || {};

      return Object.entries(byChannel).map(([channel, revenue]) => ({
        channel,
        revenue,
      }));
    },
  });

  // Últimos pagamentos (inclui registros de realocação por establishment_id)
  const recentPaymentsQuery = useQuery({
    queryKey: ["financial_recent_payments", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      // Buscar pagamentos do estabelecimento (inclui auditoria de realocação com amount 0)
      const { data: allPayments, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("payment_date", { ascending: false })
        .limit(100);

      if (paymentsError) {
        console.error("Erro ao buscar pagamentos:", paymentsError);
        throw paymentsError;
      }

      if (!allPayments || allPayments.length === 0) {
        return [];
      }

      const reservationIds = [
        ...new Set(allPayments.map((p: any) => p.reservation_id).filter(Boolean)),
      ];

      let reservationsMap = new Map<string, any>();
      if (reservationIds.length > 0) {
        const { data: reservationsData, error: reservationsDetailError } = await supabase
          .from("reservations")
          .select(`
            id,
            reservation_code,
            status,
            financial_responsible:clients!client_id(full_name),
            guest:clients!guest_id(full_name)
          `)
          .in("id", reservationIds);

        if (reservationsDetailError) {
          console.error("Erro ao buscar detalhes das reservas:", reservationsDetailError);
        } else {
          reservationsMap = new Map((reservationsData || []).map((r: any) => [r.id, r]));
        }
      }

      const enrichedPayments = allPayments
        .map((p: any) => {
          const reservation = p.reservation_id ? reservationsMap.get(p.reservation_id) : null;
          return {
            ...p,
            reservations: reservation || null,
          };
        })
        .filter((p: any) => {
          // Manter pagamentos de auditoria de realocação mesmo se a reserva já saiu do hotel
          if (typeof p.notes === "string" && p.notes.toUpperCase().includes("REALOCAÇÃO")) {
            return true;
          }
          if (!p.reservation_id) return false;
          const reservation = reservationsMap.get(p.reservation_id);
          return reservation && reservation.status !== "cancelled";
        })
        .slice(0, 10);

      return enrichedPayments;
    },
    enabled: !!selectedEstablishment?.id,
  });

  // Comparação com período anterior (excluindo canceladas)
  const previousPeriodQuery = useQuery({
    queryKey: ["financial_previous_period", currentPeriod, selectedEstablishment?.id],
    queryFn: async () => {
      const start = new Date(currentPeriod.startDate);
      const end = new Date(currentPeriod.endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - daysDiff - 1);
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);

      const establishmentId = getEstablishmentId();
      let query = supabase
        .from("reservations")
        .select("total_amount, status")
        .gte("checkin_date", prevStart.toISOString().split("T")[0])
        .lte("checkin_date", prevEnd.toISOString().split("T")[0])
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Erro na query de período anterior:", error);
        throw error;
      }

      // Filtrar apenas status válidos (não canceladas)
      const validStatuses = ["confirmed", "checkedin", "checkedout", "pending", "preregistration"];
      const filteredData = data?.filter((r: any) => validStatuses.includes(r.status)) || [];

      const total = filteredData.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0;
      return { total };
    },
  });

  return {
    revenue: revenueQuery.data,
    payments: paymentsQuery.data,
    pending: pendingQuery.data,
    dailyRevenue: dailyRevenueQuery.data || [],
    channelRevenue: channelRevenueQuery.data || [],
    recentPayments: recentPaymentsQuery.data || [],
    previousPeriod: previousPeriodQuery.data,
    isLoading:
      revenueQuery.isLoading ||
      paymentsQuery.isLoading ||
      pendingQuery.isLoading ||
      dailyRevenueQuery.isLoading ||
      channelRevenueQuery.isLoading,
    refetch: () => {
      revenueQuery.refetch();
      paymentsQuery.refetch();
      pendingQuery.refetch();
      dailyRevenueQuery.refetch();
      channelRevenueQuery.refetch();
      recentPaymentsQuery.refetch();
      previousPeriodQuery.refetch();
    },
  };
};

