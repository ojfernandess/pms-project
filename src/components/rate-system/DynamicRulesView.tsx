import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, GripVertical, AlertCircle } from "lucide-react";
import { DynamicPricingRule } from "@/hooks/useRateSystem";
import { DynamicRuleDialog } from "./DynamicRuleDialog";
import { RuleImpactSummary } from "./RuleImpactSummary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface DynamicRulesViewProps {
  rules: DynamicPricingRule[];
  isLoading: boolean;
  categories: any[];
  ratePlans: any[];
  rateCalendar?: Array<{ pricing_plan_id: string; category_id: string; date: string; base_price: number }>;
  onCreate: (rule: Partial<DynamicPricingRule>) => void;
  onUpdate: (id: string, rule: Partial<DynamicPricingRule>) => void;
  onDelete: (id: string) => void;
}

export const DynamicRulesView = ({
  rules,
  isLoading,
  categories,
  ratePlans,
  rateCalendar = [],
  onCreate,
  onUpdate,
  onDelete,
}: DynamicRulesViewProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<DynamicPricingRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  const handleCreate = () => {
    setSelectedRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: DynamicPricingRule) => {
    setSelectedRule(rule);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRuleToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (ruleToDelete) {
      onDelete(ruleToDelete);
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    }
  };

  const handleSave = (rule: Partial<DynamicPricingRule>) => {
    if (selectedRule && selectedRule.id) {
      onUpdate({ id: selectedRule.id, ...rule });
    } else {
      onCreate(rule);
    }
    setDialogOpen(false);
    setSelectedRule(null);
  };

  const getTriggerTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      occupancy: "Ocupação",
      booking_velocity: "Velocidade de Reservas",
      day_of_week: "Dia da Semana",
      advance_booking: "Antecedência",
      local_event: "Evento Local",
      custom: "Personalizado",
    };
    return labels[type] || type;
  };

  const getAdjustmentLabel = (rule: DynamicPricingRule) => {
    // Verificar se tem o novo formato de faixas de ocupação
    if (rule.trigger_type === "occupancy" && rule.trigger_condition?.occupancy_ranges) {
      const ranges = rule.trigger_condition.occupancy_ranges;
      if (Array.isArray(ranges) && ranges.length > 0) {
        // Mostrar resumo das faixas
        const adjustments = ranges
          .map((r: any) => {
            const adj = r.adjustment || 0;
            const min = r.min || 0;
            const max = r.max || 100;
            if (adj === 0) return null;
            return `${min}-${max}%: ${adj > 0 ? "+" : ""}${adj}%`;
          })
          .filter(Boolean);
        
        if (adjustments.length > 0) {
          return adjustments.join(", ");
        }
        return "0% (sem ajustes)";
      }
    }
    
    // Formato antigo ou outros tipos
    if (rule.adjustment_type === "percentage") {
      return `${rule.adjustment_value > 0 ? "+" : ""}${rule.adjustment_value}%`;
    } else if (rule.adjustment_type === "fixed") {
      return `R$ ${rule.adjustment_value > 0 ? "+" : ""}${rule.adjustment_value.toFixed(2)}`;
    } else {
      return `×${rule.adjustment_value}`;
    }
  };

  if (isLoading) {
    return <div className="text-center p-8">Carregando regras dinâmicas...</div>;
  }

  // Ordenar por prioridade
  const sortedRules = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Regras de Precificação Dinâmica</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure regras automáticas para ajustar preços baseado em condições específicas
          </p>
        </div>
        <Button className="gap-2" onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          Nova Regra
        </Button>
      </div>

      {rateCalendar.length > 0 && rules.filter((r) => r.is_active).length > 0 && (
        <RuleImpactSummary
          rules={rules}
          rateCalendar={rateCalendar}
          categories={categories}
          ratePlans={ratePlans}
        />
      )}

      {rules.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma regra configurada</h3>
          <p className="text-gray-500 mb-4">
            Crie regras dinâmicas para ajustar automaticamente os preços baseado em ocupação, demanda e outros fatores.
          </p>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Primeira Regra
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 w-20">Prioridade</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nome da Regra</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Gatilho</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ajuste</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Período</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center font-semibold text-blue-700">
                        {rule.priority}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-gray-500 mt-1">{rule.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline">{getTriggerTypeLabel(rule.trigger_type)}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      {rule.trigger_type === "occupancy" && rule.trigger_condition?.occupancy_ranges ? (
                        <div className="space-y-1">
                          {rule.trigger_condition.occupancy_ranges.map((range: any, idx: number) => {
                            const adj = range.adjustment || 0;
                            if (adj === 0 && idx > 0) return null; // Omitir média ocupação se for 0
                            return (
                              <Badge 
                                key={idx}
                                variant={adj > 0 ? "default" : adj < 0 ? "destructive" : "secondary"}
                                className="mr-1"
                              >
                                {range.min}-{range.max}%: {adj > 0 ? "+" : ""}{adj}%
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                      <Badge variant={rule.adjustment_value > 0 ? "default" : "secondary"}>
                        {getAdjustmentLabel(rule)}
                      </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {rule.start_date && rule.end_date ? (
                          <>
                            {(() => {
                              // Parse date string without timezone conversion
                              const parseDateStr = (dateStr: string) => {
                                if (typeof dateStr === 'string') {
                                  const dateParts = dateStr.split('T')[0].split('-');
                                  if (dateParts.length === 3) {
                                    const year = parseInt(dateParts[0], 10);
                                    const month = parseInt(dateParts[1], 10) - 1;
                                    const day = parseInt(dateParts[2], 10);
                                    return new Date(year, month, day);
                                  }
                                }
                                return new Date(dateStr);
                              };
                              const startDate = parseDateStr(rule.start_date);
                              const endDate = parseDateStr(rule.end_date);
                              return (
                                <>
                                  {format(startDate, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                                  {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                                </>
                              );
                            })()}
                          </>
                        ) : (
                          <span className="text-gray-400">Sem limite</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={rule.is_active ? "default" : "secondary"}>
                        {rule.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rule)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DynamicRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={selectedRule}
        categories={categories}
        ratePlans={ratePlans}
        rateCalendar={rateCalendar}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
