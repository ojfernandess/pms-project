/**
 * Relatório de No-Show
 * Mostra análise de no-shows: receita prevista vs recuperada em multas
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
import { Loader2, Download, TrendingDown, TrendingUp, UserX } from "lucide-react";
import { exportToCSV, exportToXLSX } from "@/lib/financialUtils";

interface NoShowReportData {
  reservation_id: string;
  reservation_code: string;
  guest_name: string;
  checkin_date: string;
  checkout_date: string;
  total_amount: number;
  no_show_at: string;
  cancellation_penalty: number;
  channel: string;
  days_after_checkin: number;
}

export const NoShowReport = () => {
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
    queryKey: ["no_show_report", establishmentId, startDate, endDate],
    queryFn: async () => {
      if (!establishmentId) return null;

      // Buscar reservas com no-show no período
      const { data: noShows, error } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          total_amount,
          cancellation_penalty,
          no_show_at,
          channel,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name)
        `)
        .eq("establishment_id", establishmentId)
        .eq("status", "noshow")
        .not("no_show_at", "is", null)
        .gte("no_show_at", `${startDate}T00:00:00`)
        .lte("no_show_at", `${endDate}T23:59:59`)
        .order("no_show_at", { ascending: false });

      if (error) throw error;

      // Processar dados
      const processed: NoShowReportData[] = (noShows || []).map((ns: any) => {
        const checkinDate = new Date(ns.checkin_date);
        const noShowDate = new Date(ns.no_show_at);
        const daysAfterCheckin = Math.ceil(
          (noShowDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          reservation_id: ns.id,
          reservation_code: ns.reservation_code,
          guest_name: ns.guest?.full_name || ns.financial_responsible?.full_name || "Hóspede",
          checkin_date: ns.checkin_date,
          checkout_date: ns.checkout_date,
          total_amount: Number(ns.total_amount || 0),
          no_show_at: ns.no_show_at,
          cancellation_penalty: Number(ns.cancellation_penalty || 0),
          channel: ns.channel || "direct",
          days_after_checkin: daysAfterCheckin,
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
          total_expected: acc.total_expected + item.total_amount,
          total_recovered: acc.total_recovered + item.cancellation_penalty,
          total_lost: acc.total_lost + (item.total_amount - item.cancellation_penalty),
          count: acc.count + 1,
        }),
        {
          total_expected: 0,
          total_recovered: 0,
          total_lost: 0,
          count: 0,
        }
      )
    : null;

  // Agrupar por canal
  const byChannel = reportData
    ? reportData.reduce((acc, item) => {
        const channel = item.channel || "direct";
        if (!acc[channel]) {
          acc[channel] = {
            count: 0,
            expected: 0,
            recovered: 0,
            lost: 0,
          };
        }
        acc[channel].count += 1;
        acc[channel].expected += item.total_amount;
        acc[channel].recovered += item.cancellation_penalty;
        acc[channel].lost += item.total_amount - item.cancellation_penalty;
        return acc;
      }, {} as Record<string, { count: number; expected: number; recovered: number; lost: number }>)
    : {};

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!reportData || reportData.length === 0) return;

    const exportData = reportData.map((item) => ({
      codigo_reserva: item.reservation_code,
      hospede: item.guest_name,
      data_checkin: formatDate(item.checkin_date),
      data_checkout: formatDate(item.checkout_date),
      data_no_show: formatDate(item.no_show_at),
      dias_apos_checkin: item.days_after_checkin,
      receita_prevista: item.total_amount.toFixed(2),
      multa_aplicada: item.cancellation_penalty.toFixed(2),
      receita_recuperada: item.cancellation_penalty.toFixed(2),
      valor_perdido: (item.total_amount - item.cancellation_penalty).toFixed(2),
      canal: item.channel,
    }));

    const filename = `relatorio_no_show_${startDate}_${endDate}`;
    if (format === "xlsx") {
      await exportToXLSX(exportData, filename, "No-Show");
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
                <p className="text-sm text-muted-foreground">No-Shows</p>
                <p className="text-2xl font-bold mt-1">{totals.count}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total de ocorrências
                </p>
              </div>
              <UserX className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Prevista</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totals.total_expected)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Valor total das reservas
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-600" />
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
                  {totals.total_expected > 0
                    ? ((totals.total_recovered / totals.total_expected) * 100).toFixed(1)
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
                  {totals.total_expected > 0
                    ? ((totals.total_lost / totals.total_expected) * 100).toFixed(1)
                    : 0}
                  % de perda
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Análise por Canal */}
      {Object.keys(byChannel).length > 0 && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold">Análise por Canal</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Receita Prevista</TableHead>
                <TableHead>Recuperado</TableHead>
                <TableHead>Perdido</TableHead>
                <TableHead>Taxa Recuperação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byChannel).map(([channel, data]) => (
                <TableRow key={channel}>
                  <TableCell className="font-medium">{channel}</TableCell>
                  <TableCell>{data.count}</TableCell>
                  <TableCell>{formatCurrency(data.expected)}</TableCell>
                  <TableCell className="text-green-600">
                    {formatCurrency(data.recovered)}
                  </TableCell>
                  <TableCell className="text-red-600">
                    {formatCurrency(data.lost)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        data.expected > 0 && data.recovered / data.expected >= 0.5
                          ? "default"
                          : "destructive"
                      }
                    >
                      {data.expected > 0
                        ? ((data.recovered / data.expected) * 100).toFixed(1)
                        : 0}
                      %
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Detalhes dos No-Shows</h3>
        </div>
        {!reportData || reportData.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum no-show encontrado no período
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Hóspede</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>No-Show em</TableHead>
                <TableHead>Dias Após</TableHead>
                <TableHead>Receita Prevista</TableHead>
                <TableHead>Multa</TableHead>
                <TableHead>Perdido</TableHead>
                <TableHead>Canal</TableHead>
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
                    <TableCell>{formatDate(item.no_show_at)}</TableCell>
                    <TableCell>{item.days_after_checkin} dias</TableCell>
                    <TableCell>{formatCurrency(item.total_amount)}</TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {formatCurrency(item.cancellation_penalty)}
                    </TableCell>
                    <TableCell className="text-red-600 font-semibold">
                      {formatCurrency(lost)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.channel}</Badge>
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

