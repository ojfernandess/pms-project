import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { formatCurrency, exportToCSV, exportToXLSX, toFiniteNumber } from "@/lib/financialUtils";
import {
  currentCalendarMonth,
  validateReportFilters,
  resolvePeriodPreset,
  type BillingMode,
  type GroupBy,
  type MonthRank,
  type PeriodPreset,
} from "@/lib/financial/operatingReportEngine";
import { useOperatingFinancialReport } from "@/hooks/useOperatingFinancialReport";
import type { OperatingFilters, TotalsView } from "@/services/financial/operatingReportService";
import { SalesBillingDefinitions } from "@/components/financial/SalesBillingDefinitions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function rankLabel(rank: MonthRank): string {
  if (rank === "melhor") return "Melhor faturamento";
  if (rank === "pior") return "Menor faturamento";
  return "Faturamento intermediário";
}

function rankBorder(rank: MonthRank): string {
  if (rank === "melhor") return "border-emerald-500/60";
  if (rank === "pior") return "border-red-500/50";
  return "border-orange-500/50";
}

function adrSafe(gross: number, nights: number): number {
  if (!nights) return 0;
  return toFiniteNumber(gross) / toFiniteNumber(nights);
}

function formatOccupancyPct(rate: number | null | undefined, digits = 2): string {
  if (rate == null || Number.isNaN(toFiniteNumber(rate, NaN))) return "—";
  return `${toFiniteNumber(rate).toFixed(digits)}%`;
}

function salesAdr(salesGross: number, salesNights: number): number {
  if (!salesNights) return 0;
  return toFiniteNumber(salesGross) / toFiniteNumber(salesNights);
}

