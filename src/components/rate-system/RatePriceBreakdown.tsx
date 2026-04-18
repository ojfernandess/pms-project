/**
 * Exibição em 3 camadas do preço tarifário
 * 
 * Evita sobreposição visual mostrando:
 * - Tarifa Base
 * - Regra Dinâmica (ajuste aplicado)
 * - Tarifa Final
 * 
 * Com tooltip explicativo para transparência do cálculo.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/reservationUtils";
import { TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RateBreakdownItem {
  ruleName: string;
  adjustmentType: "percentage" | "fixed" | "multiplier";
  adjustmentValue: number;
  finalAdjustment: number;
}

interface RatePriceBreakdownProps {
  basePrice: number;
  finalPrice: number;
  adjustments?: RateBreakdownItem[];
  className?: string;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  /** Modo compacto: apenas ícone, sem texto "Dinâmico" (evita overflow em células estreitas) */
  compact?: boolean;
}

export function RatePriceBreakdown({
  basePrice,
  finalPrice,
  adjustments = [],
  className,
  size = "md",
  showBadge = true,
  compact = false,
}: RatePriceBreakdownProps) {
  const hasDynamicAdjustment = Math.abs(finalPrice - basePrice) > 0.01;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const tooltipContent = (
    <div className="space-y-2 p-1 max-w-[260px]">
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-muted-foreground">Tarifa Base</span>
        <span className="font-medium">{formatCurrency(basePrice)}</span>
      </div>
      {adjustments.length > 0 ? (
        adjustments.map((adj, i) => (
          <div key={i} className="flex justify-between gap-4 text-xs border-t border-border/50 pt-1">
            <span className="text-muted-foreground truncate" title={adj.ruleName}>
              {adj.ruleName}
            </span>
            <span className={adj.finalAdjustment >= 0 ? "text-green-600" : "text-red-600"}>
              {adj.adjustmentType === "percentage"
                ? `${adj.adjustmentValue >= 0 ? "+" : ""}${adj.adjustmentValue}%`
                : adj.adjustmentType === "fixed"
                ? `${adj.finalAdjustment >= 0 ? "+" : ""}${formatCurrency(adj.finalAdjustment)}`
                : `×${adj.adjustmentValue}`}
            </span>
          </div>
        ))
      ) : hasDynamicAdjustment ? (
        <div className="flex justify-between gap-4 text-xs border-t border-border/50 pt-1">
          <span className="text-muted-foreground">Regra Dinâmica</span>
          <span className="text-primary">
            {finalPrice >= basePrice ? "+" : ""}{formatCurrency(finalPrice - basePrice)}
          </span>
        </div>
      ) : null}
      <div className="flex justify-between gap-4 text-xs font-semibold border-t border-border pt-1">
        <span>Tarifa Final</span>
        <span>{formatCurrency(finalPrice)}</span>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1 cursor-help min-w-0 max-w-full overflow-hidden",
              sizeClasses[size],
              className
            )}
          >
            <span className={cn(hasDynamicAdjustment && "font-medium", "truncate")}>
              {formatCurrency(finalPrice)}
            </span>
            {showBadge && hasDynamicAdjustment && (
              compact ? (
                <TrendingUp className="h-3 w-3 flex-shrink-0 text-purple-600" title="Preço Dinâmico Aplicado" />
              ) : (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 flex-shrink-0"
                  title="Preço Dinâmico Aplicado"
                >
                  <TrendingUp className="h-3 w-3" />
                  Aplicado
                </span>
              )
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-normal">
          {hasDynamicAdjustment ? (
            <>
              <p className="text-xs font-medium mb-2 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                Preço ajustado por regra dinâmica
              </p>
              {tooltipContent}
            </>
          ) : (
            <p className="text-xs">Tarifa base: {formatCurrency(basePrice)}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
