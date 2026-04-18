import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { usePricing } from "@/hooks/usePricing";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface SeasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  seasonId?: string;
  planId?: string;
}

export const SeasonDialog = ({ open, onOpenChange, onSuccess, seasonId, planId }: SeasonDialogProps) => {
  const { seasons, createSeason, updateSeason, isCreating } = usePricing();
  const { plans } = usePricingPlans();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
    multiplier: "1.0",
    description: "",
    is_active: true,
    pricing_plan_id: planId || "",
  });

  useEffect(() => {
    if (seasonId && open) {
      const season = seasons.find((s: any) => s.id === seasonId);
      if (season) {
        setFormData({
          name: season.name || "",
          start_date: season.start_date || "",
          end_date: season.end_date || "",
          multiplier: String(season.multiplier || 1.0),
          description: season.description || "",
          is_active: season.is_active ?? true,
          pricing_plan_id: season.pricing_plan_id || planId || "",
        });
      }
    } else if (!seasonId && open) {
      setFormData({
        name: "",
        start_date: "",
        end_date: "",
        multiplier: "1.0",
        description: "",
        is_active: true,
        pricing_plan_id: planId || "",
      });
    }
  }, [seasonId, open, seasons, planId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        multiplier: parseFloat(formData.multiplier),
        pricing_plan_id: formData.pricing_plan_id || null,
      };

      if (seasonId) {
        await updateSeason({ id: seasonId, ...data });
      } else {
        await createSeason(data);
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
          <DialogTitle>{seasonId ? "Editar Temporada" : "Nova Temporada"}</DialogTitle>
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

          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Alta Temporada Verão"
              required
            />
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

          <div>
            <Label htmlFor="multiplier">Multiplicador *</Label>
            <Input
              id="multiplier"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.multiplier}
              onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}
              placeholder="1.0 = 100%, 1.5 = 150%"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Multiplicador do preço base (1.0 = preço normal, 1.5 = 50% mais caro)
            </p>
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
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
              ) : seasonId ? (
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

