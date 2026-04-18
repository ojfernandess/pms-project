import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { useCancellationPolicies } from "@/hooks/useCancellationPolicies";
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
  const { policies } = useCancellationPolicies();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cancellation_policy_id: "",
    is_active: true,
  });

  useEffect(() => {
    if (planId && open) {
      const plan = plans.find((p: any) => p.id === planId);
      if (plan) {
        setFormData({
          name: plan.name || "",
          description: plan.description || "",
          cancellation_policy_id: plan.cancellation_policy_id || "",
          is_active: plan.is_active ?? true,
        });
      }
    } else if (!planId && open) {
      setFormData({
        name: "",
        description: "",
        cancellation_policy_id: "",
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

      const planData = {
        ...formData,
        cancellation_policy_id: formData.cancellation_policy_id || null,
      };

      if (planId) {
        await updatePlan({ id: planId, ...planData });
      } else {
        await createPlan(planData);
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

          <div>
            <Label htmlFor="cancellation_policy_id">Política de Cancelamento</Label>
            <Select
              value={formData.cancellation_policy_id || "none"}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  cancellation_policy_id: value === "none" ? "" : value,
                })
              }
            >
              <SelectTrigger id="cancellation_policy_id" className="mt-2">
                <SelectValue placeholder="Selecione uma política de cancelamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {policies
                  .filter((p: any) => p.is_active)
                  .map((policy: any) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              A política de cancelamento será exibida no motor de reservas e na página pública
            </p>
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

