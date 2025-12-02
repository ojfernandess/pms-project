import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Copy } from "lucide-react";
import { RatePlan } from "@/hooks/useRateSystem";
import { RatePlanDialog } from "./RatePlanDialog";

interface RatePlansViewProps {
  ratePlans: RatePlan[];
  isLoading: boolean;
  onCreate: (plan: Partial<RatePlan>) => Promise<any>;
  onUpdate: (plan: { id: string } & Partial<RatePlan>) => Promise<any>;
  onDelete: (id: string) => Promise<void>;
}

export const RatePlansView = ({
  ratePlans,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: RatePlansViewProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);

  const handleEdit = (plan: RatePlan) => {
    setEditingPlan(plan);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setDialogOpen(true);
  };

  const handleSave = async (plan: Partial<RatePlan>) => {
    if (editingPlan) {
      await onUpdate({ id: editingPlan.id, ...plan });
    } else {
      await onCreate(plan);
    }
    setDialogOpen(false);
    setEditingPlan(null);
  };

  if (isLoading) {
    return <div className="text-center p-8">Carregando planos tarifários...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Planos Tarifários</h2>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Plano Tarifário
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {ratePlans.map((plan) => (
          <Card key={plan.id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <Badge variant={plan.is_active ? "default" : "secondary"}>
                    {plan.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {plan.plan_type && (
                    <Badge variant="outline">{plan.plan_type}</Badge>
                  )}
                </div>
                {plan.code && (
                  <div className="text-sm text-gray-600 mt-1">Código: {plan.code}</div>
                )}
                {plan.description && (
                  <div className="text-sm text-gray-600 mt-2">{plan.description}</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(plan.id)}>
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <RatePlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        plan={editingPlan}
        onSave={handleSave}
      />
    </div>
  );
};


