import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Download, Loader2, FileText, FileSpreadsheet, Plus, Edit, Trash2, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFinancialReports } from "@/hooks/useFinancialReports";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PaymentMethodChart } from "@/components/financial/PaymentMethodChart";
import { ChannelComparisonChart } from "@/components/financial/ChannelComparisonChart";
import { CashFlowChart } from "@/components/financial/CashFlowChart";
import { FinancialCashFlowDashboard } from "@/components/financial/FinancialCashFlowDashboard";
import {
  formatCurrency,
  calculatePercentageChange,
  formatPercentageChange,
  toFiniteNumber,
  getCurrentMonthPeriod,
  getCurrentWeekPeriod,
  getCurrentYearPeriod,
  exportToCSV,
  exportToXLSX,
} from "@/lib/financialUtils";
import { formatDate } from "@/lib/reservationUtils";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePaymentCarriers } from "@/hooks/usePaymentCarriers";
import { PaymentCarrierDialog } from "@/components/financial/PaymentCarrierDialog";
import { PaymentTypeDialog } from "@/components/financial/PaymentTypeDialog";
import { useServiceFees } from "@/hooks/useServiceFees";
import { ServiceFeeDialog } from "@/components/financial/ServiceFeeDialog";
import { ClosingReport } from "@/components/financial/ClosingReport";
import { OperatingFinancialReport } from "@/components/financial/OperatingFinancialReport";
import { SalesBillingDashboard } from "@/components/financial/SalesBillingDashboard";
import { AccountsReceivableList } from "@/components/financial/AccountsReceivableList";
import { AccountsPayableList } from "@/components/financial/AccountsPayableList";
import { BankReconciliationDashboard } from "@/components/financial/BankReconciliationDashboard";
import { InvoiceList } from "@/components/financial/InvoiceList";
import { RefundsList } from "@/components/financial/RefundsList";
import { CancellationReport } from "@/components/financial/CancellationReport";
import { NoShowReport } from "@/components/financial/NoShowReport";
import { SoldReservationsReport } from "@/components/financial/SoldReservationsReport";
import { CLEANING_FEE_KIND } from "@/lib/cleaningFeeConfig";
import { PARKING_FEE_KIND } from "@/lib/parkingFeeConfig";

function serviceFeeVisibleInFinancialList(fee: {
  service_kind?: string | null;
  is_active?: boolean;
  default_amount?: number | null;
  source_service_id?: string | null;
}): boolean {
  if (fee.service_kind !== CLEANING_FEE_KIND && fee.service_kind !== PARKING_FEE_KIND) return true;
  return Boolean(
    fee.is_active && Number(fee.default_amount || 0) > 0 && fee.source_service_id,
  );
}
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FINANCIAL_TAB_QUERY = "tab";
const FINANCIAL_REPORT_QUERY = "relatorio";

