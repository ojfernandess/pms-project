/**
 * Resumo de impacto estimado por regra dinâmica.
 * Exibe ADR projetado e células afetadas para cada regra ativa.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { formatCurrency } from "@/lib/reservationUtils";
import { cn } from "@/lib/utils";
import type { DynamicPricingRule } from "@/hooks/useRateSystem";

interface RuleImpactSummaryProps {
  rules: DynamicPricingRule[];
  rateCalendar: Array<{ pricing_plan_id: string; category_id: string; date: string; base_price: number }>;
  categories: Array<{ id: string; name: string; base_price: number }>;
  ratePlans: Array<{ id: string; name: string }>;
}

function applyRuleAdjustment(
  basePrice: number,
  rule: DynamicPricingRule
): number {
  let adj = rule.adjustment_value ?? 0;
  if (rule.trigger_type === "occupancy" && rule.trigger_condition?.occupancy_ranges) {
    const ranges = rule.trigger_condition.occupancy_ranges as Array<{ adjustment?: number }>;
    adj = ranges.reduce((s, r) => s + (r.adjustment ?? 0), 0) / (ranges.length || 1);
  }

  if (rule.adjustment_type === "percentage") {
    return basePrice * (1 + adj / 100);
  }
  if (rule.adjustment_type === "fixed") {
    return basePrice + adj;
  }
  if (rule.adjustment_type === "multiplier") {
    return basePrice * (adj > 0 ? adj : 1);
  }
  return basePrice;
}

export function RuleImpactSummary({
  rules,
  rateCalendar,
  categories,
  ratePlans,
}: RuleImpactSummaryProps) {
  const activeRules = useMemo(() => rules.filter((r) => r.is_active), [rules]);

  const impacts = useMemo(() => {
    const today = startOfDay(new Date());
    const endDate = addDays(today, 29);
    const rcMap = new Map<string, number>();
    rateCalendar.forEach((e) => {
      rcMap.set(`${e.pricing_plan_id}-${e.category_id}-${e.date}`, e.base_price);
    });
    const catMap = new Map(categories.map((c) => [c.id, c]));

    return activeRules.map((rule) => {
      const startDate = rule.start_date ? startOfDay(new Date(rule.start_date)) : today;
      const ruleEndDate = rule.end_date ? startOfDay(new Date(rule.end_date)) : endDate;
      const effectiveEnd = ruleEndDate < endDate ? ruleEndDate : endDate;

      const catIds =
        rule.applicable_categories?.length > 0
          ? rule.applicable_categories
          : categories.map((c) => c.id);
      const planIds =
        rule.applicable_plans?.length > 0
          ? rule.applicable_plans
          : ratePlans.map((p) => p.id);

      let affectedCount = 0;
      let totalBase = 0;
      let totalWithRule = 0;
      let cellCount = 0;

      let d = startDate;
      while (d <= effectiveEnd) {
        const dateStr = format(d, "yyyy-MM-dd");
        for (const catId of catIds) {
          const cat = catMap.get(catId);
          if (!cat) continue;
          for (const planId of planIds) {
            const basePrice =
              rcMap.get(`${planId}-${catId}-${dateStr}`) ?? Number(cat.base_price) ?? 0;
            if (basePrice <= 0) continue;

            const withRule = applyRuleAdjustment(basePrice, rule);
            if (Math.abs(withRule - basePrice) > 0.01) affectedCount++;
            totalBase += basePrice;
            totalWithRule += withRule;
            cellCount++;
          }
        }
        d = addDays(d, 1);
      }

      const adrBase = cellCount > 0 ? totalBase / cellCount : 0;
      const adrWithRule = cellCount > 0 ? totalWithRule / cellCount : 0;
      const adrChange = adrBase > 0 ? ((adrWithRule - adrBase) / adrBase) * 100 : 0;

      return {
        rule,
        affectedCount,
        totalCells: cellCount,
        adrBase,
        adrWithRule,
        adrChange,
      };
    });
  }, [activeRules, rateCalendar, categories, ratePlans]);

  if (activeRules.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 font-medium text-sm mb-3">
        <BarChart3 className="h-4 w-4 text-primary" />
        Impacto estimado das regras (próximos 30 dias)
      </div>
      <div className="space-y-3">
        {impacts.map(({ rule, affectedCount, totalCells, adrWithRule, adrChange }) => (
          <div
            key={rule.id}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div>
              <p className="font-medium text-sm">{rule.name}</p>
              <p className="text-xs text-muted-foreground">
                {affectedCount} de {totalCells} células afetadas
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-sm">{formatCurrency(adrWithRule)}</p>
              <p
                className={cn(
                  "text-xs",
                  adrChange > 0 ? "text-green-600" : adrChange < 0 ? "text-red-600" : "text-muted-foreground"
                )}
              >
                {adrChange > 0 ? "+" : ""}
                {adrChange.toFixed(1)}% ADR projetado
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
