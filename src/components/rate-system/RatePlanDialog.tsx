import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RatePlan } from "@/hooks/useRateSystem";
import { usePlanTypes } from "@/hooks/usePlanTypes";

interface RatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: RatePlan | null;
  onSave: (plan: Partial<RatePlan>) => void;
}

export const RatePlanDialog = ({
  open,
  onOpenChange,
  plan,
  onSave,
}: RatePlanDialogProps) => {
  const { activePlanTypes } = usePlanTypes();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [planType, setPlanType] = useState<string>("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setCode(plan.code || "");
      setDescription(plan.description || "");
      setPlanType(plan.plan_type || "");
      setIsActive(plan.is_active);
    } else {
      setName("");
      setCode("");
      setDescription("");
      // Definir o primeiro tipo ativo como padrão, ou vazio se não houver tipos
      setPlanType(activePlanTypes.length > 0 ? activePlanTypes[0].name : "");
      setIsActive(true);
    }
  }, [plan, open, activePlanTypes]);

  const handleSave = () => {
    onSave({
      name,
      code: code || undefined,
      description: description || undefined,
      plan_type: planType || undefined,
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {plan ? "Editar Plano Tarifário" : "Novo Plano Tarifário"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome do Plano</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Promoção Verão"
            />
          </div>
          <div>
            <Label>Código</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: VERAO2024"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={planType} onValueChange={(v: string) => setPlanType(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um tipo" />
              </SelectTrigger>
              <SelectContent>
                {activePlanTypes.length === 0 ? (
                  <SelectItem value="" disabled>
                    Nenhum tipo disponível
                  </SelectItem>
                ) : (
                  activePlanTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      <div className="flex items-center gap-2">
                        {type.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                        )}
                        <span>{type.name}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {activePlanTypes.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Nenhum tipo ativo. Crie tipos na aba "Tipos de Planos".
              </p>
            )}
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do plano tarifário"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="isActive">Ativo</Label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !planType}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


