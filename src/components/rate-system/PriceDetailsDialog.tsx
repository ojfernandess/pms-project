import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Percent, X, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/reservationUtils";
import { cn } from "@/lib/utils";

interface Adjustment {
  rule_id: string;
  rule_name: string;
  adjustment_type: string;
  adjustment_value: number;
  final_adjustment: number;
}

interface PriceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePrice: number;
  finalPrice: number;
  adjustments: Adjustment[];
  metrics?: {
    occupancy: number;
    pickup_rate: number;
    has_local_event: boolean;
    event_impact: number;
  };
  autoApplyEnabled: boolean;
}

export const PriceDetailsDialog = ({
  open,
  onOpenChange,
  basePrice,
  finalPrice,
  adjustments,
  metrics,
  autoApplyEnabled,
}: PriceDetailsDialogProps) => {
  const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.final_adjustment, 0);
  const percentageChange = basePrice > 0 ? (totalAdjustment / basePrice) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Detalhes do Preço
          </DialogTitle>
          <DialogDescription>
            Informações sobre o cálculo do preço e ajustes aplicados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo do Preço */}
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Preço Base</p>
                <p className="text-2xl font-bold">{formatCurrency(basePrice)}</p>
              </div>
              {totalAdjustment !== 0 && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Ajuste Total</p>
                  <p
                    className={cn(
                      "text-2xl font-bold flex items-center gap-1",
                      totalAdjustment > 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {totalAdjustment > 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                    {formatCurrency(Math.abs(totalAdjustment))}
                    <span className="text-sm">
                      ({percentageChange > 0 ? "+" : ""}
                      {percentageChange.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              )}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Preço Final</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(finalPrice)}
                </p>
              </div>
            </div>
          </Card>

          {/* Status de Aplicação Automática */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
            <Zap className={cn("h-4 w-4", autoApplyEnabled ? "text-green-600" : "text-gray-400")} />
            <span className="text-sm">
              Regras dinâmicas:{" "}
              <strong className={autoApplyEnabled ? "text-green-600" : "text-gray-500"}>
                {autoApplyEnabled ? "Ativadas" : "Desativadas"}
              </strong>
            </span>
          </div>

          {/* Métricas */}
          {metrics && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Métricas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ocupação</p>
                  <p className="text-lg font-semibold">{metrics.occupancy.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Rate</p>
                  <p className="text-lg font-semibold">{metrics.pickup_rate.toFixed(1)}/dia</p>
                </div>
                {metrics.has_local_event && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Evento Local</p>
                    <p className="text-lg font-semibold text-orange-600">
                      Impacto: +{metrics.event_impact}%
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Ajustes Aplicados */}
          {adjustments.length > 0 ? (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Ajustes Aplicados ({adjustments.length})</h3>
              <div className="space-y-2">
                {adjustments.map((adjustment, index) => (
                  <div
                    key={adjustment.rule_id || index}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{adjustment.rule_name}</p>
                        <Badge
                          variant={
                            adjustment.adjustment_type === "percentage"
                              ? "default"
                              : adjustment.adjustment_type === "multiplier"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {adjustment.adjustment_type === "percentage" && (
                            <>
                              <Percent className="h-3 w-3 mr-1" />
                              {adjustment.adjustment_value > 0 ? "+" : ""}
                              {adjustment.adjustment_value}%
                            </>
                          )}
                          {adjustment.adjustment_type === "fixed" && (
                            <>
                              <DollarSign className="h-3 w-3 mr-1" />
                              {adjustment.adjustment_value > 0 ? "+" : ""}
                              {formatCurrency(adjustment.adjustment_value)}
                            </>
                          )}
                          {adjustment.adjustment_type === "multiplier" && (
                            <>
                              <X className="h-3 w-3 mr-1" />
                              {adjustment.adjustment_value}x
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ajuste:{" "}
                        <span
                          className={cn(
                            "font-semibold",
                            adjustment.final_adjustment > 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {adjustment.final_adjustment > 0 ? "+" : ""}
                          {formatCurrency(adjustment.final_adjustment)}
                        </span>
                      </p>
                    </div>
                    <div
                      className={cn(
                        "text-lg font-bold",
                        adjustment.final_adjustment > 0 ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {adjustment.final_adjustment > 0 ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <TrendingDown className="h-5 w-5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground text-center">
                Nenhum ajuste aplicado para esta data
              </p>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

