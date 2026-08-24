import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Loader2, FileSpreadsheet, Settings2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { formatCurrency, exportToXLSX, exportToCSV } from "@/lib/financialUtils";
import {
  currentCalendarMonth,
  validateReportFilters,
  type BillingMode,
  type GroupBy,
  type MonthRank,
} from "@/lib/financial/operatingReportEngine";
import { useOperatingFinancialReport, useFinancialDailyResult } from "@/hooks/useOperatingFinancialReport";
import {
  defaultDailyLinesFromEstablishments,
  useFinancialDailyResultLines,
} from "@/hooks/useFinancialDailyResultLines";
import { DailyResultLinesDialog } from "@/components/financial/DailyResultLinesDialog";
import type { OperatingFilters, TotalsView } from "@/services/financial/operatingReportService";

function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function rankLabel(rank: MonthRank): string {
  if (rank === "melhor") return "Melhor";
  if (rank === "pior") return "Pior";
  return "Intermediário";
}

function rankVariant(rank: MonthRank): "success" | "destructive" | "secondary" {
  if (rank === "melhor") return "success";
  if (rank === "pior") return "destructive";
  return "secondary";
}

function MetricGrid({ view }: { view: TotalsView }) {
  const cells = [
    { label: "Faturamento bruto", value: formatCurrency(view.gross) },
    { label: "Comissão OTA/canais", value: formatCurrency(view.channelCommission) },
    { label: "Valor do proprietário", value: formatCurrency(view.ownerShare) },
    { label: "Líquido", value: formatCurrency(view.net) },
    { label: "Reservas", value: String(view.reservationCount) },
    { label: "Diárias faturadas", value: view.billedNights.toFixed(0) },
    { label: "ADR", value: formatCurrency(view.adr) },
    { label: "Ocupação", value: `${view.occupancy.toFixed(1)}%` },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label}>
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-sm font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function OperatingFinancialReport() {
  const { establishments, selectedEstablishment } = useEstablishment();
  const defaultPeriod = currentCalendarMonth();
  const defaultEstIds = selectedEstablishment?.id
    ? [selectedEstablishment.id]
    : establishments.map((e) => e.id);

  const [draft, setDraft] = useState({
    startDate: defaultPeriod.startDate,
    endDate: defaultPeriod.endDate,
    establishmentIds: defaultEstIds,
    groupBy: "day" as GroupBy,
    billingMode: "stay_nights" as BillingMode,
    compareYoy: false,
  });
  const [applied, setApplied] = useState<OperatingFilters | null>(null);
  const [dailyDay, setDailyDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [appliedDailyDay, setAppliedDailyDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [linesOpen, setLinesOpen] = useState(false);

  useEffect(() => {
    if (!draft.establishmentIds.length && establishments.length) {
      const ids = selectedEstablishment?.id ? [selectedEstablishment.id] : establishments.map((e) => e.id);
      setDraft((d) => ({ ...d, establishmentIds: ids }));
    }
  }, [establishments, selectedEstablishment?.id, draft.establishmentIds.length]);

  const reportQuery = useOperatingFinancialReport(applied);
  const companyId = selectedEstablishment?.company_id || establishments[0]?.company_id || null;
  const { data: savedLines } = useFinancialDailyResultLines(companyId);

  const dailyLines = useMemo(() => {
    if (savedLines && savedLines.length > 0) return savedLines;
    const selected = establishments.filter((e) => (applied?.establishmentIds.length ? applied.establishmentIds : draft.establishmentIds).includes(e.id));
    const source = selected.length ? selected : establishments;
    return defaultDailyLinesFromEstablishments(source.map((e) => ({ id: e.id, name: e.name })));
  }, [savedLines, establishments, applied, draft.establishmentIds]);

  const dailyQuery = useFinancialDailyResult(appliedDailyDay, dailyLines, true);

  const applyMain = () => {
    const err = validateReportFilters(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setApplied({ ...draft });
  };

  const report = reportQuery.data;

  const exportBuckets = async (kind: "csv" | "xlsx") => {
    if (!report) return;
    const rows = report.period.buckets.map((b) => ({
      Periodo: b.label,
      Inicio: b.startDate,
      Fim: b.endDate,
      Faturamento_bruto: b.billing.gross,
      Comissao_canais: b.billing.channelCommission,
      Valor_proprietario: b.billing.ownerShare,
      Liquido: b.billing.net,
      Diarias: b.billing.billedNights,
      Reservas: b.billing.reservationCount,
      ADR: adrSafe(b.billing.gross, b.billing.billedNights),
      Ocupacao: b.availableNights ? (b.billing.billedNights / b.availableNights) * 100 : 0,
    }));
    const name = `relatorio-operacional-${applied?.startDate}-${applied?.endDate}`;
    if (kind === "xlsx") await exportToXLSX(rows, name, "Relatorio");
    else exportToCSV(rows, name);
    toast.success("Relatório exportado.");
  };

  const exportDaily = async (kind: "csv" | "xlsx") => {
    const rows = (dailyQuery.data || []).flatMap((r) => [
      { Linha: r.nightsLabel, Valor: r.nights },
      { Linha: r.revenueLabel, Valor: r.gross },
    ]);
    const name = `resultado-do-dia-${appliedDailyDay}`;
    if (kind === "xlsx") await exportToXLSX(rows, name, "Resultado");
    else exportToCSV(rows, name);
    toast.success("Resultado do dia exportado.");
  };

  const selectedNames = establishments
    .filter((e) => draft.establishmentIds.includes(e.id))
    .map((e) => e.name)
    .join(", ");

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Filtros do relatório</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Início</Label>
            <Input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            />
          </div>
          <div>
            <Label>Fim</Label>
            <Input
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            />
          </div>
          <div>
            <Label>Estabelecimentos</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">{selectedNames || "Selecione"}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="max-h-56 space-y-2 overflow-auto">
                  {establishments.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.establishmentIds.includes(e.id)}
                        onCheckedChange={(checked) => {
                          setDraft((d) => ({
                            ...d,
                            establishmentIds: checked
                              ? [...d.establishmentIds, e.id]
                              : d.establishmentIds.filter((id) => id !== e.id),
                          }));
                        }}
                      />
                      {e.name}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Agrupamento</Label>
            <Select
              value={draft.groupBy}
              onValueChange={(v: GroupBy) => setDraft((d) => ({ ...d, groupBy: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="week">Semana (segunda)</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Critério de faturamento</Label>
            <Select
              value={draft.billingMode}
              onValueChange={(v: BillingMode) => setDraft((d) => ({ ...d, billingMode: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stay_nights">Diárias do período</SelectItem>
                <SelectItem value="payment_attribution">Pagamento / check-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="yoy"
                checked={draft.compareYoy}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, compareYoy: v }))}
              />
              <Label htmlFor="yoy">Comparar ano anterior</Label>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={applyMain} disabled={reportQuery.isFetching}>
            {reportQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Atualizar relatório
          </Button>
        </div>
      </Card>

      {!applied ? (
        <p className="text-sm text-muted-foreground">Defina os filtros e clique em Atualizar relatório.</p>
      ) : reportQuery.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar o relatório.</p>
      ) : reportQuery.isLoading || !report ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-1">Resumo dos 3 meses anteriores</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Meses cheios anteriores a {applied.startDate.slice(0, 7)}, mesmo critério e estabelecimentos.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              {report.previousMonths.map((m) => (
                <Card key={m.key} className="p-4 border-slate-200">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium capitalize">{m.label}</p>
                    <Badge variant={rankVariant(m.rank)}>{rankLabel(m.rank)}</Badge>
                  </div>
                  <MetricGrid view={m.view} />
                </Card>
              ))}
              <Card className="p-4 border-slate-200">
                <p className="mb-2 font-medium">Total 3 meses</p>
                <MetricGrid view={report.previousMonthsTotal} />
              </Card>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-1">Indicadores de vendas</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Reservas criadas no intervalo (estadia inteira, sem exigir pagamento).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Quantidade de vendas</p>
                  <p className="text-2xl font-bold">{report.period.sales.salesCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diárias das vendas</p>
                  <p className="text-2xl font-bold">{report.period.sales.salesNights}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receita bruta das vendas</p>
                  <p className="text-2xl font-bold">{formatCurrency(report.period.sales.salesGross)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reservas no faturamento</p>
                  <p className="text-2xl font-bold">{report.period.billing.reservationCount}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-1">Resumo financeiro do período</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {applied.billingMode === "stay_nights"
                  ? "Faturamento por diária no intervalo (inclui não pagas)."
                  : "Faturamento por pagamento/check-in (somente pagas)."}
              </p>
              <MetricGrid view={report.period.billingView} />
              {report.yoy && (
                <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">YoY bruto</p>
                    <p className="font-medium">{formatPct(report.yoy.grossChange)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">YoY líquido</p>
                    <p className="font-medium">{formatPct(report.yoy.netChange)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">YoY ocupação</p>
                    <p className="font-medium">{formatPct(report.yoy.occupancyChange)}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Detalhamento agrupado</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportBuckets("csv")}>
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportBuckets("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Proprietário</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-right">Diárias</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">ADR</TableHead>
                  <TableHead className="text-right">Ocupação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.period.buckets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Sem faturamento no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  report.period.buckets.map((b) => (
                    <TableRow key={b.key}>
                      <TableCell className="capitalize">{b.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.billing.gross)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.billing.channelCommission)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.billing.ownerShare)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(b.billing.net)}</TableCell>
                      <TableCell className="text-right">{b.billing.billedNights}</TableCell>
                      <TableCell className="text-right">{b.billing.reservationCount}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(adrSafe(b.billing.gross, b.billing.billedNights))}
                      </TableCell>
                      <TableCell className="text-right">
                        {b.availableNights ? ((b.billing.billedNights / b.availableNights) * 100).toFixed(1) : "0.0"}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Relatório diário — Resultado do dia</h3>
            <p className="text-xs text-muted-foreground">
              Independente dos filtros acima. Vendas do dia civil, estadia inteira, sem exigir pagamento.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLinesOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Configurar linhas
          </Button>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Dia</Label>
            <Input type="date" value={dailyDay} onChange={(e) => setDailyDay(e.target.value)} />
          </div>
          <Button onClick={() => setAppliedDailyDay(dailyDay)} disabled={dailyQuery.isFetching}>
            {dailyQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Atualizar resultado do dia
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDaily("csv")}>
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDaily("xlsx")}>
            Excel
          </Button>
        </div>
        {dailyQuery.isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linha</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dailyQuery.data || []).flatMap((row) => [
                <TableRow key={`${row.lineId}-n`}>
                  <TableCell>{row.nightsLabel}</TableCell>
                  <TableCell className="text-right">{row.nights}</TableCell>
                </TableRow>,
                <TableRow key={`${row.lineId}-r`}>
                  <TableCell>{row.revenueLabel}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.gross)}</TableCell>
                </TableRow>,
              ])}
              {!dailyQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Sem linhas para o dia.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </Card>

      <DailyResultLinesDialog
        open={linesOpen}
        onOpenChange={setLinesOpen}
        companyId={companyId}
        establishments={establishments}
        lines={dailyLines}
      />
    </div>
  );
}

function adrSafe(gross: number, nights: number): number {
  return nights ? gross / nights : 0;
}