const Financial = () => {
  const { selectedEstablishment } = useEstablishment();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFinancialTab = searchParams.get(FINANCIAL_TAB_QUERY) || "faturamento_vendas";
  const activeFinancialReport =
    searchParams.get(FINANCIAL_REPORT_QUERY) || "reservas_criadas";

  const handleFinancialTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(FINANCIAL_TAB_QUERY, value);
    if (value !== "reports") {
      next.delete(FINANCIAL_REPORT_QUERY);
    } else if (!next.get(FINANCIAL_REPORT_QUERY)) {
      next.set(FINANCIAL_REPORT_QUERY, "reservas_criadas");
    }
    setSearchParams(next, { replace: true });
  };

  const handleFinancialReportChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(FINANCIAL_TAB_QUERY, "reports");
    next.set(FINANCIAL_REPORT_QUERY, value);
    setSearchParams(next, { replace: true });
  };

  const [periodType, setPeriodType] = useState<"month" | "week" | "year" | "custom">("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Garantir que o establishmentId está disponível no localStorage quando a página carregar
  useEffect(() => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
    }
  }, [selectedEstablishment]);

  // Estados para portadores de pagamento
  const {
    carriers,
    paymentTypes,
    isLoading: isLoadingCarriers,
    refetch: refetchCarriers,
    deleteCarrier,
    deletePaymentType,
  } = usePaymentCarriers();
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  const [paymentTypeDialogOpen, setPaymentTypeDialogOpen] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | undefined>();
  const [selectedPaymentTypeId, setSelectedPaymentTypeId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"carrier" | "payment_type" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedCarrierId, setExpandedCarrierId] = useState<string | null>(null);

  // Estados para taxas/serviços
  const {
    serviceFees,
    isLoading: isLoadingServiceFees,
    createServiceFee,
    updateServiceFee,
    deleteServiceFee,
    isCreating: isCreatingServiceFee,
    isUpdating: isUpdatingServiceFee,
    isDeleting: isDeletingServiceFee,
  } = useServiceFees();
  const [serviceFeeDialogOpen, setServiceFeeDialogOpen] = useState(false);
  const [selectedServiceFeeId, setSelectedServiceFeeId] = useState<string | undefined>();
  const [selectedServiceFeeData, setSelectedServiceFeeData] = useState<{
    name?: string;
    description?: string;
    is_active?: boolean;
  } | undefined>();
  const [deleteServiceFeeDialogOpen, setDeleteServiceFeeDialogOpen] = useState(false);
  const [serviceFeeToDelete, setServiceFeeToDelete] = useState<string | null>(null);
  const [searchServiceFeeTerm, setSearchServiceFeeTerm] = useState("");
  const [statusServiceFeeFilter, setStatusServiceFeeFilter] = useState<string>("all");

  const getPeriod = () => {
    switch (periodType) {
      case "week":
        return getCurrentWeekPeriod();
      case "year":
        return getCurrentYearPeriod();
      case "custom":
        return {
          startDate: customStartDate,
          endDate: customEndDate,
        };
      default:
        return getCurrentMonthPeriod();
    }
  };

  const {
    revenue,
    payments,
    pending,
    dailyRevenue,
    channelRevenue,
    recentPayments,
    previousPeriod,
    isLoading,
  } = useFinancialReports(getPeriod());

  const revenueTotal = toFiniteNumber(revenue?.total);
  const paymentsTotal = toFiniteNumber(payments?.total);
  const pendingTotal = toFiniteNumber(pending?.total);
  const previousRevenue = toFiniteNumber(previousPeriod?.total);

  const revenueChange = calculatePercentageChange(revenueTotal, previousRevenue);
  const paymentPercentage = revenueTotal > 0 ? (paymentsTotal / revenueTotal) * 100 : 0;

  const fetchRevenueData = async () => {
    if (!selectedEstablishment?.id) {
      toast.error("Estabelecimento não selecionado");
      return null;
    }

    const period = getPeriod();

    try {
      // Buscar reservas do período com taxas extras
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          total_amount,
          paid_amount,
          payment_status,
          status,
          channel,
          guest_name,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name),
          reservation_service_fees(
            amount,
            quantity,
            service_fees!service_fee_id(name)
          )
        `)
        .eq("establishment_id", selectedEstablishment.id)
        .gte("checkin_date", period.startDate)
        .lte("checkin_date", period.endDate)
        .neq("status", "cancelled")
        .order("checkin_date", { ascending: false });

      if (error) throw error;

      // Processar dados para exportação
      const exportData = (reservations || []).map((reservation: any) => {
        // Calcular total de taxas extras
        const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
          return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
        }, 0);

        // Listar taxas extras separadamente
        const serviceFeesList = (reservation.reservation_service_fees || [])
          .map((fee: any) => `${fee.service_fees?.name || "Taxa"}: R$ ${(Number(fee.amount || 0) * Number(fee.quantity || 1)).toFixed(2)}`)
          .join("; ");

        const totalWithFees = toFiniteNumber(reservation.total_amount) + serviceFeesTotal;

        return {
          data_checkin: formatDate(reservation.checkin_date),
          data_checkout: formatDate(reservation.checkout_date),
          codigo_reserva: reservation.reservation_code || "",
          hospede: reservationGuestDisplayName(reservation, ""),
          canal: reservation.channel || "direct",
          valor_base: Number(reservation.total_amount || 0).toFixed(2),
          taxas_extras: serviceFeesTotal > 0 ? serviceFeesTotal.toFixed(2) : "0,00",
          detalhes_taxas: serviceFeesList || "-",
          valor_total: totalWithFees.toFixed(2),
          valor_pago: Number(reservation.paid_amount || 0).toFixed(2),
          saldo_pendente: (totalWithFees - (reservation.paid_amount || 0)).toFixed(2),
          status_pagamento: reservation.payment_status || "pending",
          status_reserva: reservation.status || "",
        };
      });

      if (exportData.length > 0) {
        return exportData;
      } else {
        toast.info("Nenhum dado para exportar");
        return null;
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados de faturamento:", error);
      toast.error("Erro ao buscar dados do relatório");
      return null;
    }
  };

  const handleExportRevenue = async (format: "csv" | "xlsx" = "csv") => {
    const exportData = await fetchRevenueData();
    if (!exportData) return;

    try {
      const filename = `faturamento_detalhado_${periodType}`;
      if (format === "xlsx") {
        await exportToXLSX(exportData, filename, "Faturamento");
      } else {
        exportToCSV(exportData, filename);
      }
      toast.success(`Relatório exportado em ${format.toUpperCase()} com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao exportar faturamento:", error);
      toast.error("Erro ao exportar relatório");
    }
  };

  const fetchPaymentsData = async () => {
    if (!selectedEstablishment?.id) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    const period = getPeriod();

    try {
      // Buscar pagamentos do período com detalhes das reservas e taxas extras
      const { data: payments, error } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          payment_method,
          payment_date,
          notes,
          installments,
          carrier_id,
          payment_type_id,
          reservation_id,
          reservations!inner(
            id,
            reservation_code,
            checkin_date,
            checkout_date,
            total_amount,
            paid_amount,
            payment_status,
            status,
            guest_name,
            guest:clients!guest_id(full_name),
            financial_responsible:clients!client_id(full_name),
            reservation_service_fees(
              amount,
              quantity,
              service_fees(name)
            )
          )
        `)
        .eq("establishment_id", selectedEstablishment.id)
        .gte("payment_date", `${period.startDate}T00:00:00`)
        .lte("payment_date", `${period.endDate}T23:59:59`)
        .neq("reservations.status", "cancelled")
        .order("payment_date", { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Agrupar pagamentos por reserva
      const paymentsByReservation = new Map<string, any[]>();
      
      (payments || []).forEach((payment: any) => {
        const reservation = Array.isArray(payment.reservations) 
          ? payment.reservations[0] 
          : payment.reservations;

        if (!reservation) return;
        
        const reservationId = reservation.id;
        if (!paymentsByReservation.has(reservationId)) {
          paymentsByReservation.set(reservationId, []);
        }
        paymentsByReservation.get(reservationId)!.push(payment);
      });

      // Buscar informações de portadores e tipos de pagamento
      const carrierIds = [...new Set((payments || []).map((p: any) => p.carrier_id).filter(Boolean))];
      const paymentTypeIds = [...new Set((payments || []).map((p: any) => p.payment_type_id).filter(Boolean))];
      
      const carriersMap = new Map();
      const paymentTypesMap = new Map();
      
      if (carrierIds.length > 0) {
        const { data: carriers } = await (supabase as any)
          .from("payment_carriers")
          .select("id, code, description")
          .in("id", carrierIds);
        carriers?.forEach((c: any) => carriersMap.set(c.id, c));
      }
      
      if (paymentTypeIds.length > 0) {
        const { data: paymentTypes } = await (supabase as any)
          .from("payment_types")
          .select("id, name, payment_method")
          .in("id", paymentTypeIds);
        paymentTypes?.forEach((pt: any) => paymentTypesMap.set(pt.id, pt));
      }

      // Processar dados agrupados por reserva
      const exportData: any[] = [];
      
      paymentsByReservation.forEach((reservationPayments, reservationId) => {
        const firstPayment = reservationPayments[0];
        const reservation = Array.isArray(firstPayment.reservations) 
          ? firstPayment.reservations[0] 
          : firstPayment.reservations;

        if (!reservation) return;

        // Calcular total de taxas extras da reserva
        const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
          return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
        }, 0);

        // Listar taxas extras separadamente
        const serviceFeesList = (reservation.reservation_service_fees || [])
          .map((fee: any) => `${fee.service_fees?.name || "Taxa"}: R$ ${(Number(fee.amount || 0) * Number(fee.quantity || 1)).toFixed(2)}`)
          .join("; ");

        // Calcular valores totais dos pagamentos desta reserva
        const totalPaid = reservationPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        // Coletar informações de todos os pagamentos
        const paymentMethods = [...new Set(reservationPayments.map((p: any) => {
          const pt = paymentTypesMap.get(p.payment_type_id);
          return pt ? `${pt.name} (${pt.payment_method})` : p.payment_method || "";
        }))];
        
        const paymentCarriers = [...new Set(reservationPayments.map((p: any) => {
          const carrier = carriersMap.get(p.carrier_id);
          return carrier ? `${carrier.description} (${carrier.code})` : "Sem portador";
        }))];
        
        const paymentNotes = reservationPayments
          .map((p: any) => p.notes)
          .filter(Boolean)
          .join(" | ");
        
        const paymentDates = reservationPayments
          .map((p: any) => formatDate(p.payment_date))
          .join(", ");
        
        // Coletar informações de parcelas
        const installmentsInfo = reservationPayments
          .map((p: any) => {
            const installments = p.installments || 1;
            if (installments > 1) {
              const installmentAmount = (Number(p.amount || 0) / installments).toFixed(2);
              // Extrair datas das parcelas das notas se disponível
              const notes = p.notes || "";
              const datesMatch = notes.match(/Datas das parcelas: ([^|]+)/);
              const installmentDates = datesMatch ? datesMatch[1].trim() : formatDate(p.payment_date);
              // Extrair taxa das notas se disponível
              const feeMatch = notes.match(/Taxa \(([^%]+)%\): R\$ ([^|]+)/);
              const feeInfo = feeMatch ? `Taxa: ${feeMatch[1]}% (R$ ${feeMatch[2]})` : "";
              return `${installments}x de R$ ${installmentAmount.replace(".", ",")}${feeInfo ? ` - ${feeInfo}` : ""} - Datas: ${installmentDates}`;
            }
            return null;
          })
          .filter(Boolean)
          .join(" | ");
        
        const hasInstallments = reservationPayments.some((p: any) => (p.installments || 1) > 1);

        // Calcular valor base original (sem extensão)
        // Assumir que o total_amount original é o valor base
        const baseAmount = Number(reservation.total_amount || 0);
        
        // Calcular extensão (diferença entre total pago e valor base + taxas)
        // Se o total pago for maior que base + taxas, pode haver extensão
        const totalWithFees = baseAmount + serviceFeesTotal;
        const extensionAmount = Math.max(0, totalPaid - totalWithFees);

        exportData.push({
          data_checkin: formatDate(reservation.checkin_date),
          data_checkout: formatDate(reservation.checkout_date),
          codigo_reserva: reservation.reservation_code || "",
          hospede: reservationGuestDisplayName(reservation, ""),
          valor_base_reserva: baseAmount.toFixed(2),
          valor_extensao_reserva: extensionAmount > 0 ? extensionAmount.toFixed(2) : "0,00",
          taxas_extras_reserva: serviceFeesTotal > 0 ? serviceFeesTotal.toFixed(2) : "0,00",
          detalhes_taxas: serviceFeesList || "-",
          valor_total_reserva: (baseAmount + extensionAmount + serviceFeesTotal).toFixed(2),
          total_pago_reserva: totalPaid.toFixed(2),
          saldo_pendente_reserva: Math.max(0, (baseAmount + extensionAmount + serviceFeesTotal) - totalPaid).toFixed(2),
          datas_pagamento: paymentDates,
          metodos_pagamento: paymentMethods.join(" | "),
          portadores_pagamento: paymentCarriers.join(" | "),
          observacoes_pagamentos: paymentNotes || "-",
          quantidade_pagamentos: reservationPayments.length.toString(),
          quantidade_parcelas: hasInstallments ? installmentsInfo : "1x (à vista)",
          status_pagamento: reservation.payment_status || "pending",
        });
      });

      // Ordenar por código de reserva
      exportData.sort((a, b) => (a.codigo_reserva || "").localeCompare(b.codigo_reserva || ""));

      if (exportData.length > 0) {
        return exportData;
      } else {
        toast.info("Nenhum dado para exportar");
        return null;
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados de pagamentos:", error);
      toast.error("Erro ao buscar dados do relatório");
      return null;
    }
  };

  const handleExportPayments = async (format: "csv" | "xlsx" = "csv") => {
    const exportData = await fetchPaymentsData();
    if (!exportData) return;

    try {
      const filename = `pagamentos_detalhado_${periodType}`;
      if (format === "xlsx") {
        await exportToXLSX(exportData, filename, "Pagamentos");
      } else {
        exportToCSV(exportData, filename);
      }
      toast.success(`Relatório exportado em ${format.toUpperCase()} com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao exportar pagamentos:", error);
      toast.error("Erro ao exportar relatório");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground">Gestão financeira completa</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodType} onValueChange={(value: any) => setPeriodType(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mês</SelectItem>
              <SelectItem value="year">Ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodType === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-40"
              />
              <span>até</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-40"
              />
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Faturamento</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(revenueTotal)}</p>
                  {previousPeriod && (
                    <p
                      className={`text-xs flex items-center gap-1 mt-1 ${
                        revenueChange >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {revenueChange >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {formatPercentageChange(revenueChange)} vs período anterior
                    </p>
                  )}
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recebido</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(paymentsTotal)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentPercentage.toFixed(1)}% do faturamento
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-success" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Receber</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(pendingTotal)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {revenueTotal > 0
                      ? ((pendingTotal / revenueTotal) * 100).toFixed(1)
                      : 0}
                    % pendente
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-warning" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Reservas</p>
                  <p className="text-2xl font-bold mt-2">{revenue?.count || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {revenueTotal > 0
                      ? formatCurrency(revenueTotal / (revenue?.count || 1))
                      : formatCurrency(0)}{" "}
                    média
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </Card>
          </div>

          <Tabs value={activeFinancialTab} onValueChange={handleFinancialTabChange} className="space-y-4">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="faturamento_vendas">Faturamento de vendas</TabsTrigger>
              <TabsTrigger value="reports">Relatórios</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
              <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
              <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
              <TabsTrigger value="invoices">Faturas</TabsTrigger>
              <TabsTrigger value="reconciliation">Conciliação</TabsTrigger>
              <TabsTrigger value="refunds">Estornos</TabsTrigger>
              <TabsTrigger value="payments">Pagamentos</TabsTrigger>
              <TabsTrigger value="carriers">Portadores</TabsTrigger>
              <TabsTrigger value="service_fees">Taxas</TabsTrigger>
            </TabsList>

            <TabsContent value="faturamento_vendas" className="space-y-4">
              <SalesBillingDashboard />
            </TabsContent>

            <TabsContent value="operacao" className="space-y-4">
              <OperatingFinancialReport />
            </TabsContent>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Faturamento Diário</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportRevenue("csv")}>
                        <FileText className="h-4 w-4 mr-2" />
                        CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExportRevenue("xlsx")}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel
                    </Button>
                    </div>
                  </div>
                  <RevenueChart data={dailyRevenue} />
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Métodos de Pagamento</h3>
                  <PaymentMethodChart data={payments?.byMethod} />
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Faturamento por Canal</h3>
                  <ChannelComparisonChart data={channelRevenue} />
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Fluxo de Caixa</h3>
                  <CashFlowChart
                    data={dailyRevenue.map((item) => ({
                      ...item,
                      payments: 0, // TODO: Implementar quando tiver dados de despesas
                    }))}
                  />
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="receivables">
              <AccountsReceivableList />
            </TabsContent>

            <TabsContent value="payables">
              <AccountsPayableList />
            </TabsContent>

            <TabsContent value="cashflow">
              <FinancialCashFlowDashboard />
            </TabsContent>

            <TabsContent value="invoices">
              <InvoiceList />
            </TabsContent>

            <TabsContent value="reconciliation">
              <BankReconciliationDashboard />
            </TabsContent>

            <TabsContent value="refunds">
              <RefundsList />
            </TabsContent>

            <TabsContent value="payments">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Últimos Pagamentos</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExportPayments("csv")}>
                      <FileText className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPayments("xlsx")}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                  </Button>
                  </div>
                </div>
                {recentPayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento encontrado
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Reserva</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell className="font-medium">
                            {payment.reservations?.reservation_code || "-"}
                          </TableCell>
                          <TableCell>
                            {reservationGuestDisplayName(
                              {
                                guest: payment.reservations?.guest,
                                financial_responsible: payment.reservations?.financial_responsible,
                                guest_name: payment.reservations?.guest_name,
                              },
                              payment.reservations?.clients?.full_name || "-"
                            )}
                          </TableCell>
                          <TableCell>{payment.payment_method}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="carriers" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Portadores de Pagamento</h2>
                  <p className="text-muted-foreground">
                    Gerencie portadores e tipos de pagamento
                  </p>
                </div>
              </div>

              {/* Portadores */}
              <Card>
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Portadores</h3>
                  <Button
                    onClick={() => {
                      setSelectedCarrierId(undefined);
                      setCarrierDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Portador
                  </Button>
                </div>
                {isLoadingCarriers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : carriers.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Nenhum portador cadastrado
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Agência</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carriers.map((carrier: any) => (
                        <React.Fragment key={carrier.id}>
                          <TableRow>
                            <TableCell className="font-medium">{carrier.code}</TableCell>
                            <TableCell>{carrier.description}</TableCell>
                            <TableCell>{carrier.agency || "-"}</TableCell>
                            <TableCell>{carrier.account || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={carrier.is_active ? "default" : "secondary"}>
                                {carrier.is_active ? "Ativo" : "Inativo"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setExpandedCarrierId(
                                      expandedCarrierId === carrier.id ? null : carrier.id
                                    );
                                  }}
                                  title="Ver tipos de pagamento"
                                >
                                  {expandedCarrierId === carrier.id ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCarrierId(carrier.id);
                                    setCarrierDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setDeleteType("carrier");
                                    setDeleteId(carrier.id);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedCarrierId === carrier.id && (
                            <TableRow key={`${carrier.id}-expanded`}>
                              <TableCell colSpan={6} className="bg-muted/50 p-0">
                                <div className="p-4">
                                  <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-semibold">
                                      Tipos de Pagamento - {carrier.code}
                                    </h4>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPaymentTypeId(undefined);
                                        setSelectedCarrierId(carrier.id);
                                        setPaymentTypeDialogOpen(true);
                                      }}
                                    >
                                      <Plus className="h-4 w-4 mr-2" />
                                      Novo Tipo
                                    </Button>
                                  </div>
                                  {paymentTypes.filter((pt: any) => pt.carrier_id === carrier.id)
                                    .length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      Nenhum tipo de pagamento cadastrado para este portador
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {paymentTypes
                                        .filter((pt: any) => pt.carrier_id === carrier.id)
                                        .map((pt: any) => {
                                          const methodLabels: Record<string, string> = {
                                            deposit: "Depósito",
                                            pix: "PIX",
                                            credit_card: "Crédito",
                                            debit_card: "Débito",
                                          };
                                          const brandLabels: Record<string, string> = {
                                            visa: "Visa",
                                            mastercard: "Mastercard",
                                            elo: "Elo",
                                            amex: "Amex",
                                            hipercard: "Hipercard",
                                            diners: "Diners",
                                            discover: "Discover",
                                          };

                                          return (
                                            <div
                                              key={pt.id}
                                              className="flex items-center justify-between p-3 border rounded-lg bg-background"
                                            >
                                              <div className="flex-1">
                                                <div className="font-medium">{pt.name}</div>
                                                <div className="text-sm text-muted-foreground flex gap-4 mt-1">
                                                  <span>
                                                    {methodLabels[pt.payment_method] ||
                                                      pt.payment_method}
                                                  </span>
                                                  {pt.card_brand && (
                                                    <span>
                                                      Bandeira:{" "}
                                                      {brandLabels[pt.card_brand] || pt.card_brand}
                                                    </span>
                                                  )}
                                                  {(pt.payment_method === "credit_card" ||
                                                    pt.payment_method === "debit_card") && (
                                                    <span className="text-xs">
                                                      Taxa: {pt.card_fee}% | 2-6x:{" "}
                                                      {pt.installments_2_6_fee}% | 7-12x:{" "}
                                                      {pt.installments_7_12_fee}%
                                                    </span>
                                                  )}
                                                  <span>{pt.payment_days} dias</span>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Badge
                                                  variant={pt.is_active ? "default" : "secondary"}
                                                >
                                                  {pt.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    setSelectedPaymentTypeId(pt.id);
                                                    setSelectedCarrierId(carrier.id);
                                                    setPaymentTypeDialogOpen(true);
                                                  }}
                                                >
                                                  <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    setDeleteType("payment_type");
                                                    setDeleteId(pt.id);
                                                    setDeleteDialogOpen(true);
                                                  }}
                                                >
                                                  <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

            </TabsContent>

            <TabsContent value="service_fees" className="space-y-4">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Tipo da Taxa</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Gerencie as taxas e serviços que podem ser adicionados às reservas. A{" "}
                      <strong>taxa de limpeza</strong> só aparece aqui após ser configurada em Configurações → Serviços
                      do estabelecimento (hotel) ou em Unidades → Prédio → Serviços.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedServiceFeeId(undefined);
                      setSelectedServiceFeeData(undefined);
                      setServiceFeeDialogOpen(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Taxa de Serviço
                  </Button>
                </div>

                {/* Filtros */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Selecione o nome"
                      value={searchServiceFeeTerm}
                      onChange={(e) => setSearchServiceFeeTerm(e.target.value)}
                    />
                  </div>
                  <Select value={statusServiceFeeFilter} onValueChange={setStatusServiceFeeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativos</SelectItem>
                      <SelectItem value="inactive">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="bg-pink-500 hover:bg-pink-600 text-white border-pink-500">
                    Pesquisar
                  </Button>
                </div>

                {/* Lista de Taxas */}
                {isLoadingServiceFees ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground mb-2">
                      {(() => {
                        const filtered = serviceFees.filter((fee: any) => {
                          if (!serviceFeeVisibleInFinancialList(fee)) return false;
                          const matchesSearch = fee.name?.toLowerCase().includes(searchServiceFeeTerm.toLowerCase());
                          const matchesStatus = 
                            statusServiceFeeFilter === "all" ||
                            (statusServiceFeeFilter === "active" && fee.is_active) ||
                            (statusServiceFeeFilter === "inactive" && !fee.is_active);
                          return matchesSearch && matchesStatus;
                        });
                        return filtered.length > 0 
                          ? `${filtered.length} ${filtered.length === 1 ? 'Item Cadastrado' : 'Itens Cadastrados'}`
                          : 'Nenhum item cadastrado';
                      })()}
                    </div>
                    {serviceFees
                      .filter((fee: any) => {
                        if (!serviceFeeVisibleInFinancialList(fee)) return false;
                        const matchesSearch = fee.name?.toLowerCase().includes(searchServiceFeeTerm.toLowerCase());
                        const matchesStatus = 
                          statusServiceFeeFilter === "all" ||
                          (statusServiceFeeFilter === "active" && fee.is_active) ||
                          (statusServiceFeeFilter === "inactive" && !fee.is_active);
                        return matchesSearch && matchesStatus;
                      })
                      .map((fee: any) => (
                        <div
                          key={fee.id}
                          className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Input
                            value={fee.name}
                            readOnly
                            className="flex-1 bg-background"
                          />
                          <Switch
                            checked={fee.is_active}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateServiceFee({ id: fee.id, is_active: checked });
                              } catch (error) {
                                console.error(error);
                              }
                            }}
                            disabled={isUpdatingServiceFee}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedServiceFeeId(fee.id);
                                setSelectedServiceFeeData({
                                  name: fee.name,
                                  description: fee.description || "",
                                  is_active: fee.is_active,
                                });
                                setServiceFeeDialogOpen(true);
                              }}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setServiceFeeToDelete(fee.id);
                                setDeleteServiceFeeDialogOpen(true);
                              }}
                              title="Excluir"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="reports">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-2">Relatórios Financeiros</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Escolha o tipo de relatório abaixo. Use <strong>Reservas criadas</strong> para vendas do dia ou
                  intervalo (data de criação da reserva).
                </p>
                <Tabs
                  value={activeFinancialReport}
                  onValueChange={handleFinancialReportChange}
                  className="space-y-4"
                >
                  <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="reservas_criadas" className="gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      Reservas criadas
                    </TabsTrigger>
                    <TabsTrigger value="exportacoes">Faturamento e pagamentos</TabsTrigger>
                    <TabsTrigger value="fechamento">Fechamento</TabsTrigger>
                    <TabsTrigger value="cancelamentos">Cancelamentos</TabsTrigger>
                    <TabsTrigger value="noshow">No-show</TabsTrigger>
                  </TabsList>

                  <TabsContent value="reservas_criadas" className="mt-4 space-y-4">
                    <SoldReservationsReport />
                  </TabsContent>

                  <TabsContent value="exportacoes" className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="p-4 hover:shadow-md transition-shadow">
                        <h4 className="font-medium">Relatório de Faturamento</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Análise detalhada do faturamento por período
                        </p>
                        <div className="flex gap-2 mt-3">
                          <Button variant="outline" size="sm" onClick={() => handleExportRevenue("csv")}>
                            <FileText className="h-4 w-4 mr-2" />
                            CSV
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleExportRevenue("xlsx")}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </Button>
                        </div>
                      </Card>
                      <Card className="p-4 hover:shadow-md transition-shadow">
                        <h4 className="font-medium">Relatório de Pagamentos</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Lista completa de pagamentos recebidos
                        </p>
                        <div className="flex gap-2 mt-3">
                          <Button variant="outline" size="sm" onClick={() => handleExportPayments("csv")}>
                            <FileText className="h-4 w-4 mr-2" />
                            CSV
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleExportPayments("xlsx")}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </Button>
                        </div>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="fechamento" className="mt-4">
                    <ClosingReport />
                  </TabsContent>

                  <TabsContent value="cancelamentos" className="mt-4">
                    <CancellationReport />
                  </TabsContent>

                  <TabsContent value="noshow" className="mt-4">
                    <NoShowReport />
                  </TabsContent>
                </Tabs>
              </Card>
            </TabsContent>
          </Tabs>

          <PaymentCarrierDialog
            open={carrierDialogOpen}
            onOpenChange={setCarrierDialogOpen}
            onSuccess={() => {
              refetchCarriers();
              setCarrierDialogOpen(false);
              setSelectedCarrierId(undefined);
            }}
            carrierId={selectedCarrierId}
          />

          <PaymentTypeDialog
            open={paymentTypeDialogOpen}
            onOpenChange={setPaymentTypeDialogOpen}
            onSuccess={() => {
              refetchCarriers();
              setPaymentTypeDialogOpen(false);
              setSelectedPaymentTypeId(undefined);
              setSelectedCarrierId(undefined);
            }}
            paymentTypeId={selectedPaymentTypeId}
            carrierId={selectedCarrierId}
          />

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir{" "}
                  {deleteType === "carrier" ? "este portador" : "este tipo de pagamento"}? Esta
                  ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (!deleteId || !deleteType) return;
                    try {
                      if (deleteType === "carrier") {
                        await deleteCarrier(deleteId);
                      } else {
                        await deletePaymentType(deleteId);
                      }
                      setDeleteDialogOpen(false);
                      setDeleteId(null);
                      setDeleteType(null);
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                  className="bg-destructive text-destructive-foreground"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Dialog de Taxa de Serviço */}
          <ServiceFeeDialog
            open={serviceFeeDialogOpen}
            onOpenChange={setServiceFeeDialogOpen}
            serviceFeeId={selectedServiceFeeId}
            initialData={selectedServiceFeeData}
            onSuccess={async (data) => {
              if (selectedServiceFeeId) {
                try {
                  await updateServiceFee({
                    id: selectedServiceFeeId,
                    ...data,
                  });
                } catch (error) {
                  console.error(error);
                }
              } else {
                try {
                  await createServiceFee(data);
                } catch (error) {
                  console.error(error);
                }
              }
              setServiceFeeDialogOpen(false);
              setSelectedServiceFeeId(undefined);
              setSelectedServiceFeeData(undefined);
            }}
            isCreating={isCreatingServiceFee}
            isUpdating={isUpdatingServiceFee}
          />

          {/* Dialog de Confirmação de Exclusão de Taxa */}
          <AlertDialog open={deleteServiceFeeDialogOpen} onOpenChange={setDeleteServiceFeeDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir esta taxa de serviço? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (!serviceFeeToDelete) return;
                    try {
                      await deleteServiceFee(serviceFeeToDelete);
                      setDeleteServiceFeeDialogOpen(false);
                      setServiceFeeToDelete(null);
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                  className="bg-destructive text-destructive-foreground"
                  disabled={isDeletingServiceFee}
                >
                  {isDeletingServiceFee ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
};

export default Financial;
