import { useMemo, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Bed, Wrench, Lock, LayoutDashboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RoomOccupancyData } from "@/hooks/useOccupancyMap";
import { computeOccupancyDashboardStats } from "@/lib/occupancyDashboardStats";

interface OccupancyDashboardPanelProps {
  rooms: RoomOccupancyData[];
  selectedDate: Date;
}

const CHART_COLORS = {
  occupied: "#ef4444",
  available: "#22c55e",
  dirty: "#eab308",
  maintenance: "#3b82f6",
  blocked: "#64748b",
  other: "#a78bfa",
};

export const OccupancyDashboardPanel = ({ rooms, selectedDate }: OccupancyDashboardPanelProps) => {
  const stats = useMemo(() => computeOccupancyDashboardStats(rooms), [rooms]);

  const chartData = useMemo(() => {
    const slices = [
      { key: "occupied", name: "Ocupados", value: stats.occupied, color: CHART_COLORS.occupied },
      { key: "available", name: "Disponíveis", value: stats.available, color: CHART_COLORS.available },
      { key: "dirty", name: "Sujo / limpeza", value: stats.dirty, color: CHART_COLORS.dirty },
      { key: "maintenance", name: "Manutenção", value: stats.maintenance, color: CHART_COLORS.maintenance },
      { key: "blocked", name: "Interditados", value: stats.blocked, color: CHART_COLORS.blocked },
      { key: "other", name: "Outros", value: stats.other, color: CHART_COLORS.other },
    ];
    return slices.filter((s) => s.value > 0);
  }, [stats]);

  if (stats.total === 0) {
    return null;
  }

  return (
    <Card className="p-4 sm:p-5 border border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-background shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Dashboard de Ocupação</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Visão consolidada — {format(selectedDate, "dd 'de' MMMM yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Taxa de ocupação</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{stats.occupancyRatePct}%</p>
          <p className="text-xs text-muted-foreground">
            {stats.occupied} de {stats.total} quartos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Ocupados x Disponíveis */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ocupados x disponíveis
            </p>
            <MetricBar
              label="Ocupados"
              count={stats.occupied}
              percent={stats.occupiedPct}
              indicatorClassName="bg-red-500"
              icon={<Bed className="h-4 w-4 text-red-600" />}
            />
            <MetricBar
              label="Disponíveis"
              count={stats.available}
              percent={stats.availablePct}
              indicatorClassName="bg-emerald-500"
              icon={<span className="text-sm">🟢</span>}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatusHighlightCard
              title="Em manutenção"
              count={stats.maintenance}
              percent={stats.maintenancePct}
              icon={<Wrench className="h-5 w-5 text-blue-600" />}
              className="border-blue-200/80 bg-blue-50/50"
              accent="text-blue-700"
            />
            <StatusHighlightCard
              title="Interditados / bloqueados"
              count={stats.blocked}
              percent={stats.blockedPct}
              icon={<Lock className="h-5 w-5 text-slate-600" />}
              className="border-slate-300/80 bg-slate-100/60"
              accent="text-slate-800"
            />
          </div>
        </div>

        {/* Distribuição */}
        <div className="rounded-lg border bg-card p-3 sm:p-4 flex flex-col min-h-[220px]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Distribuição do parque
          </p>
          {chartData.length > 0 ? (
            <div className="flex-1 min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => {
                      const pctVal = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;
                      return [`${value} quartos (${pctVal}%)`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground flex-1 flex items-center justify-center">Sem dados</p>
          )}
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] sm:text-xs text-muted-foreground">
            {chartData.map((item) => (
              <li key={item.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
};

function MetricBar({
  label,
  count,
  percent,
  indicatorClassName,
  icon,
}: {
  label: string;
  count: number;
  percent: number;
  indicatorClassName: string;
  icon: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{count}</span>
          <span className="mx-1">·</span>
          <span className="font-semibold text-foreground">{percent}%</span>
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", indicatorClassName)}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function StatusHighlightCard({
  title,
  count,
  percent,
  icon,
  className,
  accent,
}: {
  title: string;
  count: number;
  percent: number;
  icon: ReactNode;
  className?: string;
  accent: string;
}) {
  return (
    <div className={cn("rounded-lg border p-3 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-2xl font-bold tabular-nums mt-1", accent)}>{count}</p>
        </div>
        <div className="p-2 rounded-md bg-background/80 border">{icon}</div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        <span className={cn("font-semibold", accent)}>{percent}%</span> do total de quartos
      </p>
    </div>
  );
}