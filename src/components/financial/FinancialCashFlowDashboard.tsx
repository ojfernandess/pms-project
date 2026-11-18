import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CashFlowChart } from "@/components/financial/CashFlowChart";
import { useFinancialCashFlow } from "@/hooks/useFinancialCashFlow";
import { formatCurrency } from "@/lib/financialUtils";
import { cumulativeNetBalanceSeries } from "@/lib/financial/cashFlowAggregation";
import { getCurrentMonthPeriod } from "@/lib/financialUtils";
import { Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { backfillSettlementCashFlow } from "@/services/financial/cashFlowService";
import { FinancialArMigrationPanel } from "@/components/financial/FinancialArMigrationPanel";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export function FinancialCashFlowDashboard() {
  const defaultPeriod = getCurrentMonthPeriod();
  const [startDate, setStartDate] = useState(defaultPeriod.startDate);
  const [endDate, setEndDate] = useState(defaultPeriod.endDate);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  const { data: report, isLoading, refetch, isFetching } = useFinancialCashFlow({ startDate, endDate });

  const chartData = useMemo(() => {
    if (!report?.daily.length) return [];
    return report.daily.map((d) => ({
      date: d.day,
      inflows: d.inflows,
      outflows: d.outflows,
    }));
  }, [report]);

  const cumulative = useMemo(
    () => (report?.daily ? cumulativeNetBalanceSeries(report.daily) : []),
    [report],
  );

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const result = await backfillSettlementCashFlow(establishmentId || undefined);
      if (!result.success) throw new Error(result.error);
      toast.success(result.posted ? `${result.posted} quitação(ões) integradas ao caixa` : "Nada pendente");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha no backfill");
    } finally {
      setIsBackfilling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 flex-wrap items-end">
          <div>
            <Label>Início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
          <Button variant="outline" onClick={handleBackfill} disabled={isBackfilling}>
            {isBackfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar quitações → caixa
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Realizado: apenas recebimentos/pagamentos efetivos (quitações). Projetado: títulos em aberto por vencimento — não compõe o saldo realizado.
        </p>
      </Card>

      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="p-4 border-l-4 border-l-green-600">
              <p className="text-sm text-muted-foreground">Entradas realizadas</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(report.realized_inflows)}</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-600">
              <p className="text-sm text-muted-foreground">Saídas realizadas</p>
              <p className="text-2xl font-bold text-red-700">{formatCurrency(report.realized_outflows)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Saldo líquido realizado</p>
              <p className="text-2xl font-bold">{formatCurrency(report.realized_net)}</p>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <h3 className="font-semibold">Projeção a receber (vencimento no período)</h3>
              </div>
              <p className="text-xl font-bold">{formatCurrency(report.projected_receivables)}</p>
              <p className="text-xs text-muted-foreground mt-1">Não contabilizado como entrada de caixa até o recebimento.</p>
            </Card>
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                <h3 className="font-semibold">Projeção a pagar (vencimento no período)</h3>
              </div>
              <p className="text-xl font-bold">{formatCurrency(report.projected_payables)}</p>
              <p className="text-xs text-muted-foreground mt-1">Não contabilizado como saída até o pagamento efetivo.</p>
            </Card>
          </div>

          <FinancialArMigrationPanel />

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Movimentação diária (realizada)</h3>
            <CashFlowChart data={chartData} />
            {cumulative.length > 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                Saldo acumulado no período (realizado):{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(cumulative[cumulative.length - 1].balance)}
                </span>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}