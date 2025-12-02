import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RateRestriction } from "@/hooks/useRateSystem";

interface RestrictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restriction?: RateRestriction | null;
  categories: any[];
  ratePlans: any[];
  onSave: (restriction: Partial<RateRestriction>) => void;
}

export const RestrictionDialog = ({
  open,
  onOpenChange,
  restriction,
  categories,
  ratePlans,
  onSave,
}: RestrictionDialogProps) => {
  const [formData, setFormData] = useState({
    restriction_type: "stop_sell" as "stop_sell" | "min_los" | "max_los" | "cta" | "ctd" | "min_price" | "max_price",
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
    category_id: "",
    pricing_plan_id: "",
    value: 0,
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      if (restriction) {
        setFormData({
          restriction_type: restriction.restriction_type || "stop_sell",
          start_date: restriction.start_date ? new Date(restriction.start_date) : undefined,
          end_date: restriction.end_date ? new Date(restriction.end_date) : undefined,
          category_id: restriction.category_id || "",
          pricing_plan_id: restriction.pricing_plan_id || "",
          value: restriction.value || 0,
          notes: restriction.notes || "",
          is_active: restriction.is_active ?? true,
        });
      } else {
        setFormData({
          restriction_type: "stop_sell",
          start_date: undefined,
          end_date: undefined,
          category_id: "",
          pricing_plan_id: "",
          value: 0,
          notes: "",
          is_active: true,
        });
      }
    }
  }, [open, restriction]);

  const handleSave = () => {
    if (!formData.start_date || !formData.end_date) {
      return;
    }

    onSave({
      ...formData,
      start_date: format(formData.start_date, "yyyy-MM-dd"),
      end_date: format(formData.end_date, "yyyy-MM-dd"),
    });
    onOpenChange(false);
  };

  const getRestrictionLabel = () => {
    const labels: Record<string, string> = {
      stop_sell: "Stop Sell (Bloquear Vendas)",
      min_los: "Mínimo de Noites (Min LOS)",
      max_los: "Máximo de Noites (Max LOS)",
      cta: "Close to Arrival (CTA)",
      ctd: "Close to Departure (CTD)",
      min_price: "Preço Mínimo",
      max_price: "Preço Máximo",
    };
    return labels[formData.restriction_type] || formData.restriction_type;
  };

  const needsValue = ["min_los", "max_los", "min_price", "max_price"].includes(formData.restriction_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{restriction ? "Editar Restrição" : "Nova Restrição"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tipo de Restrição */}
          <div>
            <Label htmlFor="restriction_type">Tipo de Restrição *</Label>
            <Select
              value={formData.restriction_type}
              onValueChange={(value: any) => setFormData({ ...formData, restriction_type: value, value: 0 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stop_sell">Stop Sell (Bloquear Vendas)</SelectItem>
                <SelectItem value="min_los">Mínimo de Noites (Min LOS)</SelectItem>
                <SelectItem value="max_los">Máximo de Noites (Max LOS)</SelectItem>
                <SelectItem value="cta">Close to Arrival (CTA)</SelectItem>
                <SelectItem value="ctd">Close to Departure (CTD)</SelectItem>
                <SelectItem value="min_price">Preço Mínimo</SelectItem>
                <SelectItem value="max_price">Preço Máximo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">{getRestrictionLabel()}</p>
          </div>

          {/* Período */}
          <div>
            <Label>Período *</Label>
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

          {/* Categoria e Plano */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category_id">Categoria (opcional)</Label>
              <Select
                value={formData.category_id || "__all__"}
                onValueChange={(value) => setFormData({ ...formData, category_id: value === "__all__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as Categorias</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pricing_plan_id">Plano Tarifário (opcional)</Label>
              <Select
                value={formData.pricing_plan_id || "__all__"}
                onValueChange={(value) => setFormData({ ...formData, pricing_plan_id: value === "__all__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os Planos</SelectItem>
                  {ratePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Valor (se necessário) */}
          {needsValue && (
            <div>
              <Label htmlFor="value">
                {formData.restriction_type === "min_los" || formData.restriction_type === "max_los"
                  ? "Número de Noites *"
                  : formData.restriction_type === "min_price" || formData.restriction_type === "max_price"
                  ? "Valor (R$) *"
                  : "Valor *"}
              </Label>
              <Input
                id="value"
                type="number"
                min="0"
                step={formData.restriction_type.includes("price") ? "0.01" : "1"}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}

          {/* Notas */}
          <div>
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Adicione observações sobre esta restrição"
              rows={3}
            />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Restrição Ativa</Label>
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
          <Button onClick={handleSave} disabled={!formData.start_date || !formData.end_date || (needsValue && formData.value <= 0)}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


