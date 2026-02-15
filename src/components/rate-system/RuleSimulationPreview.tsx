/**
 * Preview de simulação de regra dinâmica.
 * Mostra estimativa de células afetadas e exemplos antes → depois.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, AlertCircle } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/reservationUtils";
import { cn } from "@/lib/utils";

interface RateCalendarEntry {
  pricing_plan_id: string;
  category_id: string;
  date: string;
  base_price: number;
}

interface RuleSimulationPreviewProps {
  formData: {
    trigger_type: string;
    trigger_condition?: { occupancy_ranges?: Array<{ min: number; max: number; adjustment: number }> };
    adjustment_type: "percentage" | "fixed" | "multiplier";
    adjustment_value: number;
    applicable_categories: string[];
    applicable_plans: string[];
    start_date?: Date;
    end_date?: Date;
  };
  rateCalendar: RateCalendarEntry[];
  categories: Array<{ id: string; name: string; base_price: number }>;
  ratePlans: Array<{ id: string; name: string }>;
  className?: string;
}

function applyAdjustment(
  basePrice: number,
  adjustmentType: string,
  adjustmentValue: number,
  occupancyRanges?: Array<{ min: number; max: number; adjustment: number }>
): number {
  let adj = adjustmentValue;
  if (occupancyRanges && occupancyRanges.length > 0) {
    const avgAdj = occupancyRanges.reduce((s, r) => s + (r.adjustment || 0), 0) / occupancyRanges.length;
    adj = avgAdj;
  }

  if (adjustmentType === "percentage") {
    return basePrice * (1 + adj / 100);
  }
  if (adjustmentType === "fixed") {
    return basePrice + adj;
  }
  if (adjustmentType === "multiplier") {
    return basePrice * (adj > 0 ? adj : 1);
  }
  return basePrice;
}

export function RuleSimulationPreview({
  formData,
  rateCalendar,
  categories,
  ratePlans,
  className,
}: RuleSimulationPreviewProps) {
  const simulation = useMemo(() => {
    const today = startOfDay(new Date());
    const startDate = formData.start_date
      ? startOfDay(formData.start_date)
      : today;
    const endDate = formData.end_date
      ? startOfDay(formData.end_date)
      : addDays(today, 13);

    if (endDate < startDate) return { affectedCount: 0, totalCells: 0, examples: [], adrBefore: 0, adrAfter: 0, adrChange: 0 };

    const dateRange = { start: startDate, end: endDate };
    const dates: Date[] = [];
    let d = startDate;
    while (d <= endDate) {
      dates.push(d);
      d = addDays(d, 1);
    }

    const catIds = formData.applicable_categories.length > 0
      ? formData.applicable_categories
      : categories.map((c) => c.id);
    const planIds = formData.applicable_plans.length > 0
      ? formData.applicable_plans
      : ratePlans.map((p) => p.id);

    const rcMap = new Map<string, number>();
    rateCalendar.forEach((e) => {
      rcMap.set(`${e.pricing_plan_id}-${e.category_id}-${e.date}`, e.base_price);
    });

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const planMap = new Map(ratePlans.map((p) => [p.id, p]));

    let affectedCount = 0;
    const examples: Array<{
      categoryName: string;
      planName: string;
      date: string;
      before: number;
      after: number;
    }> = [];
    let totalBefore = 0;
    let totalAfter = 0;
    let cellCount = 0;

    for (const date of dates) {
      const dateStr = format(date, "yyyy-MM-dd");
      for (const catId of catIds) {
        const cat = catMap.get(catId);
        if (!cat) continue;
        for (const planId of planIds) {
          const beforePrice =
            rcMap.get(`${planId}-${catId}-${dateStr}`) ?? Number(cat.base_price) ?? 0;
          if (beforePrice <= 0) continue;

          const afterPrice = applyAdjustment(
            beforePrice,
            formData.adjustment_type,
            formData.adjustment_value,
            formData.trigger_condition?.occupancy_ranges
          );

          if (Math.abs(afterPrice - beforePrice) > 0.01) {
            affectedCount++;
            if (examples.length < 5) {
              examples.push({
                categoryName: cat.name,
                planName: planMap.get(planId)?.name ?? planId.slice(0, 8),
                date: dateStr,
                before: beforePrice,
                after: afterPrice,
              });
            }
          }
          totalBefore += beforePrice;
          totalAfter += afterPrice;
          cellCount++;
        }
      }
    }

    const adrBefore = cellCount > 0 ? totalBefore / cellCount : 0;
    const adrAfter = cellCount > 0 ? totalAfter / cellCount : 0;
    const adrChange = adrBefore > 0 ? ((adrAfter - adrBefore) / adrBefore) * 100 : 0;

    return {
      affectedCount,
      totalCells: cellCount,
      examples,
      adrBefore,
      adrAfter,
      adrChange,
    };
  }, [formData, rateCalendar, categories, ratePlans]);

  if (simulation.totalCells === 0) {
    return (
      <Card className={cn("p-4 border-dashed bg-muted/30", className)}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Selecione período e categorias/planos para ver a simulação</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 font-medium text-sm">
        <BarChart3 className="h-4 w-4 text-primary" />
        Prévia do impacto
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Células afetadas</p>
          <p className="font-semibold">{simulation.affectedCount}</p>
          <p className="text-xs text-muted-foreground">de {simulation.totalCells}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ADR projetado</p>
          <p className="font-semibold">{formatCurrency(simulation.adrAfter)}</p>
          <p
            className={cn(
              "text-xs",
              simulation.adrChange > 0 ? "text-green-600" : simulation.adrChange < 0 ? "text-red-600" : "text-muted-foreground"
            )}
          >
            {simulation.adrChange > 0 ? "+" : ""}
            {simulation.adrChange.toFixed(1)}% vs atual
          </p>
        </div>
      </div>
      {simulation.examples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Exemplos de preços</p>
          <div className="space-y-1 text-sm">
            {simulation.examples.map((ex, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 border-b last:border-0 text-xs"
              >
                <span className="text-muted-foreground truncate max-w-[120px]">
                  {ex.categoryName} / {ex.planName} · {format(new Date(ex.date), "dd/MM", { locale: ptBR })}
                </span>
                <span>
                  {formatCurrency(ex.before)} →{" "}
                  <span className="font-medium text-primary">{formatCurrency(ex.after)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
