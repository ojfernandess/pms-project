import { Card } from "@/components/ui/card";
import { DollarSign, Users, Bed, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { OccupancyChart } from "@/components/dashboard/OccupancyChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { RecentReservations } from "@/components/dashboard/RecentReservations";
import { useDashboard } from "@/hooks/useDashboard";
import { formatCurrency, toFiniteNumber } from "@/lib/reservationUtils";

const Dashboard = () => {
  const {
    todayRevenue,
    occupancy,
    checkins,
    revpar,
    occupancyHistory,
    revenueHistory,
    alerts,
    isLoading,
  } = useDashboard();

  const getTrend = (change: number): "up" | "down" | "neutral" => {
    if (change > 0) return "up";
    if (change < 0) return "down";
    return "neutral";
  };

  const formatChange = (change: number | string | null | undefined) => {
    const n = toFiniteNumber(change);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do seu hotel</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Faturamento Hoje"
              value={formatCurrency(todayRevenue?.total || 0)}
              description={
                todayRevenue?.change
                  ? `${formatChange(todayRevenue.change)} vs ontem`
                  : "Sem dados anteriores"
              }
              icon={DollarSign}
              trend={todayRevenue?.change ? getTrend(todayRevenue.change) : "neutral"}
            />
            <StatsCard
              title="Taxa de Ocupação"
              value={`${Math.round(occupancy?.rate || 0)}%`}
              description={`${occupancy?.occupied || 0} de ${occupancy?.total || 0} quartos`}
              icon={Bed}
              trend="neutral"
            />
            <StatsCard
              title="Check-ins Hoje"
              value={String(checkins?.total || 0)}
              description={`${checkins?.pending || 0} pendentes`}
              icon={Users}
              trend="neutral"
            />
            <StatsCard
              title="RevPAR"
              value={formatCurrency(revpar?.value || 0)}
              description={
                revpar?.change
                  ? `${formatChange(revpar.change)} vs mês anterior`
                  : "Sem dados anteriores"
              }
              icon={TrendingUp}
              trend={revpar?.change ? getTrend(revpar.change) : "neutral"}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Ocupação (30 dias)</h3>
              <OccupancyChart data={occupancyHistory} />
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Faturamento (30 dias)</h3>
              <RevenueChart data={revenueHistory} />
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <RecentReservations />
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-warning" />
                <h3 className="text-lg font-semibold">Alertas</h3>
              </div>
              <div className="space-y-3">
                {alerts.map((alert, index) => (
                  <div
                    key={index}
                    className={`p-3 border rounded-lg ${
                      alert.type === "warning"
                        ? "bg-warning/10 border-warning/20"
                        : alert.type === "maintenance"
                        ? "bg-maintenance/10 border-maintenance/20"
                        : "bg-success/10 border-success/20"
                    }`}
                  >
                    <p className="font-medium text-sm">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
