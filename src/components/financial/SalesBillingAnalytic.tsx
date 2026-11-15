import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV, exportToXLSX, formatCurrency, toFiniteNumber } from "@/lib/financialUtils";
import type { BillingAnalyticRow, SalesAnalyticRow } from "@/lib/financial/operatingReportEngine";

type AnalyticMode = "vendas" | "faturamento";

type Props = {
  salesRows: SalesAnalyticRow[];
  billingRows: BillingAnalyticRow[];
  salesTotal: number;
  billingTotal: number;
  periodLabel: string;
};

export function SalesBillingAnalytic({ salesRows, billingRows, salesTotal, billingTotal, periodLabel }: Props) {
  const [mode, setMode] = useState<AnalyticMode>("vendas");

  const exportRows = useMemo(() => {
    if (mode === "vendas") {
      return salesRows.map((r) => ({
        Hotel: r.establishmentName,
        Reserva: r.reservationDisplay,
        Criacao: r.createdAtLabel,
        Chegada: r.checkinLabel,
        Partida: r.checkoutLabel,
        Status: r.statusLabel,
        Empresa: r.companyOrChannel,
        Diarias: r.nights,
        Receita: r.gross,
        Diaria_media: r.adr,
        Liquido: r.net,
      }));
    }
    return billingRows.map((r) => ({
      Estabelecimento: r.establishmentLabel,
      Reserva: r.reservationDisplay,
      ID_reserva: r.identificationNumber,
      Hospede: r.guestName,
      Data_da_diaria: r.nightDateLabel,
      Codigo_tarifario: r.rateCodeLabel,
      Tipo_tarifa: r.rateTypeLabel,
      Lancamento_origem: r.originLabel,
      Criacao: r.createdAtLabel,
      Chegada: r.checkinLabel,
      Partida: r.checkoutLabel,
      Status: r.statusLabel,
      Empresa: r.companyName,
      Valor_atribuido_diaria: r.nightAttributedAmount,
      Valor_no_periodo: r.periodAmount,
    }));
  }, [mode, salesRows, billingRows]);

  const onExport = async (kind: "csv" | "xlsx") => {
    const name = `analitico-${mode}-${periodLabel.replace(/\//g, "-")}`;
    if (kind === "xlsx") await exportToXLSX(exportRows, name, "Analitico");
    else exportToCSV(exportRows, name);
    toast.success("Analítico exportado.");
  };

  const totalLabel = mode === "vendas" ? formatCurrency(salesTotal) : formatCurrency(billingTotal);
  const rowCount = mode === "vendas" ? salesRows.length : billingRows.length;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Analítico</h3>
          <p className="text-xs text-muted-foreground">
            Detalhe linha a linha conforme o critério selecionado ({periodLabel}).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <Label className="text-xs text-muted-foreground">Visão</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as AnalyticMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendas">Vendas</SelectItem>
                <SelectItem value="faturamento">Faturamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => onExport("csv")}>
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport("xlsx")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {rowCount === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro no período para esta visão.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          {mode === "vendas" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead className="text-right">Reserva</TableHead>
                  <TableHead>Criação</TableHead>
                  <TableHead>Chegada</TableHead>
                  <TableHead>Partida</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Diárias</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Diária média</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap font-medium">{r.establishmentName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.reservationDisplay}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.createdAtLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.checkinLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.checkoutLabel}</TableCell>
                    <TableCell className="text-xs">{r.statusLabel}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{r.companyOrChannel || "—"}</TableCell>
                    <TableCell className="text-right">{r.nights}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.gross)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.adr)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.net)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={8}>Total conferido ({salesRows.length} reserva(s))</TableCell>
                  <TableCell className="text-right">{totalLabel}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead className="text-right">Reserva</TableHead>
                  <TableHead className="text-right">ID reserva</TableHead>
                  <TableHead>Hóspede principal</TableHead>
                  <TableHead>Data da diária</TableHead>
                  <TableHead>Código tarifário</TableHead>
                  <TableHead>Tipo de tarifa</TableHead>
                  <TableHead>Lançamento de origem</TableHead>
                  <TableHead>Criação</TableHead>
                  <TableHead>Chegada</TableHead>
                  <TableHead>Partida</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Valor atribuído à diária</TableHead>
                  <TableHead className="text-right">Valor considerado no período</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billingRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{r.establishmentLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.reservationDisplay}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.identificationNumber}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">{r.guestName}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.nightDateLabel}</TableCell>
                    <TableCell className="text-xs">{r.rateCodeLabel}</TableCell>
                    <TableCell className="text-xs">{r.rateTypeLabel}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{r.originLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.createdAtLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.checkinLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.checkoutLabel}</TableCell>
                    <TableCell className="text-xs">{r.statusLabel}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{r.companyName}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.nightAttributedAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.periodAmount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={13}>
                    Total conferido ({toFiniteNumber(billingRows.length)} linha(s) de diária)
                  </TableCell>
                  <TableCell colSpan={2} className="text-right">
                    {totalLabel}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}