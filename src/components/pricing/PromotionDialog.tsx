import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePricing } from "@/hooks/usePricing";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { Loader2 } from "lucide-react";

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  promotionId?: string;
  planId?: string;
}

export const PromotionDialog = ({
  open,
  onOpenChange,
  onSuccess,
  promotionId,
  planId,
}: PromotionDialogProps) => {
  const { promotions, createPromotion, updatePromotion, isCreating } = usePricing();
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
    code: "",
    name: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    start_date: "",
    end_date: "",
    min_stay_nights: "",
    max_stay_nights: "",
    applicable_categories: [] as string[],
    is_active: true,
    usage_limit: "",
    pricing_plan_id: planId || "",
  });

  useEffect(() => {
    if (promotionId && open) {
      const promotion = promotions.find((p: any) => p.id === promotionId);
      if (promotion) {
        setFormData({
          code: promotion.code || "",
          name: promotion.name || "",
          description: promotion.description || "",
          discount_type: promotion.discount_type || "percentage",
          discount_value: String(promotion.discount_value || ""),
          start_date: promotion.start_date || "",
          end_date: promotion.end_date || "",
          min_stay_nights: promotion.min_stay_nights ? String(promotion.min_stay_nights) : "",
          max_stay_nights: promotion.max_stay_nights ? String(promotion.max_stay_nights) : "",
          applicable_categories: promotion.applicable_categories || [],
          is_active: promotion.is_active ?? true,
          usage_limit: promotion.usage_limit ? String(promotion.usage_limit) : "",
          pricing_plan_id: promotion.pricing_plan_id || planId || "",
        });
      }
    } else if (!promotionId && open) {
      setFormData({
        code: "",
        name: "",
        description: "",
        discount_type: "percentage",
        discount_value: "",
        start_date: "",
        end_date: "",
        min_stay_nights: "",
        max_stay_nights: "",
        applicable_categories: [],
        is_active: true,
        usage_limit: "",
        pricing_plan_id: planId || "",
      });
    }
  }, [promotionId, open, promotions, planId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data: any = {
        name: formData.name,
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_active: formData.is_active,
        pricing_plan_id: formData.pricing_plan_id || null,
      };

      if (formData.code) data.code = formData.code;
      if (formData.min_stay_nights) data.min_stay_nights = parseInt(formData.min_stay_nights);
      if (formData.max_stay_nights) data.max_stay_nights = parseInt(formData.max_stay_nights);
      if (formData.usage_limit) data.usage_limit = parseInt(formData.usage_limit);
      if (formData.applicable_categories.length > 0) {
        data.applicable_categories = formData.applicable_categories;
      }

      if (promotionId) {
        await updatePromotion({ id: promotionId, ...data });
      } else {
        await createPromotion(data);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFormData({
      ...formData,
      applicable_categories: formData.applicable_categories.includes(categoryId)
        ? formData.applicable_categories.filter((id) => id !== categoryId)
        : [...formData.applicable_categories, categoryId],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{promotionId ? "Editar Promoção" : "Nova Promoção"}</DialogTitle>
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
              <Label htmlFor="code">Código (opcional)</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="Ex: VERÃO2024"
              />
            </div>
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="discount_type">Tipo de Desconto *</Label>
              <Select
                value={formData.discount_type}
                onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="discount_value">Valor do Desconto *</Label>
              <Input
                id="discount_value"
                type="number"
                step="0.01"
                min="0"
                max={formData.discount_type === "percentage" ? "100" : undefined}
                value={formData.discount_value}
                onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                placeholder={formData.discount_type === "percentage" ? "Ex: 15" : "Ex: 50.00"}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Data Início *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_date">Data Fim *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="min_stay_nights">Mín. Noites</Label>
              <Input
                id="min_stay_nights"
                type="number"
                min="1"
                value={formData.min_stay_nights}
                onChange={(e) => setFormData({ ...formData, min_stay_nights: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="max_stay_nights">Máx. Noites</Label>
              <Input
                id="max_stay_nights"
                type="number"
                min="1"
                value={formData.max_stay_nights}
                onChange={(e) => setFormData({ ...formData, max_stay_nights: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="usage_limit">Limite de Uso</Label>
              <Input
                id="usage_limit"
                type="number"
                min="1"
                value={formData.usage_limit}
                onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                placeholder="Ilimitado"
              />
            </div>
          </div>

          <div>
            <Label>Categorias Aplicáveis</Label>
            <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
              {categories?.map((category: any) => (
                <div key={category.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`cat-${category.id}`}
                    checked={formData.applicable_categories.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    className="rounded"
                  />
                  <label htmlFor={`cat-${category.id}`} className="text-sm">
                    {category.name}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Deixe vazio para aplicar a todas as categorias
            </p>
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
            <Button type="submit" disabled={loading || isCreating}>
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : promotionId ? (
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

