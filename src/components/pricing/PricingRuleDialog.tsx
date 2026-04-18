import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePricing } from "@/hooks/usePricing";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { Loader2 } from "lucide-react";

interface PricingRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  ruleId?: string;
  planId?: string;
}

export const PricingRuleDialog = ({
  open,
  onOpenChange,
  onSuccess,
  ruleId,
  planId,
}: PricingRuleDialogProps) => {
  const { rules, seasons, createRule, updateRule, isCreating } = usePricing();
  const { plans } = usePricingPlans();
  const [loading, setLoading] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["room_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState({
    category_id: "",
    season_id: "",
    day_of_week: "",
    price_override: "",
    multiplier: "",
    min_stay_nights: "",
    is_active: true,
    pricing_plan_id: planId || "",
  });

  useEffect(() => {
    if (ruleId && open) {
      const rule = rules.find((r: any) => r.id === ruleId);
      if (rule) {
        setFormData({
          category_id: rule.category_id || "",
          season_id: rule.season_id || "",
          day_of_week: rule.day_of_week !== null ? String(rule.day_of_week) : "",
          price_override: rule.price_override ? String(rule.price_override) : "",
          multiplier: rule.multiplier ? String(rule.multiplier) : "",
          min_stay_nights: rule.min_stay_nights ? String(rule.min_stay_nights) : "",
          is_active: rule.is_active ?? true,
          pricing_plan_id: rule.pricing_plan_id || planId || "",
        });
      }
    } else if (!ruleId && open) {
      setFormData({
        category_id: "",
        season_id: "",
        day_of_week: "",
        price_override: "",
        multiplier: "",
        min_stay_nights: "",
        is_active: true,
        pricing_plan_id: planId || "",
      });
    }
  }, [ruleId, open, rules, planId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data: any = {
        category_id: formData.category_id,
        is_active: formData.is_active,
        pricing_plan_id: formData.pricing_plan_id || null,
      };

      if (formData.season_id && formData.season_id !== "__all__") {
        data.season_id = formData.season_id;
      }
      if (formData.day_of_week && formData.day_of_week !== "__all__") {
        data.day_of_week = parseInt(formData.day_of_week);
      }
      if (formData.price_override) data.price_override = parseFloat(formData.price_override);
      if (formData.multiplier) data.multiplier = parseFloat(formData.multiplier);
      if (formData.min_stay_nights) data.min_stay_nights = parseInt(formData.min_stay_nights);

      if (ruleId) {
        await updateRule({ id: ruleId, ...data });
      } else {
        await createRule(data);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const daysOfWeek = [
    { value: "0", label: "Domingo" },
    { value: "1", label: "Segunda-feira" },
    { value: "2", label: "Terça-feira" },
    { value: "3", label: "Quarta-feira" },
    { value: "4", label: "Quinta-feira" },
    { value: "5", label: "Sexta-feira" },
    { value: "6", label: "Sábado" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ruleId ? "Editar Regra" : "Nova Regra de Precificação"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pricing_plan_id">Plano de Tarifa *</Label>
            <Select
              value={formData.pricing_plan_id}
              onValueChange={(value) => setFormData({ ...formData, pricing_plan_id: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category_id">Categoria *</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category: any) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="season_id">Temporada (opcional)</Label>
              <Select
                value={formData.season_id || "__all__"}
                onValueChange={(value) => setFormData({ ...formData, season_id: value === "__all__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as temporadas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as temporadas</SelectItem>
                  {seasons.map((season: any) => (
                    <SelectItem key={season.id} value={season.id}>
                      {season.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="day_of_week">Dia da Semana (opcional)</Label>
              <Select
                value={formData.day_of_week || "__all__"}
                onValueChange={(value) => setFormData({ ...formData, day_of_week: value === "__all__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os dias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os dias</SelectItem>
                  {daysOfWeek.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="min_stay_nights">Mínimo de Noites (opcional)</Label>
              <Input
                id="min_stay_nights"
                type="number"
                min="1"
                value={formData.min_stay_nights}
                onChange={(e) => setFormData({ ...formData, min_stay_nights: e.target.value })}
                placeholder="Ex: 3"
              />
            </div>

            <div>
              <Label htmlFor="price_override">Preço Fixo (opcional)</Label>
              <Input
                id="price_override"
                type="number"
                step="0.01"
                min="0"
                value={formData.price_override}
                onChange={(e) => setFormData({ ...formData, price_override: e.target.value })}
                placeholder="Ex: 250.00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se preenchido, substitui o cálculo de preço
              </p>
            </div>

            <div>
              <Label htmlFor="multiplier">Multiplicador (opcional)</Label>
              <Input
                id="multiplier"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.multiplier}
                onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}
                placeholder="Ex: 1.2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aplicado após o multiplicador da temporada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Ativa</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isCreating || !formData.category_id}>
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : ruleId ? (
                "Atualizar"
              ) : (
                "Criar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

