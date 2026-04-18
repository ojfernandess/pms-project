/**
 * Relatório de Cancelamentos
 * Mostra análise de cancelamentos: valor perdido vs recuperado em multas
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { formatCurrency } from "@/lib/financialUtils";
import { formatDate } from "@/lib/reservationUtils";
import { Loader2, Download, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { exportToCSV, exportToXLSX } from "@/lib/financialUtils";

interface CancellationReportData {
  reservation_id: string;
  reservation_code: string;
  guest_name: string;
  checkin_date: string;
  checkout_date: string;
  total_amount: number;
  cancellation_date: string;
  cancelled_at: string;
  cancellation_reason: string;
  cancellation_penalty: number;
  within_free_period: boolean;
  channel: string;
  days_before_checkin: number;
}

export const CancellationReport = () => {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();
  
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["cancellation_report", establishmentId, startDate, endDate],
    queryFn: async () => {
      if (!establishmentId) return null;

      // Buscar reservas canceladas no período
      const { data: cancellations, error } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          total_amount,
          cancellation_penalty,
          cancellation_reason,
          cancelled_at,
          cancellation_calculation_details,
          channel,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name)
        `)
        .eq("establishment_id", establishmentId)
        .eq("status", "cancelled")
        .gte("cancelled_at", `${startDate}T00:00:00`)
        .lte("cancelled_at", `${endDate}T23:59:59`)
        .order("cancelled_at", { ascending: false });

      if (error) throw error;

      // Processar dados
      const processed: CancellationReportData[] = (cancellations || []).map((c: any) => {
        const checkinDate = new Date(c.checkin_date);
        const cancellationDate = new Date(c.cancelled_at);
        const daysBeforeCheckin = Math.ceil(
          (checkinDate.getTime() - cancellationDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Verificar se estava dentro do período gratuito
        const calculationDetails = c.cancellation_calculation_details || {};
        const withinFreePeriod = calculationDetails.withinFreePeriod === true;

        return {
          reservation_id: c.id,
          reservation_code: c.reservation_code,
          guest_name: c.guest?.full_name || c.financial_responsible?.full_name || "Hóspede",
          checkin_date: c.checkin_date,
          checkout_date: c.checkout_date,
          total_amount: Number(c.total_amount || 0),
          cancellation_date: c.cancelled_at,
          cancelled_at: c.cancelled_at,
          cancellation_reason: c.cancellation_reason || "",
          cancellation_penalty: Number(c.cancellation_penalty || 0),
          within_free_period: withinFreePeriod,
          channel: c.channel || "direct",
          days_before_checkin: daysBeforeCheckin,
        };
      });

      return processed;
    },
    enabled: !!establishmentId,
  });

  // Calcular totais
  const totals = reportData
    ? reportData.reduce(
        (acc, item) => ({
          total_cancelled: acc.total_cancelled + item.total_amount,
          total_recovered: acc.total_recovered + item.cancellation_penalty,
          total_lost: acc.total_lost + (item.total_amount - item.cancellation_penalty),
          within_free_period: acc.within_free_period + (item.within_free_period ? 1 : 0),
          outside_free_period: acc.outside_free_period + (item.within_free_period ? 0 : 1),
        }),
        {
          total_cancelled: 0,
          total_recovered: 0,
          total_lost: 0,
          within_free_period: 0,
          outside_free_period: 0,
        }
      )
    : null;

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!reportData || reportData.length === 0) return;

    const exportData = reportData.map((item) => ({
      codigo_reserva: item.reservation_code,
      hospede: item.guest_name,
      data_checkin: formatDate(item.checkin_date),
      data_checkout: formatDate(item.checkout_date),
      valor_total: item.total_amount.toFixed(2),
      data_cancelamento: formatDate(item.cancellation_date),
      dias_antes_checkin: item.days_before_checkin,
      dentro_prazo_gratuito: item.within_free_period ? "Sim" : "Não",
      multa_aplicada: item.cancellation_penalty.toFixed(2),
      valor_perdido: (item.total_amount - item.cancellation_penalty).toFixed(2),
      canal: item.channel,
      motivo: item.cancellation_reason || "-",
    }));

    const filename = `relatorio_cancelamentos_${startDate}_${endDate}`;
    if (format === "xlsx") {
      await exportToXLSX(exportData, filename, "Cancelamentos");
    } else {
      exportToCSV(exportData, filename);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div>
            <Label htmlFor="start-date">Data Inicial</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="end-date">Data Final</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("xlsx")}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Cards de Resumo */}
      {totals && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cancelado</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totals.total_cancelled)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {reportData?.length || 0} cancelamentos
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recuperado em Multas</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {formatCurrency(totals.total_recovered)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.total_cancelled > 0
                    ? ((totals.total_recovered / totals.total_cancelled) * 100).toFixed(1)
                    : 0}
                  % de recuperação
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Perdido</p>
                <p className="text-2xl font-bold mt-1 text-red-600">
                  {formatCurrency(totals.total_lost)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.total_cancelled > 0
                    ? ((totals.total_lost / totals.total_cancelled) * 100).toFixed(1)
                    : 0}
                  % de perda
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fora do Prazo</p>
                <p className="text-2xl font-bold mt-1">{totals.outside_free_period}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.within_free_period} dentro do prazo
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Detalhes dos Cancelamentos</h3>
        </div>
        {!reportData || reportData.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum cancelamento encontrado no período
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Hóspede</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Cancelado em</TableHead>
                <TableHead>Dias Antes</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Multa</TableHead>
                <TableHead>Perdido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.map((item) => {
                const lost = item.total_amount - item.cancellation_penalty;
                return (
                  <TableRow key={item.reservation_id}>
                    <TableCell className="font-medium">{item.reservation_code}</TableCell>
                    <TableCell>{item.guest_name}</TableCell>
                    <TableCell>{formatDate(item.checkin_date)}</TableCell>
                    <TableCell>{formatDate(item.cancellation_date)}</TableCell>
                    <TableCell>{item.days_before_checkin} dias</TableCell>
                    <TableCell>{formatCurrency(item.total_amount)}</TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {formatCurrency(item.cancellation_penalty)}
                    </TableCell>
                    <TableCell className="text-red-600 font-semibold">
                      {formatCurrency(lost)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.within_free_period ? "secondary" : "destructive"}
                      >
                        {item.within_free_period ? "Dentro do Prazo" : "Fora do Prazo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