function MiniMetrics({ view }: { view: TotalsView }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Bruto</p>
        <p className="font-semibold">{formatCurrency(view.gross)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Líquido</p>
        <p className="font-semibold text-primary">{formatCurrency(view.net)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Comissão OTA</p>
        <p>{formatCurrency(view.channelCommission)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Proprietário</p>
        <p>{formatCurrency(view.ownerShare)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Reservas</p>
        <p>{view.reservationCount}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">Diária média</p>
        <p>{formatCurrency(view.adr)}</p>
      </div>
      <div className="col-span-2 flex justify-between border-t pt-2 text-xs">
        <span className="text-muted-foreground">Ocupação</span>
        <strong>{formatOccupancyPct(view.occupancy)}</strong>
      </div>
    </div>
  );
}

export function SalesBillingDashboard() {
  const { establishments, selectedEstablishment } = useEstablishment();
  const defaultPeriod = currentCalendarMonth();
  const defaultEstIds = selectedEstablishment?.id
    ? [selectedEstablishment.id]
    : establishments.map((e) => e.id);

  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [draft, setDraft] = useState({
    startDate: defaultPeriod.startDate,
    endDate: defaultPeriod.endDate,
    establishmentIds: defaultEstIds,
    groupBy: "month" as GroupBy,
    billingMode: "stay_nights" as BillingMode,
    compareYoy: false,
  });
  const [applied, setApplied] = useState<OperatingFilters | null>(null);

  useEffect(() => {
    if (!draft.establishmentIds.length && establishments.length) {
      const ids = selectedEstablishment?.id ? [selectedEstablishment.id] : establishments.map((e) => e.id);
      setDraft((d) => ({ ...d, establishmentIds: ids }));
    }
  }, [establishments, selectedEstablishment?.id, draft.establishmentIds.length]);

  const onPresetChange = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "custom") return;
    const range = resolvePeriodPreset(p);
    setDraft((d) => ({ ...d, ...range }));
  };

  const reportQuery = useOperatingFinancialReport(applied);
  const report = reportQuery.data;

  const apply = () => {
    const err = validateReportFilters(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setApplied({ ...draft });
  };

  const selectedNames = establishments
    .filter((e) => draft.establishmentIds.includes(e.id))
    .map((e) => e.name);
  const estBadge = `${draft.establishmentIds.length} estabelecimento(s)`;

  const chartData = useMemo(
    () =>
      (report?.period.buckets || []).map((b) => ({
        name: b.label,
        bruto: b.billing.gross,
        liquido: b.billing.net,
      })),
    [report],
  );

  const billingModeLabel =
    applied?.billingMode === "stay_nights" ? "Período (PMS)" : "Pagamento / check-in";

  const exportEvolution = async (kind: "csv" | "xlsx") => {
    if (!report) return;
    const rows = report.period.buckets.map((b) => ({
      Periodo: b.label,
      Reservas: b.billing.reservationCount,
      Diarias: b.billing.billedNights,
      Bruto: b.billing.gross,
      Comissao: b.billing.channelCommission,
      Proprietario: b.billing.ownerShare,
      Liquido: b.billing.net,
      ADR: adrSafe(b.billing.gross, b.billing.billedNights),
      Ocupacao: b.availableNights ? (b.billing.billedNights / b.availableNights) * 100 : 0,
    }));
    const name = `faturamento-vendas-${applied?.startDate}-${applied?.endDate}`;
    if (kind === "xlsx") await exportToXLSX(rows, name, "Evolucao");
    else exportToCSV(rows, name);
    toast.success("Exportado.");
  };

  const dashboardBody = !applied ? (
    <p className="text-sm text-muted-foreground">Defina os filtros e clique em Atualizar relatório.</p>
  ) : reportQuery.isError ? (
    <p className="text-sm text-destructive">Não foi possível carregar o relatório.</p>
  ) : reportQuery.isLoading || !report ? (
    <div className="flex justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="space-y-6">
      <Card className="border-primary/35 bg-gradient-to-b from-primary/10 to-card p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Indicadores do período filtrado</h3>
          <p className="text-xs text-muted-foreground">
            {applied.startDate} a {applied.endDate} · critério {billingModeLabel}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="p-4 bg-background/80">
            <p className="text-xs text-muted-foreground">Vendas no período</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(report.period.sales.salesGross)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">vendas realizadas no intervalo (data da reserva)</p>
            <p className="text-sm font-semibold">{report.period.sales.salesCount} reservas</p>
            <p className="text-[11px] text-muted-foreground">
              {report.period.sales.salesNights} diárias das reservas vendidas
            </p>
          </Card>
          <Card className="p-4 bg-background/80">
            <p className="text-xs text-muted-foreground">Quantidade de diárias no período</p>
            <p className="text-2xl font-bold">{report.period.billing.billedNights}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">diárias faturadas no intervalo (data da diária)</p>
          </Card>
          <Card className="p-4 bg-background/80">
            <p className="text-xs text-muted-foreground">Faturamento do período</p>
            <p className="text-2xl font-bold">{formatCurrency(report.period.billing.gross)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">receita bruta apurada no relatório</p>
          </Card>
          <Card className="p-4 bg-background/80">
            <p className="text-xs text-muted-foreground">Diária média (vendas)</p>
            <p className="text-2xl font-bold">
              {formatCurrency(salesAdr(report.period.sales.salesGross, report.period.sales.salesNights))}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">valor médio das reservas vendidas no período</p>
          </Card>
          <Card className="p-4 bg-background/80">
            <p className="text-xs text-muted-foreground">Taxa de ocupação</p>
            <p className="text-2xl font-bold">{formatOccupancyPct(report.periodOccupancy.rate)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.periodOccupancy.occupiedNights} diárias ocupadas / {report.periodOccupancy.availableNights}{" "}
              disponíveis
            </p>
          </Card>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold">Resumo dos 3 meses anteriores</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Três meses completos anteriores ao mês de {applied.startDate.slice(0, 7)} — comparativo por faturamento
          bruto.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {report.previousMonths.map((m) => (
            <Card key={m.key} className={`border-2 p-4 ${rankBorder(m.rank)}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="font-medium capitalize">{m.label}</p>
                <Badge variant="outline" className="text-[10px]">
                  {rankLabel(m.rank)}
                </Badge>
              </div>
              <MiniMetrics view={m.view} />
            </Card>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total bruto (3 meses)", value: report.previousMonthsTotal.gross },
            { label: "Total líquido (3 meses)", value: report.previousMonthsTotal.net },
            { label: "Comissão OTA (3 meses)", value: report.previousMonthsTotal.channelCommission },
            { label: "Repasse proprietário (3 meses)", value: report.previousMonthsTotal.ownerShare },
            {
              label: "Taxa de ocupação média",
              value: report.previousMonthsTotal.occupancy,
              pct: true,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-dashed p-3">
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
              <p className="font-semibold">
                {item.pct
                  ? formatOccupancyPct(item.value as number | null, 1)
                  : formatCurrency(item.value as number)}
              </p>
            </div>
          ))}
        </div>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Diárias</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">Ocupação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.previousMonths.map((m) => (
              <TableRow key={m.key} className={rankBorder(m.rank)}>
                <TableCell className="capitalize">{m.label}</TableCell>
                <TableCell className="text-right">{m.view.reservationCount}</TableCell>
                <TableCell className="text-right">{m.view.billedNights}</TableCell>
                <TableCell className="text-right">{formatCurrency(m.view.gross)}</TableCell>
                <TableCell className="text-right">{formatCurrency(m.view.net)}</TableCell>
                <TableCell className="text-right">{formatOccupancyPct(m.view.occupancy, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SectionBlock title="Resumo financeiro" subtitle={`${applied.startDate} a ${applied.endDate}`}>
        <SummaryKpis
          items={[
            { label: "Faturamento do período", value: formatCurrency(report.period.billing.gross) },
            {
              label: "Vendas no período",
              value: formatCurrency(report.period.sales.salesGross),
              hint: `${report.period.sales.salesCount} reservas · ${report.period.sales.salesNights} diárias`,
            },
            { label: "Comissão OTA", value: formatCurrency(report.period.billing.channelCommission) },
            { label: "Receita líquida", value: formatCurrency(report.period.billing.net), primary: true },
            { label: "Diárias no período", value: String(report.period.billing.billedNights) },
            { label: "Repasse proprietário", value: formatCurrency(report.period.billing.ownerShare) },
            { label: "Reservas no faturamento", value: String(report.period.billing.reservationCount) },
            {
              label: "Diária média (vendas)",
              value: formatCurrency(salesAdr(report.period.sales.salesGross, report.period.sales.salesNights)),
            },
            {
              label: "Taxa de ocupação",
              value: formatOccupancyPct(report.periodOccupancy.rate),
            },
          ]}
        />
      </SectionBlock>

      <Card className="p-6">
        <h3 className="text-lg font-semibold">Por estabelecimento</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Ocupação por capacidade real de cada hotel; faturamento do período com o mesmo critério do card principal.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hotel</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Diárias</TableHead>
              <TableHead className="text-right">Taxa de ocupação (%)</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">Faturamento do período</TableHead>
              <TableHead className="text-right">Diária média</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.establishmentRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhum estabelecimento no filtro.
                </TableCell>
              </TableRow>
            ) : (
              report.establishmentRows.map((row) => (
                <TableRow key={row.establishmentId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.reservationCount}</TableCell>
                  <TableCell className="text-right">{row.billedNights}</TableCell>
                  <TableCell className="text-right">{formatOccupancyPct(row.occupancyRate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.receitaGross)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.periodBillingGross)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.adr)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.net)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold">Vendas × Faturamento por mês</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Mesmo intervalo do filtro: vendas pela data da reserva; faturamento pelas diárias de cada mês.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Vendas no período</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.monthlySalesBilling.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="capitalize">{row.label}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.salesGross)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.billingGross)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Evolução por período</h3>
            <p className="text-xs text-muted-foreground">Faturamento ao longo do tempo (agrupamento do filtro)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportEvolution("csv")}>
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportEvolution("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="bruto" name="Bruto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="liquido" name="Líquido" fill="hsl(var(--chart-2, 142 76% 36%))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
        )}
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Diárias</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.period.buckets.map((b) => (
              <TableRow key={b.key}>
                <TableCell className="capitalize">{b.label}</TableCell>
                <TableCell className="text-right">{b.billing.reservationCount}</TableCell>
                <TableCell className="text-right">{b.billing.billedNights}</TableCell>
                <TableCell className="text-right">{formatCurrency(b.billing.gross)}</TableCell>
                <TableCell className="text-right">{formatCurrency(b.billing.net)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  return (
    <Tabs defaultValue="dashboard" className="space-y-4">
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="docs">Lógica e definições</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-4">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              Filtros <Badge variant="secondary">{estBadge}</Badge>
            </h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Atalho de período</Label>
              <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="yesterday">Ontem</SelectItem>
                  <SelectItem value="last7">Últimos 7 dias</SelectItem>
                  <SelectItem value="last30">Últimos 30 dias</SelectItem>
                  <SelectItem value="this_month">Este mês</SelectItem>
                  <SelectItem value="prev_month">Mês anterior</SelectItem>
                  <SelectItem value="this_year">Este ano</SelectItem>
                  <SelectItem value="custom">Período personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data inicial</Label>
              <Input
                type="date"
                value={draft.startDate}
                onChange={(e) => {
                  setPreset("custom");
                  setDraft((d) => ({ ...d, startDate: e.target.value }));
                }}
              />
            </div>
            <div>
              <Label>Data final</Label>
              <Input
                type="date"
                value={draft.endDate}
                onChange={(e) => {
                  setPreset("custom");
                  setDraft((d) => ({ ...d, endDate: e.target.value }));
                }}
              />
            </div>
            <div>
              <Label>Agrupamento</Label>
              <Select value={draft.groupBy} onValueChange={(v: GroupBy) => setDraft((d) => ({ ...d, groupBy: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
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
                  <SelectItem value="stay_nights">Período (PMS)</SelectItem>
                  <SelectItem value="payment_attribution">Pagamento / check-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Checkbox
                id="yoy-billing"
                checked={draft.compareYoy}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, compareYoy: Boolean(v) }))}
              />
              <Label htmlFor="yoy-billing">Comparar ano anterior</Label>
            </div>
            <div className="lg:col-span-3">
              <Label>Estabelecimentos</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 w-full justify-between font-normal">
                    <span className="truncate">{selectedNames.join(", ") || "Selecione"}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full max-w-md p-2" align="start">
                  <div className="max-h-40 grid gap-2 overflow-auto sm:grid-cols-2">
                    {establishments.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.establishmentIds.includes(e.id)}
                          onCheckedChange={(checked) =>
                            setDraft((d) => ({
                              ...d,
                              establishmentIds: checked
                                ? [...d.establishmentIds, e.id]
                                : d.establishmentIds.filter((id) => id !== e.id),
                            }))
                          }
                        />
                        {e.name}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <FiltersToolbar onApply={apply} loading={reportQuery.isFetching} />
        </Card>
        {dashboardBody}
      </TabsContent>

      <TabsContent value="docs">
        <SalesBillingDefinitions />
      </TabsContent>
    </Tabs>
  );
}

function SectionBlock({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function SummaryKpis({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; primary?: boolean }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={`text-xl font-bold ${item.primary ? "text-primary" : ""}`}>{item.value}</p>
          {item.hint ? <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p> : null}
        </Card>
      ))}
    </div>
  );
}

function FiltersToolbar({ onApply, loading }: { onApply: () => void; loading: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">Altere os filtros e clique em Atualizar relatório.</p>
      <Button onClick={onApply} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Atualizar relatório
      </Button>
    </div>
  );
}