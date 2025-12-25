import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, isAfter, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X, TrendingDown, Minus, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { DynamicPricingRule } from "@/hooks/useRateSystem";
import { toast } from "sonner";

interface DynamicRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: DynamicPricingRule | null;
  categories: any[];
  ratePlans: any[];
  onSave: (rule: Partial<DynamicPricingRule>) => void;
}

export const DynamicRuleDialog = ({
  open,
  onOpenChange,
  rule,
  categories,
  ratePlans,
  onSave,
}: DynamicRuleDialogProps) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    trigger_type: "occupancy" as "occupancy" | "booking_velocity" | "day_of_week" | "advance_booking" | "local_event" | "custom",
    trigger_condition: {
      occupancy_ranges: [
        { name: "Baixa Ocupação", min: 0, max: 30, adjustment: -15, base_value: null },
        { name: "Média Ocupação", min: 31, max: 60, adjustment: 0, base_value: null },
        { name: "Alta Ocupação", min: 61, max: 80, adjustment: 10, base_value: null },
      ]
    } as any,
    adjustment_type: "percentage" as "percentage" | "fixed" | "multiplier",
    adjustment_value: 0,
    priority: 1,
    is_active: true,
    applicable_categories: [] as string[],
    applicable_plans: [] as string[],
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
    use_occupancy: false,
    use_pickup_rate: false,
    use_demand_history: false,
  });

  const previousRuleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      // Só atualizar o form se for uma regra diferente ou se o dialog acabou de abrir
      const currentRuleId = rule?.id || null;
      const isNewRule = currentRuleId !== previousRuleIdRef.current;
      
      if (isNewRule || !previousRuleIdRef.current) {
        previousRuleIdRef.current = currentRuleId;
        
      if (rule) {
          // Parse dates without timezone conversion - treat as local dates
          let ruleStartDate: Date | undefined = undefined;
          let ruleEndDate: Date | undefined = undefined;
          
          if (rule.start_date) {
            // If it's already a Date object, use it directly
            if (rule.start_date instanceof Date) {
              ruleStartDate = startOfDay(rule.start_date);
            } else if (typeof rule.start_date === 'string') {
              // Parse as ISO date string (YYYY-MM-DD) and treat as local date
              // Split to avoid timezone issues
              const dateParts = rule.start_date.split('T')[0].split('-');
              if (dateParts.length === 3) {
                const year = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(dateParts[2], 10);
                ruleStartDate = startOfDay(new Date(year, month, day));
              } else {
                ruleStartDate = startOfDay(parseISO(rule.start_date));
              }
            }
          }
          
          if (rule.end_date) {
            // If it's already a Date object, use it directly
            if (rule.end_date instanceof Date) {
              ruleEndDate = startOfDay(rule.end_date);
            } else if (typeof rule.end_date === 'string') {
              // Parse as ISO date string (YYYY-MM-DD) and treat as local date
              // Split to avoid timezone issues
              const dateParts = rule.end_date.split('T')[0].split('-');
              if (dateParts.length === 3) {
                const year = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(dateParts[2], 10);
                ruleEndDate = startOfDay(new Date(year, month, day));
              } else {
                ruleEndDate = startOfDay(parseISO(rule.end_date));
              }
            }
          }
          
          // Parse trigger_condition - suportar formato antigo e novo
          let triggerCondition = rule.trigger_condition || {};
          if (!triggerCondition.occupancy_ranges && rule.trigger_type === "occupancy") {
            // Migrar formato antigo para novo
            triggerCondition = {
              occupancy_ranges: [
                { 
                  name: "Baixa Ocupação", 
                  min: triggerCondition.min_occupancy || 0, 
                  max: triggerCondition.max_occupancy || 30, 
                  adjustment: rule.adjustment_value || -15, 
                  base_value: triggerCondition.base_value || null 
                },
                { 
                  name: "Média Ocupação", 
                  min: 31, 
                  max: 60, 
                  adjustment: 0, 
                  base_value: null 
                },
                { 
                  name: "Alta Ocupação", 
                  min: 61, 
                  max: 80, 
                  adjustment: 10, 
                  base_value: null 
                },
              ]
            };
          } else if (!triggerCondition.occupancy_ranges) {
            // Se não tem occupancy_ranges, criar padrão
            triggerCondition = {
              occupancy_ranges: [
                { name: "Baixa Ocupação", min: 0, max: 30, adjustment: -15, base_value: null },
                { name: "Média Ocupação", min: 31, max: 60, adjustment: 0, base_value: null },
                { name: "Alta Ocupação", min: 61, max: 80, adjustment: 10, base_value: null },
              ]
            };
          }
          
        setFormData({
          name: rule.name || "",
          description: rule.description || "",
          trigger_type: rule.trigger_type || "occupancy",
            trigger_condition: triggerCondition,
          adjustment_type: rule.adjustment_type || "percentage",
          adjustment_value: rule.adjustment_value || 0,
          priority: rule.priority || 1,
          is_active: rule.is_active ?? true,
          applicable_categories: rule.applicable_categories || [],
          applicable_plans: rule.applicable_plans || [],
            start_date: ruleStartDate,
            end_date: ruleEndDate,
          use_occupancy: rule.use_occupancy ?? false,
          use_pickup_rate: rule.use_pickup_rate ?? false,
          use_demand_history: rule.use_demand_history ?? false,
        });
      } else {
        setFormData({
          name: "",
          description: "",
          trigger_type: "occupancy",
            trigger_condition: {
              occupancy_ranges: [
                { name: "Baixa Ocupação", min: 0, max: 30, adjustment: -15, base_value: null },
                { name: "Média Ocupação", min: 31, max: 60, adjustment: 0, base_value: null },
                { name: "Alta Ocupação", min: 61, max: 80, adjustment: 10, base_value: null },
              ]
            },
          adjustment_type: "percentage",
          adjustment_value: 0,
          priority: 1,
          is_active: true,
          applicable_categories: [],
          applicable_plans: [],
          start_date: undefined,
          end_date: undefined,
          use_occupancy: false,
          use_pickup_rate: false,
          use_demand_history: false,
        });
      }
      }
    } else {
      // Reset quando o dialog fecha
      previousRuleIdRef.current = null;
    }
  }, [open, rule]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      return;
    }

    // Preparar dados para salvar
    // Garantir que as datas sejam salvas no formato YYYY-MM-DD sem timezone
    // IMPORTANTE: Usar métodos locais (não UTC) para garantir que salvamos a data que o usuário selecionou
    let startDateStr: string | null = null;
    let endDateStr: string | null = null;
    
    if (formData.start_date) {
      // Usar getFullYear, getMonth, getDate (métodos locais) para salvar a data exata que o usuário selecionou
      // Isso garante que a data salva corresponde à data visualizada no calendário
      const year = formData.start_date.getFullYear();
      const month = String(formData.start_date.getMonth() + 1).padStart(2, '0');
      const day = String(formData.start_date.getDate()).padStart(2, '0');
      startDateStr = `${year}-${month}-${day}`;
    }
    
    if (formData.end_date) {
      // Usar getFullYear, getMonth, getDate (métodos locais) para salvar a data exata que o usuário selecionou
      // Isso garante que a data salva corresponde à data visualizada no calendário
      const year = formData.end_date.getFullYear();
      const month = String(formData.end_date.getMonth() + 1).padStart(2, '0');
      const day = String(formData.end_date.getDate()).padStart(2, '0');
      endDateStr = `${year}-${month}-${day}`;
    }
    
    // Calcular adjustment_value representativo para exibição
    // Para regras de ocupação com faixas, calcular uma média ponderada ou usar o primeiro valor não-zero
    let calculatedAdjustmentValue = formData.adjustment_value || 0;
    
    if (formData.trigger_type === "occupancy" && formData.trigger_condition?.occupancy_ranges) {
      const ranges = formData.trigger_condition.occupancy_ranges;
      if (Array.isArray(ranges) && ranges.length > 0) {
        // Encontrar o primeiro ajuste não-zero, ou calcular média ponderada
        const nonZeroAdjustments = ranges
          .map((r: any) => r.adjustment || 0)
          .filter((adj: number) => adj !== 0);
        
        if (nonZeroAdjustments.length > 0) {
          // Usar o primeiro ajuste não-zero como representativo
          calculatedAdjustmentValue = nonZeroAdjustments[0];
        } else {
          // Se todos são zero, usar 0
          calculatedAdjustmentValue = 0;
        }
      }
    }
    
    const dataToSave: any = {
      name: formData.name,
      description: formData.description || null,
      trigger_type: formData.trigger_type,
      trigger_condition: formData.trigger_condition || {},
      adjustment_type: formData.adjustment_type,
      // Usar o valor calculado que representa melhor as faixas
      adjustment_value: calculatedAdjustmentValue,
      priority: formData.priority,
      is_active: formData.is_active,
      applicable_categories: formData.applicable_categories.length > 0 ? formData.applicable_categories : null,
      applicable_plans: formData.applicable_plans.length > 0 ? formData.applicable_plans : null,
      start_date: startDateStr,
      end_date: endDateStr,
      use_occupancy: formData.use_occupancy,
      use_pickup_rate: formData.use_pickup_rate,
      use_demand_history: formData.use_demand_history,
    };

    onSave(dataToSave);
    onOpenChange(false);
  };

  const toggleCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      applicable_categories: prev.applicable_categories.includes(categoryId)
        ? prev.applicable_categories.filter(id => id !== categoryId)
        : [...prev.applicable_categories, categoryId],
    }));
  };

  const togglePlan = (planId: string) => {
    setFormData(prev => ({
      ...prev,
      applicable_plans: prev.applicable_plans.includes(planId)
        ? prev.applicable_plans.filter(id => id !== planId)
        : [...prev.applicable_plans, planId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar Regra Dinâmica" : "Nova Regra Dinâmica"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome da Regra *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Aumento de preço em alta ocupação"
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva quando e como esta regra deve ser aplicada"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Prioridade *</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-gray-500 mt-1">Menor número = maior prioridade</p>
              </div>

              <div>
                <Label htmlFor="trigger_type">Tipo de Gatilho *</Label>
                <Select
                  value={formData.trigger_type}
                  onValueChange={(value: any) => {
                    // Resetar trigger_condition quando mudar o tipo
                    const newTriggerCondition = value === "occupancy" 
                      ? {
                          occupancy_ranges: [
                            { name: "Baixa Ocupação", min: 0, max: 30, adjustment: -15, base_value: null },
                            { name: "Média Ocupação", min: 31, max: 60, adjustment: 0, base_value: null },
                            { name: "Alta Ocupação", min: 61, max: 80, adjustment: 10, base_value: null },
                          ]
                        }
                      : {};
                    setFormData({ 
                      ...formData, 
                      trigger_type: value,
                      trigger_condition: newTriggerCondition,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="occupancy">Ocupação</SelectItem>
                    <SelectItem value="booking_velocity">Velocidade de Reservas</SelectItem>
                    <SelectItem value="day_of_week">Dia da Semana</SelectItem>
                    <SelectItem value="advance_booking">Antecedência de Reserva</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Condições do Gatilho */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Condições do Gatilho</h3>
            
            {/* Faixas de Ocupação - Apenas para trigger_type = occupancy */}
            {formData.trigger_type === "occupancy" && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground">Faixas de Ocupação e Ajustes</h4>
            
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900 mb-4">
              <p className="text-xs text-amber-900 dark:text-amber-100 font-semibold mb-1">
                ⚖️ Ajustes Proporcionais Automáticos:
              </p>
              <ul className="list-disc list-inside text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
                <li>10+ quartos: 100% do ajuste</li>
                <li>5-9 quartos: 75-100% do ajuste</li>
                <li>2-4 quartos: 60-75% do ajuste</li>
                <li>1 quarto: 50% do ajuste</li>
              </ul>
            </div>

            {formData.trigger_condition?.occupancy_ranges?.map((range: any, index: number) => {
              const icons = [TrendingDown, Minus, TrendingUp];
              const Icon = icons[index] || Minus;
              const colors = [
                { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-900", text: "text-red-900 dark:text-red-100" },
                { bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200 dark:border-blue-900", text: "text-blue-900 dark:text-blue-100" },
                { bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-200 dark:border-green-900", text: "text-green-900 dark:text-green-100" },
              ];
              const color = colors[index] || colors[1];
              
              return (
                <div
                  key={index}
                  className={cn(
                    "p-4 rounded-lg border space-y-4",
                    color.bg,
                    color.border
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn("h-5 w-5", color.text)} />
                    <h4 className={cn("font-semibold", color.text)}>{range.name}</h4>
                  </div>
                  
                  <p className="text-xs text-muted-foreground mb-3">
                    {index === 0 && "Quando a ocupação está baixa, reduzir preços para atrair mais reservas"}
                    {index === 1 && "Manter preços estáveis quando a ocupação está em níveis normais"}
                    {index === 2 && "Aumentar preços quando a ocupação está alta para maximizar receita"}
                  </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                      <Label>Mínimo (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                        step="0.1"
                        value={range.min ?? ""}
                        onChange={(e) => {
                          const newRanges = [...(formData.trigger_condition?.occupancy_ranges || [])];
                          newRanges[index] = { ...newRanges[index], min: parseFloat(e.target.value) || 0 };
                          setFormData({
                      ...formData,
                            trigger_condition: { ...formData.trigger_condition, occupancy_ranges: newRanges },
                          });
                        }}
                  />
                </div>
                <div>
                      <Label>Máximo (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                        step="0.1"
                        value={range.max ?? ""}
                        onChange={(e) => {
                          const newRanges = [...(formData.trigger_condition?.occupancy_ranges || [])];
                          newRanges[index] = { ...newRanges[index], max: parseFloat(e.target.value) || 100 };
                          setFormData({
                            ...formData,
                            trigger_condition: { ...formData.trigger_condition, occupancy_ranges: newRanges },
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ajuste (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="-100"
                        max="100"
                        value={range.adjustment ?? ""}
                        onChange={(e) => {
                          const newRanges = [...(formData.trigger_condition?.occupancy_ranges || [])];
                          newRanges[index] = { ...newRanges[index], adjustment: parseFloat(e.target.value) || 0 };
                          setFormData({
                            ...formData,
                            trigger_condition: { ...formData.trigger_condition, occupancy_ranges: newRanges },
                          });
                        }}
                        className={cn(
                          range.adjustment < 0 && "text-red-600 dark:text-red-400",
                          range.adjustment > 0 && "text-green-600 dark:text-green-400"
                        )}
                      />
                      {range.adjustment < 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Desconto de {Math.abs(range.adjustment)}%
                        </p>
                      )}
                      {range.adjustment > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Aumento de {range.adjustment}%
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Valor Base (R$) (opcional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Deixe vazio para usar valor base da tarifa"
                        value={range.base_value ?? ""}
                        onChange={(e) => {
                          const newRanges = [...(formData.trigger_condition?.occupancy_ranges || [])];
                          newRanges[index] = { 
                            ...newRanges[index], 
                            base_value: e.target.value === "" ? null : parseFloat(e.target.value) || null 
                          };
                          setFormData({
                      ...formData,
                            trigger_condition: { ...formData.trigger_condition, occupancy_ranges: newRanges },
                          });
                        }}
                  />
                      <p className="text-xs text-muted-foreground mt-1">
                        Deixe vazio para usar o valor base da tarifa
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Se definido, este valor será usado como base ao invés do valor base da tarifa
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            )}

            {/* Velocidade de Reservas */}
            {formData.trigger_type === "booking_velocity" && (
              <div className="space-y-4">
              <div>
                <Label>Reservas por Dia (mínimo)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.trigger_condition.min_bookings || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    trigger_condition: { ...formData.trigger_condition, min_bookings: parseInt(e.target.value) || 0 },
                  })}
                />
                  <p className="text-xs text-muted-foreground mt-1">
                    Aplicar quando houver pelo menos este número de reservas por dia
                  </p>
                </div>
              </div>
            )}

            {/* Dia da Semana */}
            {formData.trigger_type === "day_of_week" && (
              <div className="space-y-4">
                <Label>Dias da Semana</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"].map((day, index) => (
                    <Badge
                      key={index}
                      variant={formData.trigger_condition.days?.includes(index) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const days = formData.trigger_condition.days || [];
                        const newDays = days.includes(index)
                          ? days.filter(d => d !== index)
                          : [...days, index];
                        setFormData({
                          ...formData,
                          trigger_condition: { ...formData.trigger_condition, days: newDays },
                        });
                      }}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione os dias da semana em que esta regra deve ser aplicada
                </p>
              </div>
            )}

            {/* Antecedência de Reserva */}
            {formData.trigger_type === "advance_booking" && (
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dias Antecedência (mínimo)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.trigger_condition.min_days || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      trigger_condition: { ...formData.trigger_condition, min_days: parseInt(e.target.value) || 0 },
                    })}
                  />
                    <p className="text-xs text-muted-foreground mt-1">
                      Aplicar para reservas com pelo menos este número de dias de antecedência
                    </p>
                </div>
                <div>
                  <Label>Dias Antecedência (máximo)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.trigger_condition.max_days || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      trigger_condition: { ...formData.trigger_condition, max_days: parseInt(e.target.value) || 365 },
                    })}
                  />
                    <p className="text-xs text-muted-foreground mt-1">
                      Aplicar para reservas com no máximo este número de dias de antecedência
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Personalizado */}
            {formData.trigger_type === "custom" && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Regras personalizadas podem ser configuradas através de condições customizadas no trigger_condition.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Ajuste de Preço */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Ajuste de Preço</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="adjustment_type">Tipo de Ajuste *</Label>
                <Select
                  value={formData.adjustment_type}
                  onValueChange={(value: any) => setFormData({ ...formData, adjustment_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    <SelectItem value="multiplier">Multiplicador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="adjustment_value">
                  Valor do Ajuste *
                  {formData.adjustment_type === "percentage" && " (%)"}
                  {formData.adjustment_type === "fixed" && " (R$)"}
                  {formData.adjustment_type === "multiplier" && " (x)"}
                </Label>
                <Input
                  id="adjustment_value"
                  type="number"
                  step={formData.adjustment_type === "percentage" ? "0.1" : "0.01"}
                  min={formData.adjustment_type === "percentage" ? "-100" : undefined}
                  value={formData.adjustment_value}
                  onChange={(e) => setFormData({ ...formData, adjustment_value: parseFloat(e.target.value) || 0 })}
                />
                {formData.trigger_type === "occupancy" && formData.adjustment_type === "percentage" && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                    {formData.adjustment_value < 0 ? (
                      <p className="text-green-600 dark:text-green-400">
                        ✓ Desconto de {Math.abs(formData.adjustment_value)}% será aplicado quando a ocupação estiver dentro do range definido
                      </p>
                    ) : formData.adjustment_value > 0 ? (
                      <p className="text-red-600 dark:text-red-400">
                        ⚠ Aumento de {formData.adjustment_value}% será aplicado quando a ocupação estiver dentro do range definido
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Para ocupação, use as faixas acima. Este valor será usado apenas para compatibilidade.
                      </p>
                    )}
                  </div>
                )}
                {formData.trigger_type !== "occupancy" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.adjustment_type === "percentage" && "Use valores negativos para desconto (ex: -10) ou positivos para aumento (ex: +15)"}
                    {formData.adjustment_type === "fixed" && "Valor fixo a ser adicionado ou subtraído do preço base"}
                    {formData.adjustment_type === "multiplier" && "Multiplicador do preço base (ex: 1.2 = +20%, 0.9 = -10%)"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Métricas a Utilizar */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Métricas a Utilizar</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="use_occupancy">Considerar Ocupação Atual</Label>
                <Switch
                  id="use_occupancy"
                  checked={formData.use_occupancy}
                  onCheckedChange={(checked) => setFormData({ ...formData, use_occupancy: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="use_pickup_rate">Considerar Pickup Rate</Label>
                <Switch
                  id="use_pickup_rate"
                  checked={formData.use_pickup_rate}
                  onCheckedChange={(checked) => setFormData({ ...formData, use_pickup_rate: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label htmlFor="use_demand_history">Considerar Histórico de Demanda</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Busca valores do mesmo mês do ano anterior no tarifário para ajustar preços
                  </p>
              </div>
                <Switch
                  id="use_demand_history"
                  checked={formData.use_demand_history}
                  onCheckedChange={(checked) => setFormData({ ...formData, use_demand_history: checked })}
                />
              </div>
            </div>
          </div>

          {/* Aplicabilidade */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Aplicabilidade</h3>
            
            <div>
              <Label>Período de Validade</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.start_date ? format(formData.start_date, "dd/MM/yyyy", { locale: ptBR }) : "Data inicial"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.start_date}
                      onSelect={(date) => {
                        if (!date) {
                          setFormData((prev) => ({ ...prev, start_date: undefined }));
                          return;
                        }
                        const normalizedDate = startOfDay(date);
                        // Verificar se a data final existe e é anterior à data inicial
                        setFormData((prev) => {
                          if (prev.end_date && isBefore(prev.end_date, normalizedDate)) {
                            toast.warning("A data inicial não pode ser posterior à data final");
                            return prev; // Não alterar o estado
                          }
                          return { ...prev, start_date: normalizedDate };
                        });
                      }}
                      disabled={(date) => {
                        const normalizedDate = startOfDay(date);
                        // Desabilitar datas futuras se end_date estiver definida e for anterior
                        if (formData.end_date) {
                          return isAfter(normalizedDate, formData.end_date);
                        }
                        return false;
                      }}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.end_date ? format(formData.end_date, "dd/MM/yyyy", { locale: ptBR }) : "Data final"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.end_date}
                      onSelect={(date) => {
                        if (!date) {
                          setFormData((prev) => ({ ...prev, end_date: undefined }));
                          return;
                        }
                        const normalizedDate = startOfDay(date);
                        // Verificar se a data inicial existe e é posterior à data final
                        setFormData((prev) => {
                          if (prev.start_date && isBefore(normalizedDate, prev.start_date)) {
                            toast.warning("A data final não pode ser anterior à data inicial");
                            return prev; // Não alterar o estado
                          }
                          return { ...prev, end_date: normalizedDate };
                        });
                      }}
                      disabled={(date) => {
                        const normalizedDate = startOfDay(date);
                        // Desabilitar datas passadas se start_date estiver definida e for posterior
                        if (formData.start_date) {
                          return isBefore(normalizedDate, formData.start_date);
                        }
                        return false;
                      }}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Categorias Aplicáveis (deixe vazio para todas)</Label>
              <div className="flex flex-wrap gap-2 mt-2 max-h-32 overflow-y-auto p-2 border rounded">
                {categories.map((cat) => (
                  <Badge
                    key={cat.id}
                    variant={formData.applicable_categories.includes(cat.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleCategory(cat.id)}
                  >
                    {cat.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>Planos Tarifários Aplicáveis (deixe vazio para todos)</Label>
              <div className="flex flex-wrap gap-2 mt-2 max-h-32 overflow-y-auto p-2 border rounded">
                {ratePlans.map((plan) => (
                  <Badge
                    key={plan.id}
                    variant={formData.applicable_plans.includes(plan.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => togglePlan(plan.id)}
                  >
                    {plan.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between border-t pt-4">
            <Label htmlFor="is_active">Regra Ativa</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


