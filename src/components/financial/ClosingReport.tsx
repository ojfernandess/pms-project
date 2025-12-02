import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Download, 
  Loader2, 
  FileText, 
  FileSpreadsheet,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Users,
  Bed,
  BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/reservationUtils";
import { formatDate } from "@/lib/reservationUtils";
import { exportToCSV, exportToXLSX } from "@/lib/financialUtils";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Badge } from "@/components/ui/badge";

interface ClosingReportData {
  period: {
    startDate: string;
    endDate: string;
    month: string;
    year: number;
  };
  summary: {
    totalRevenue: number;
    totalPayments: number;
    totalPending: number;
    totalReservations: number;
    totalNights: number;
    occupancyRate: number;
    averageDailyRate: number;
    revenuePerAvailableRoom: number;
  };
  revenue: {
    byCategory: Array<{ category: string; revenue: number; count: number }>;
    byChannel: Array<{ channel: string; revenue: number; count: number }>;
    byDay: Array<{ date: string; revenue: number; reservations: number }>;
  };
  payments: {
    byMethod: Array<{ method: string; amount: number; count: number }>;
    byCarrier: Array<{ carrier: string; amount: number; count: number }>;
    totalWithFees: number;
    totalFees: number;
  };
  comparison: {
    previousMonth: {
      revenue: number;
      reservations: number;
      occupancyRate: number;
    };
    revenueChange: number;
    reservationsChange: number;
    occupancyChange: number;
  };
  reservations: {
    byStatus: Array<{ status: string; count: number; revenue: number }>;
    extensions: number;
    extensionsRevenue: number;
    cancellations: number;
    cancellationsRevenue: number;
  };
}

