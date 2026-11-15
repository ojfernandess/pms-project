/**
 * Relatório de Reservas Vendidas — reservas criadas no período (data de criação).
 */

import { useMemo, useState } from "react";
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
import { formatCurrency, exportToCSV, exportToXLSX } from "@/lib/financialUtils";
import { formatDate } from "@/lib/reservationUtils";
import { formatReservationChannelOrigin } from "@/lib/reservationChannelDisplay";
import { Loader2, Download, ShoppingBag, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";

export interface SoldReservationReportRow {
  reservation_id: string;
  identification_number: number | null;
  reservation_code: string;
  created_at: string;
  guest_name: string;
  establishment_name: string;
  category_name: string;
  room_label: string;
  checkin_date: string;
  checkout_date: string;
  status: string;
  channel_origin: string;
  total_amount: number;
  paid_amount: number;
  service_fees_total: number;
  total_with_fees: number;
  balance_due: number;
  payment_status: string | null;
  is_ota: boolean;
  is_bukly: boolean;
  ota_record_id: string | null;
  ota_reservation_code: string | null;
  ota_channel_id: string | null;
  ota_channel_name: string | null;
  ota_cm_booking_id: string | null;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function serviceFeesTotal(fees: Array<{ amount?: unknown; quantity?: unknown }> | null | undefined): number {
  if (!fees?.length) return 0;
  return fees.reduce((sum, fee) => sum + Number(fee.amount || 0) * Number(fee.quantity || 1), 0);
}

const statusLabels: Record<string, string> = {
  confirmed: "Confirmada",
  pending: "Pendente",
  unpaid: "Não paga",
  preregistration: "Pré-reserva",
  checkedin: "Check-in",
  checkedout: "Check-out",
  cancelled: "Cancelada",
  noshow: "No-show",
  blocked: "Bloqueada",
};

export const SoldReservationsReport = () => {
  const navigate = useNavigate();
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();
  const establishmentName = selectedEstablishment?.name ?? "—";

  const [startDate, setStartDate] = useState(todayIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["sold_reservations_report", establishmentId, startDate, endDate],
    queryFn: async (): Promise<SoldReservationReportRow[]> => {
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id,
          identification_number,
          reservation_code,
          created_at,
          checkin_date,
          checkout_date,
          status,
          channel,
          origin,
          total_amount,
          paid_amount,
          payment_status,
          guest_name,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name),
          rooms(room_number, name),
          room_categories(name),
          reservation_service_fees(amount, quantity),
          ota_reservations(
            id,
            ota_channel_id,
            ota_reservation_code,
            ota_cm_booking_id,
            ota_source_channel_name,
            ota_segment,
            ota_channels(id, name, channel_manager_type)
          )
        `
        )
        .eq("establishment_id", establishmentId)
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59.999`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((r: Record<string, unknown>) => {
        const otaList = r.ota_reservations as Array<Record<string, unknown>> | null | undefined;
        const ota = Array.isArray(otaList) ? otaList[0] : otaList;
        const otaChannels = ota?.ota_channels as Record<string, unknown> | null | undefined;
        const cmType = String(otaChannels?.channel_manager_type ?? "").toLowerCase();

        const guest = r.guest as { full_name?: string } | null;
        const financial = r.financial_responsible as { full_name?: string } | null;
        const rooms = r.rooms as { room_number?: string; name?: string } | null;
        const category = r.room_categories as { name?: string } | null;
        const fees = r.reservation_service_fees as Array<{ amount?: unknown; quantity?: unknown }> | null;

        const totalAmount = Number(r.total_amount || 0);
        const paidAmount = Number(r.paid_amount || 0);
        const feesTotal = serviceFeesTotal(fees);
        const totalWithFees = totalAmount + feesTotal;

        const rowForName = {
          guest_name: r.guest_name,
          guest,
          financial_responsible: financial,
        };

        return {
          reservation_id: String(r.id),
          identification_number:
            r.identification_number != null ? Number(r.identification_number) : null,
          reservation_code: String(r.reservation_code || ""),
          created_at: String(r.created_at || ""),
          guest_name: reservationGuestDisplayName(rowForName) || "—",
          establishment_name: establishmentName,
          category_name: category?.name || "—",
          room_label: rooms?.name || rooms?.room_number || "—",
          checkin_date: String(r.checkin_date || ""),
          checkout_date: String(r.checkout_date || ""),
          status: String(r.status || ""),
          channel_origin: formatReservationChannelOrigin({
            channel: (r.channel as string) ?? null,
            origin: (r.origin as string) ?? null,
            ota_reservations: ota
              ? [
                  {
                    ota_source_channel_name: (ota.ota_source_channel_name as string) ?? null,
                    ota_reservation_code: (ota.ota_reservation_code as string) ?? null,
                    ota_segment: (ota.ota_segment as string) ?? null,
                    ota_channels: otaChannels
                      ? {
                          name: otaChannels.name as string | undefined,
                          channel_manager_type: otaChannels.channel_manager_type as string | undefined,
                        }
                      : null,
                  },
                ]
              : null,
          }),
          total_amount: totalAmount,
          paid_amount: paidAmount,
          service_fees_total: feesTotal,
          total_with_fees: totalWithFees,
          balance_due: Math.max(0, totalWithFees - paidAmount),
          payment_status: r.payment_status != null ? String(r.payment_status) : null,
          is_ota: Boolean(ota),
          is_bukly: cmType === "bukly" || String(otaChannels?.name ?? "").toLowerCase().includes("bukly"),
          ota_record_id: ota?.id != null ? String(ota.id) : null,
          ota_reservation_code: ota?.ota_reservation_code != null ? String(ota.ota_reservation_code) : null,
          ota_channel_id: ota?.ota_channel_id != null ? String(ota.ota_channel_id) : null,
          ota_channel_name: otaChannels?.name != null ? String(otaChannels.name) : null,
          ota_cm_booking_id: ota?.ota_cm_booking_id != null ? String(ota.ota_cm_booking_id) : null,
        };
      });
    },
    enabled: !!establishmentId,
  });

  const totals = useMemo(() => {
    if (!reportData?.length) {
      return { count: 0, totalSold: 0, totalPaid: 0, totalPending: 0 };
    }
    return reportData.reduce(
      (acc, row) => ({
        count: acc.count + 1,
        totalSold: acc.totalSold + row.total_with_fees,
        totalPaid: acc.totalPaid + row.paid_amount,
        totalPending: acc.totalPending + row.balance_due,
      }),
      { count: 0, totalSold: 0, totalPaid: 0, totalPending: 0 }
    );
  }, [reportData]);

  const handleExport = async (exportFormat: "csv" | "xlsx") => {
    if (!reportData?.length) return;

    const exportData = reportData.map((item) => ({
      data_criacao: format(parseISO(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      localizador: item.reservation_code,
      id_reserva: item.reservation_id,
      numero_identificacao: item.identification_number ?? "",
      hospede: item.guest_name,
      estabelecimento: item.establishment_name,
      categoria: item.category_name,
      quarto: item.room_label,
      checkin: formatDate(item.checkin_date),
      checkout: formatDate(item.checkout_date),
      status: statusLabels[item.status] || item.status,
      origem_canal: item.channel_origin,
      valor_hospedagem: item.total_amount.toFixed(2),
      taxas_extras: item.service_fees_total.toFixed(2),
      valor_total: item.total_with_fees.toFixed(2),
      valor_pago: item.paid_amount.toFixed(2),
      saldo_pendente: item.balance_due.toFixed(2),
      status_pagamento: item.payment_status ?? "",
      ota: item.is_ota ? "Sim" : "Não",
      bukly: item.is_bukly ? "Sim" : "Não",
      id_ota_registro: item.ota_record_id ?? "",
      codigo_ota: item.ota_reservation_code ?? "",
      id_canal_ota: item.ota_channel_id ?? "",
      nome_canal: item.ota_channel_name ?? "",
      id_cm_booking: item.ota_cm_booking_id ?? "",
    }));

    const filename = `reservas_vendidas_${startDate}_${endDate}`;
    if (exportFormat === "xlsx") {
      await exportToXLSX(exportData, filename, "Reservas vendidas");
    } else {
      exportToCSV(exportData, filename);
    }
  };

  const openReservation = (code: string) => {
    const numericId = selectedEstablishment?.numeric_id;
    if (numericId && code) {
      navigate(`/${numericId}/reservas/${code}`);
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
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <div>
            <Label htmlFor="sold-start-date">Data inicial (criação)</Label>
            <Input
              id="sold-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sold-end-date">Data final (criação)</Label>
            <Input
              id="sold-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} disabled={!reportData?.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("xlsx")} disabled={!reportData?.length}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Lista reservas cuja <strong>data de criação</strong> está no período (vendas do dia ou intervalo).
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Reservas vendidas</p>
          <p className="text-2xl font-bold mt-1">{totals.count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Valor total (c/ taxas)</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totals.totalSold)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total recebido</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(totals.totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Saldo pendente</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{formatCurrency(totals.totalPending)}</p>
        </Card>
      </div>

      {!reportData?.length ? (
        <Card className="p-8 text-center text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Nenhuma reserva criada no período selecionado.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Criada em</TableHead>
                  <TableHead className="whitespace-nowrap">Localizador</TableHead>
                  <TableHead className="whitespace-nowrap">ID #</TableHead>
                  <TableHead className="whitespace-nowrap">Hóspede</TableHead>
                  <TableHead className="whitespace-nowrap">Estabelecimento</TableHead>
                  <TableHead className="whitespace-nowrap">Categoria</TableHead>
                  <TableHead className="whitespace-nowrap">Quarto</TableHead>
                  <TableHead className="whitespace-nowrap">Check-in / out</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Canal</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Valores</TableHead>
                  <TableHead className="whitespace-nowrap">OTA / Bukly</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((row) => (
                  <TableRow key={row.reservation_id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(parseISO(row.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">{row.reservation_code}</TableCell>
                    <TableCell className="text-xs">
                      {row.identification_number != null ? `#${row.identification_number}` : "—"}
                      <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]" title={row.reservation_id}>
                        {row.reservation_id.slice(0, 8)}…
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate" title={row.guest_name}>
                      {row.guest_name}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate" title={row.establishment_name}>
                      {row.establishment_name}
                    </TableCell>
                    <TableCell>{row.category_name}</TableCell>
                    <TableCell>{row.room_label}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(row.checkin_date)}
                      <br />
                      {formatDate(row.checkout_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {statusLabels[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[130px]">{row.channel_origin}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      <div className="font-semibold">{formatCurrency(row.total_with_fees)}</div>
                      <div className="text-muted-foreground">Pago: {formatCurrency(row.paid_amount)}</div>
                      {row.balance_due > 0 && (
                        <div className="text-amber-600">Falta: {formatCurrency(row.balance_due)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] max-w-[200px]">
                      {row.is_ota ? (
                        <div className="space-y-0.5">
                          {row.is_bukly && (
                            <Badge variant="secondary" className="text-[9px] mb-1">
                              Bukly
                            </Badge>
                          )}
                          {row.ota_record_id && (
                            <p className="font-mono truncate" title={row.ota_record_id}>
                              <span className="text-muted-foreground">ID OTA:</span> {row.ota_record_id}
                            </p>
                          )}
                          {row.ota_reservation_code && (
                            <p>
                              <span className="text-muted-foreground">Cód. OTA:</span> {row.ota_reservation_code}
                            </p>
                          )}
                          {row.ota_channel_id && (
                            <p className="font-mono truncate" title={row.ota_channel_id}>
                              <span className="text-muted-foreground">ID canal:</span> {row.ota_channel_id}
                            </p>
                          )}
                          {row.ota_channel_name && (
                            <p className="truncate" title={row.ota_channel_name}>
                              {row.ota_channel_name}
                            </p>
                          )}
                          {row.ota_cm_booking_id && (
                            <p className="truncate" title={row.ota_cm_booking_id}>
                              <span className="text-muted-foreground">CM booking:</span> {row.ota_cm_booking_id}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Abrir reserva"
                        onClick={() => openReservation(row.reservation_code)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};