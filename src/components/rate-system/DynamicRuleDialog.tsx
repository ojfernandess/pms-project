import { useState, useEffect } from "react";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DynamicPricingRule } from "@/hooks/useRateSystem";

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
    trigger_condition: {} as any,
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
    use_competitor_prices: false,
    use_local_events: false,
    use_demand_history: false,
  });

  useEffect(() => {
    if (open) {
      if (rule) {
        setFormData({
          name: rule.name || "",
          description: rule.description || "",
          trigger_type: rule.trigger_type || "occupancy",
          trigger_condition: rule.trigger_condition || {},
          adjustment_type: rule.adjustment_type || "percentage",
          adjustment_value: rule.adjustment_value || 0,
          priority: rule.priority || 1,
          is_active: rule.is_active ?? true,
          applicable_categories: rule.applicable_categories || [],
          applicable_plans: rule.applicable_plans || [],
          start_date: rule.start_date ? new Date(rule.start_date) : undefined,
          end_date: rule.end_date ? new Date(rule.end_date) : undefined,
          use_occupancy: rule.use_occupancy ?? false,
          use_pickup_rate: rule.use_pickup_rate ?? false,
          use_competitor_prices: rule.use_competitor_prices ?? false,
          use_local_events: rule.use_local_events ?? false,
          use_demand_history: rule.use_demand_history ?? false,
        });
      } else {
        setFormData({
          name: "",
          description: "",
          trigger_type: "occupancy",
          trigger_condition: {},
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
          use_competitor_prices: false,
          use_local_events: false,
          use_demand_history: false,
        });
      }
    }
  }, [open, rule]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      return;
    }

    onSave({
      ...formData,
      start_date: formData.start_date ? format(formData.start_date, "yyyy-MM-dd") : undefined,
      end_date: formData.end_date ? format(formData.end_date, "yyyy-MM-dd") : undefined,
    });
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
                  onValueChange={(value: any) => setFormData({ ...formData, trigger_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="occupancy">Ocupação</SelectItem>
                    <SelectItem value="booking_velocity">Velocidade de Reservas</SelectItem>
                    <SelectItem value="day_of_week">Dia da Semana</SelectItem>
                    <SelectItem value="advance_booking">Antecedência de Reserva</SelectItem>
                    <SelectItem value="local_event">Evento Local</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Condições do Gatilho */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Condições do Gatilho</h3>
            
            {formData.trigger_type === "occupancy" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ocupação Mínima (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.trigger_condition.min_occupancy || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      trigger_condition: { ...formData.trigger_condition, min_occupancy: parseFloat(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div>
                  <Label>Ocupação Máxima (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.trigger_condition.max_occupancy || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      trigger_condition: { ...formData.trigger_condition, max_occupancy: parseFloat(e.target.value) || 100 },
                    })}
                  />
                </div>
              </div>
            )}

            {formData.trigger_type === "booking_velocity" && (
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
              </div>
            )}

            {formData.trigger_type === "day_of_week" && (
              <div>
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
              </div>
            )}

            {formData.trigger_type === "advance_booking" && (
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
                  value={formData.adjustment_value}
                  onChange={(e) => setFormData({ ...formData, adjustment_value: parseFloat(e.target.value) || 0 })}
                />
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
                <Label htmlFor="use_competitor_prices">Considerar Preços Concorrentes</Label>
                <Switch
                  id="use_competitor_prices"
                  checked={formData.use_competitor_prices}
                  onCheckedChange={(checked) => setFormData({ ...formData, use_competitor_prices: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="use_local_events">Considerar Eventos Locais</Label>
                <Switch
                  id="use_local_events"
                  checked={formData.use_local_events}
                  onCheckedChange={(checked) => setFormData({ ...formData, use_local_events: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="use_demand_history">Considerar Histórico de Demanda</Label>
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
                      onSelect={(date) => setFormData({ ...formData, start_date: date })}
                      locale={ptBR}
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
                      onSelect={(date) => setFormData({ ...formData, end_date: date })}
                      locale={ptBR}
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