export const ClosingReport = () => {
  const { selectedEstablishment } = useEstablishment();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), "yyyy-MM")
  );
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState<ClosingReportData | null>(null);

  // Calcular período do mês selecionado
  const getPeriod = (monthString: string) => {
    const [year, month] = monthString.split("-").map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
      month: format(start, "MMMM", { locale: ptBR }),
      year: year,
    };
  };

  // Buscar dados do relatório
  const fetchReportData = async () => {
    if (!selectedEstablishment?.id) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    setIsLoading(true);
    try {
      const period = getPeriod(selectedMonth);
      const establishmentId = selectedEstablishment.id;

      // 1. Buscar reservas do período
      const { data: reservations, error: resError } = await supabase
        .from("reservations")
        .select(`
          id,
          total_amount,
          paid_amount,
          checkin_date,
          checkout_date,
          status,
          channel,
          category_id,
          room_categories(name),
          reservation_service_fees(amount, quantity)
        `)
        .eq("establishment_id", establishmentId)
        .gte("checkin_date", period.startDate)
        .lte("checkin_date", period.endDate)
        .order("checkin_date", { ascending: true });

      if (resError) throw resError;

      // 2. Buscar pagamentos do período
      const { data: payments, error: payError } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          payment_method,
          payment_date,
          carrier_id,
          payment_type_id,
          installments,
          payment_carriers(description, code),
          payment_types(name, card_fee, installments_2_6_fee, installments_7_12_fee)
        `)
        .eq("establishment_id", establishmentId)
        .gte("payment_date", `${period.startDate}T00:00:00`)
        .lte("payment_date", `${period.endDate}T23:59:59`)
        .order("payment_date", { ascending: true });

      if (payError) throw payError;

      // 3. Buscar quartos para calcular ocupação
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id")
        .eq("establishment_id", establishmentId);

      if (roomsError) throw roomsError;

      const totalRooms = rooms?.length || 1;
      const daysInMonth = new Date(period.year, parseInt(period.month) - 1 || 0, 0).getDate();
      const roomNightsAvailable = totalRooms * daysInMonth;

      // 4. Buscar dados do mês anterior para comparação
      const previousMonth = subMonths(new Date(period.year, parseInt(period.month) - 1 || 0), 1);
      const prevPeriod = {
        startDate: format(startOfMonth(previousMonth), "yyyy-MM-dd"),
        endDate: format(endOfMonth(previousMonth), "yyyy-MM-dd"),
      };

      const { data: prevReservations, error: prevError } = await supabase
        .from("reservations")
        .select("total_amount, status, checkin_date, checkout_date")
        .eq("establishment_id", establishmentId)
        .gte("checkin_date", prevPeriod.startDate)
        .lte("checkin_date", prevPeriod.endDate)
        .neq("status", "cancelled");

      if (prevError) console.error("Erro ao buscar mês anterior:", prevError);

      // Processar dados
      const validReservations = (reservations || []).filter(
        (r: any) => r.status !== "cancelled"
      );

      // Calcular receitas
      const totalRevenue = validReservations.reduce(
        (sum: number, r: any) => sum + Number(r.total_amount || 0),
        0
      );

      // Calcular noites vendidas
      const totalNights = validReservations.reduce((sum: number, r: any) => {
        if (!r.checkin_date || !r.checkout_date) return sum;
        const checkin = parseISO(r.checkin_date);
        const checkout = parseISO(r.checkout_date);
        const nights = Math.ceil(
          (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + nights;
      }, 0);

      // Calcular ocupação
      const occupancyRate = roomNightsAvailable > 0 
        ? (totalNights / roomNightsAvailable) * 100 
        : 0;

      // ADR (Average Daily Rate)
      const averageDailyRate = totalNights > 0 ? totalRevenue / totalNights : 0;

      // RevPAR (Revenue per Available Room)
      const revenuePerAvailableRoom = totalRevenue / totalRooms;

      // Receitas por categoria
      const revenueByCategory = new Map<string, { revenue: number; count: number }>();
      validReservations.forEach((r: any) => {
        const categoryName = r.room_categories?.name || "Sem categoria";
        const current = revenueByCategory.get(categoryName) || { revenue: 0, count: 0 };
        revenueByCategory.set(categoryName, {
          revenue: current.revenue + Number(r.total_amount || 0),
          count: current.count + 1,
        });
      });

      // Receitas por canal
      const revenueByChannel = new Map<string, { revenue: number; count: number }>();
      validReservations.forEach((r: any) => {
        const channel = r.channel || "direct";
        const channelName = channel === "direct" ? "Balcão" : channel.toUpperCase();
        const current = revenueByChannel.get(channelName) || { revenue: 0, count: 0 };
        revenueByChannel.set(channelName, {
          revenue: current.revenue + Number(r.total_amount || 0),
          count: current.count + 1,
        });
      });

      // Receitas por dia
      const revenueByDay = new Map<string, { revenue: number; reservations: number }>();
      validReservations.forEach((r: any) => {
        const day = r.checkin_date;
        const current = revenueByDay.get(day) || { revenue: 0, reservations: 0 };
        revenueByDay.set(day, {
          revenue: current.revenue + Number(r.total_amount || 0),
          reservations: current.reservations + 1,
        });
      });

      // Pagamentos
      const totalPayments = (payments || []).reduce(
        (sum: number, p: any) => sum + Number(p.amount || 0),
        0
      );

      // Pagamentos por método
      const paymentsByMethod = new Map<string, { amount: number; count: number }>();
      (payments || []).forEach((p: any) => {
        const method = p.payment_method || "outro";
        const methodName = 
          method === "credit_card" ? "Cartão de Crédito" :
          method === "debit_card" ? "Cartão de Débito" :
          method === "pix" ? "PIX" :
          method === "cash" ? "Dinheiro" :
          method === "bank_transfer" ? "Transferência Bancária" :
          method === "deposit" ? "Depósito" : method;
        const current = paymentsByMethod.get(methodName) || { amount: 0, count: 0 };
        paymentsByMethod.set(methodName, {
          amount: current.amount + Number(p.amount || 0),
          count: current.count + 1,
        });
      });

      // Pagamentos por portador
      const paymentsByCarrier = new Map<string, { amount: number; count: number }>();
      (payments || []).forEach((p: any) => {
        const carrier = p.payment_carriers 
          ? (Array.isArray(p.payment_carriers) ? p.payment_carriers[0] : p.payment_carriers)
          : null;
        const carrierName = carrier 
          ? `${carrier.description || ""} (${carrier.code || ""})`
          : "Sem portador";
        const current = paymentsByCarrier.get(carrierName) || { amount: 0, count: 0 };
        paymentsByCarrier.set(carrierName, {
          amount: current.amount + Number(p.amount || 0),
          count: current.count + 1,
        });
      });

      // Calcular taxas de pagamento
      let totalFees = 0;
      (payments || []).forEach((p: any) => {
        if (p.payment_method === "credit_card" && p.payment_types) {
          const paymentType = Array.isArray(p.payment_types) 
            ? p.payment_types[0] 
            : p.payment_types;
          const installments = p.installments || 1;
          let feePercent = paymentType.card_fee || 0;
          
          if (installments >= 2 && installments <= 6) {
            feePercent = paymentType.installments_2_6_fee || 0;
          } else if (installments >= 7 && installments <= 12) {
            feePercent = paymentType.installments_7_12_fee || 0;
          }
          
          totalFees += (Number(p.amount || 0) * feePercent) / 100;
        }
      });

      // Reservas por status
      const reservationsByStatus = new Map<string, { count: number; revenue: number }>();
      validReservations.forEach((r: any) => {
        const status = r.status || "pending";
        const statusName = 
          status === "confirmed" ? "Confirmada" :
          status === "checkedin" ? "Check-in Realizado" :
          status === "checkedout" ? "Check-out Realizado" :
          status === "pending" ? "Pendente" :
          status === "preregistration" ? "Pré-registro" :
          status === "blocked" ? "Bloqueada" : status;
        const current = reservationsByStatus.get(statusName) || { count: 0, revenue: 0 };
        reservationsByStatus.set(statusName, {
          count: current.count + 1,
          revenue: current.revenue + Number(r.total_amount || 0),
        });
      });

      // Extensões e cancelamentos (buscar nos logs de atividade)
      let extensions = 0;
      let extensionsRevenue = 0;
      let cancellations = 0;
      let cancellationsRevenue = 0;

      const reservationIds = validReservations.map((r: any) => r.id);
      if (reservationIds.length > 0) {
        const { data: extensionLogs } = await supabase
          .from("activity_logs")
          .select("entity_id, new_values, old_values")
          .in("entity_id", reservationIds)
          .eq("action_type", "dates_changed")
          .gte("created_at", `${period.startDate}T00:00:00`)
          .lte("created_at", `${period.endDate}T23:59:59`);

        if (extensionLogs) {
          extensions = extensionLogs.length;
          extensionLogs.forEach((log: any) => {
            const reservation = validReservations.find((r: any) => r.id === log.entity_id);
            if (reservation) {
              extensionsRevenue += Number(reservation.total_amount || 0);
            }
          });
        }

        const { data: cancellationLogs } = await supabase
          .from("activity_logs")
          .select("entity_id, old_values")
          .in("entity_id", reservationIds)
          .eq("action_type", "cancelled")
          .gte("created_at", `${period.startDate}T00:00:00`)
          .lte("created_at", `${period.endDate}T23:59:59`);

        if (cancellationLogs) {
          cancellations = cancellationLogs.length;
          cancellationLogs.forEach((log: any) => {
            const reservation = validReservations.find((r: any) => r.id === log.entity_id);
            if (reservation && log.old_values?.total_amount) {
              cancellationsRevenue += Number(log.old_values.total_amount || 0);
            }
          });
        }
      }

      // Calcular pendências
      const totalPending = validReservations.reduce((sum: number, r: any) => {
        const total = Number(r.total_amount || 0);
        const paid = Number(r.paid_amount || 0);
        const pending = total - paid;
        return sum + (pending > 0 ? pending : 0);
      }, 0);

      // Comparação com mês anterior
      const prevValidReservations = (prevReservations || []).filter(
        (r: any) => r.status !== "cancelled"
      );
      const prevRevenue = prevValidReservations.reduce(
        (sum: number, r: any) => sum + Number(r.total_amount || 0),
        0
      );
      const prevNights = prevValidReservations.reduce((sum: number, r: any) => {
        if (!r.checkin_date || !r.checkout_date) return sum;
        const checkin = parseISO(r.checkin_date);
        const checkout = parseISO(r.checkout_date);
        const nights = Math.ceil(
          (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + nights;
      }, 0);
      const prevOccupancyRate = roomNightsAvailable > 0 
        ? (prevNights / roomNightsAvailable) * 100 
        : 0;

      const revenueChange = prevRevenue > 0 
        ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 
        : 0;
      const reservationsChange = prevValidReservations.length > 0
        ? ((validReservations.length - prevValidReservations.length) / prevValidReservations.length) * 100
        : 0;
      const occupancyChange = prevOccupancyRate > 0
        ? occupancyRate - prevOccupancyRate
        : 0;

      // Montar dados do relatório
      const data: ClosingReportData = {
        period,
        summary: {
          totalRevenue,
          totalPayments,
          totalPending,
          totalReservations: validReservations.length,
          totalNights,
          occupancyRate,
          averageDailyRate,
          revenuePerAvailableRoom,
        },
        revenue: {
          byCategory: Array.from(revenueByCategory.entries()).map(([category, data]) => ({
            category,
            revenue: data.revenue,
            count: data.count,
          })),
          byChannel: Array.from(revenueByChannel.entries()).map(([channel, data]) => ({
            channel,
            revenue: data.revenue,
            count: data.count,
          })),
          byDay: Array.from(revenueByDay.entries())
            .map(([date, data]) => ({
              date,
              revenue: data.revenue,
              reservations: data.reservations,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        },
        payments: {
          byMethod: Array.from(paymentsByMethod.entries()).map(([method, data]) => ({
            method,
            amount: data.amount,
            count: data.count,
          })),
          byCarrier: Array.from(paymentsByCarrier.entries()).map(([carrier, data]) => ({
            carrier,
            amount: data.amount,
            count: data.count,
          })),
          totalWithFees: totalPayments,
          totalFees,
        },
        comparison: {
          previousMonth: {
            revenue: prevRevenue,
            reservations: prevValidReservations.length,
            occupancyRate: prevOccupancyRate,
          },
          revenueChange,
          reservationsChange,
          occupancyChange,
        },
        reservations: {
          byStatus: Array.from(reservationsByStatus.entries()).map(([status, data]) => ({
            status,
            count: data.count,
            revenue: data.revenue,
          })),
          extensions,
          extensionsRevenue,
          cancellations,
          cancellationsRevenue,
        },
      };

      setReportData(data);
    } catch (error: any) {
      console.error("Erro ao gerar relatório de fechamento:", error);
      toast.error("Erro ao gerar relatório de fechamento");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEstablishment?.id) {
      fetchReportData();
    }
  }, [selectedMonth, selectedEstablishment?.id]);

  // Exportar relatório
  const handleExport = async (format: "csv" | "xlsx") => {
    if (!reportData) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    try {
      const exportData: any[] = [];

      // Resumo executivo
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Receita Total",
        valor: reportData.summary.totalRevenue.toFixed(2),
        quantidade: "",
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Pagamentos Recebidos",
        valor: reportData.summary.totalPayments.toFixed(2),
        quantidade: "",
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Pendências",
        valor: reportData.summary.totalPending.toFixed(2),
        quantidade: "",
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Total de Reservas",
        valor: "",
        quantidade: reportData.summary.totalReservations.toString(),
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Total de Noites",
        valor: "",
        quantidade: reportData.summary.totalNights.toString(),
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "Taxa de Ocupação",
        valor: reportData.summary.occupancyRate.toFixed(2) + "%",
        quantidade: "",
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "ADR (Diária Média)",
        valor: reportData.summary.averageDailyRate.toFixed(2),
        quantidade: "",
        observações: "",
      });
      exportData.push({
        seção: "RESUMO EXECUTIVO",
        item: "RevPAR (Receita por Quarto Disponível)",
        valor: reportData.summary.revenuePerAvailableRoom.toFixed(2),
        quantidade: "",
        observações: "",
      });

      // Receitas por categoria
      reportData.revenue.byCategory.forEach((item) => {
        exportData.push({
          seção: "RECEITAS POR CATEGORIA",
          item: item.category,
          valor: item.revenue.toFixed(2),
          quantidade: item.count.toString(),
          observações: "",
        });
      });

      // Receitas por canal
      reportData.revenue.byChannel.forEach((item) => {
        exportData.push({
          seção: "RECEITAS POR CANAL",
          item: item.channel,
          valor: item.revenue.toFixed(2),
          quantidade: item.count.toString(),
          observações: "",
        });
      });

      // Pagamentos por método
      reportData.payments.byMethod.forEach((item) => {
        exportData.push({
          seção: "PAGAMENTOS POR MÉTODO",
          item: item.method,
          valor: item.amount.toFixed(2),
          quantidade: item.count.toString(),
          observações: "",
        });
      });

      // Pagamentos por portador
      reportData.payments.byCarrier.forEach((item) => {
        exportData.push({
          seção: "PAGAMENTOS POR PORTADOR",
          item: item.carrier,
          valor: item.amount.toFixed(2),
          quantidade: item.count.toString(),
          observações: "",
        });
      });

      // Comparação com mês anterior
      exportData.push({
        seção: "COMPARAÇÃO MÊS ANTERIOR",
        item: "Receita Mês Anterior",
        valor: reportData.comparison.previousMonth.revenue.toFixed(2),
        quantidade: "",
        observações: `Variação: ${reportData.comparison.revenueChange >= 0 ? "+" : ""}${reportData.comparison.revenueChange.toFixed(2)}%`,
      });
      exportData.push({
        seção: "COMPARAÇÃO MÊS ANTERIOR",
        item: "Reservas Mês Anterior",
        valor: "",
        quantidade: reportData.comparison.previousMonth.reservations.toString(),
        observações: `Variação: ${reportData.comparison.reservationsChange >= 0 ? "+" : ""}${reportData.comparison.reservationsChange.toFixed(2)}%`,
      });

      const filename = `fechamento_${reportData.period.month}_${reportData.period.year}`;
      
      if (format === "xlsx") {
        await exportToXLSX(exportData, filename, "Fechamento Mensal");
      } else {
        exportToCSV(exportData, filename);
      }
      
      toast.success(`Relatório exportado em ${format.toUpperCase()} com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao exportar relatório:", error);
      toast.error("Erro ao exportar relatório");
    }
  };

  if (!selectedEstablishment?.id) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Selecione um estabelecimento para visualizar o relatório</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Relatório de Fechamento</h3>
            <p className="text-sm text-muted-foreground mt-1">Consolidação mensal completa</p>
          </div>
        </div>
        
        {/* Filtro e Ações - Design Minimalista */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Calendar className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <Label htmlFor="month" className="sr-only">Selecionar mês</Label>
              <Input
                id="month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full sm:w-auto bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 transition-all"
              />
            </div>
          </div>
          
          {reportData && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport("csv")}
                disabled={isLoading}
                className="h-9 px-3 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <FileText className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport("xlsx")}
                disabled={isLoading}
                className="h-9 px-3 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : reportData ? (
        <div className="space-y-6">
          {/* Resumo Executivo */}
          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Resumo Executivo - {reportData.period.month} {reportData.period.year}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(reportData.summary.totalRevenue)}
                </p>
                {reportData.comparison.revenueChange !== 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    {reportData.comparison.revenueChange > 0 ? (
                      <TrendingUp className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-600" />
                    )}
                    <span
                      className={
                        reportData.comparison.revenueChange > 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }
                    >
                      {reportData.comparison.revenueChange >= 0 ? "+" : ""}
                      {reportData.comparison.revenueChange.toFixed(2)}% vs mês anterior
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pagamentos Recebidos</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(reportData.summary.totalPayments)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Taxas: {formatCurrency(reportData.payments.totalFees)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pendências</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(reportData.summary.totalPending)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Taxa de Ocupação</p>
                <p className="text-2xl font-bold text-purple-600">
                  {reportData.summary.occupancyRate.toFixed(1)}%
                </p>
                {reportData.comparison.occupancyChange !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    {reportData.comparison.occupancyChange >= 0 ? "+" : ""}
                    {reportData.comparison.occupancyChange.toFixed(1)}% vs mês anterior
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total de Reservas</p>
                <p className="text-2xl font-bold">{reportData.summary.totalReservations}</p>
                {reportData.comparison.reservationsChange !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    {reportData.comparison.reservationsChange >= 0 ? "+" : ""}
                    {reportData.comparison.reservationsChange.toFixed(1)}% vs mês anterior
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total de Noites</p>
                <p className="text-2xl font-bold">{reportData.summary.totalNights}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">ADR (Diária Média)</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(reportData.summary.averageDailyRate)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">RevPAR</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(reportData.summary.revenuePerAvailableRoom)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Receita por Quarto Disponível
                </p>
              </div>
            </div>
          </Card>

          {/* Receitas por Categoria */}
          {reportData.revenue.byCategory.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Receitas por Categoria</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Reservas</TableHead>
                      <TableHead className="text-right">% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.revenue.byCategory.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.category}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {reportData.summary.totalRevenue > 0
                            ? ((item.revenue / reportData.summary.totalRevenue) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Receitas por Canal */}
          {reportData.revenue.byChannel.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Receitas por Canal</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Reservas</TableHead>
                      <TableHead className="text-right">% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.revenue.byChannel.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.channel}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {reportData.summary.totalRevenue > 0
                            ? ((item.revenue / reportData.summary.totalRevenue) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Pagamentos por Método */}
          {reportData.payments.byMethod.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Pagamentos por Método</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Transações</TableHead>
                      <TableHead className="text-right">% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.payments.byMethod.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.method}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {reportData.summary.totalPayments > 0
                            ? ((item.amount / reportData.summary.totalPayments) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Pagamentos por Portador */}
          {reportData.payments.byCarrier.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Pagamentos por Portador</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Portador</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Transações</TableHead>
                      <TableHead className="text-right">% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.payments.byCarrier.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.carrier}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {reportData.summary.totalPayments > 0
                            ? ((item.amount / reportData.summary.totalPayments) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Reservas por Status */}
          {reportData.reservations.byStatus.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Reservas por Status</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.reservations.byStatus.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.status}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Informações Adicionais */}
          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">Informações Adicionais</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Extensões de Reserva</p>
                <p className="text-xl font-semibold">{reportData.reservations.extensions}</p>
                <p className="text-xs text-muted-foreground">
                  Receita: {formatCurrency(reportData.reservations.extensionsRevenue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cancelamentos</p>
                <p className="text-xl font-semibold">{reportData.reservations.cancellations}</p>
                <p className="text-xs text-muted-foreground">
                  Receita perdida: {formatCurrency(reportData.reservations.cancellationsRevenue)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-12">
          <p className="text-center text-muted-foreground">
            Nenhum dado disponível para o período selecionado
          </p>
        </Card>
      )}
    </div>
  );
};

