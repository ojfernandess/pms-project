import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { Loader2 } from "lucide-react";

interface PricingPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  planId?: string;
}

export const PricingPlanDialog = ({
  open,
  onOpenChange,
  onSuccess,
  planId,
}: PricingPlanDialogProps) => {
  const { plans, createPlan, updatePlan, isCreating, isUpdating } = usePricingPlans();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    if (planId && open) {
      const plan = plans.find((p: any) => p.id === planId);
      if (plan) {
        setFormData({
          name: plan.name || "",
          description: plan.description || "",
          is_active: plan.is_active ?? true,
        });
      }
    } else if (!planId && open) {
      setFormData({
        name: "",
        description: "",
        is_active: true,
      });
    }
  }, [planId, open, plans]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        throw new Error("Nome do plano é obrigatório");
      }

      if (planId) {
        await updatePlan({ id: planId, ...formData });
      } else {
        await createPlan(formData);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{planId ? "Editar Plano de Tarifa" : "Novo Plano de Tarifa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Plano Principal, Plano OTA, etc."
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição do plano de tarifa"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Ativo</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isCreating || isUpdating}>
              {loading || isCreating || isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : planId ? (
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

