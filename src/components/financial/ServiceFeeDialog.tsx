import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface ServiceFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceFeeId?: string;
  initialData?: {
    name?: string;
    description?: string;
    is_active?: boolean;
  };
  onSuccess: () => void;
  isCreating?: boolean;
  isUpdating?: boolean;
}

export const ServiceFeeDialog = ({
  open,
  onOpenChange,
  serviceFeeId,
  initialData,
  onSuccess,
  isCreating = false,
  isUpdating = false,
}: ServiceFeeDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name || "");
        setDescription(initialData.description || "");
        setIsActive(initialData.is_active !== undefined ? initialData.is_active : true);
      } else {
        setName("");
        setDescription("");
        setIsActive(true);
      }
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      return;
    }

    onSuccess({
      name: name.trim(),
      description: description.trim() || undefined,
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {serviceFeeId ? "Editar Taxa de Serviço" : "Nova Taxa de Serviço"}
          </DialogTitle>
          <DialogDescription>
            {serviceFeeId 
              ? "Edite as informações da taxa de serviço."
              : "Preencha os dados para criar uma nova taxa de serviço."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome da Taxa <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Taxa extra, Late Checkout, Upgrade"
              required
              disabled={isCreating || isUpdating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional da taxa"
              rows={3}
              disabled={isCreating || isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Ativo</Label>
              <p className="text-sm text-muted-foreground">
                Taxas ativas aparecem na lista de opções ao adicionar taxas na reserva
              </p>
            </div>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isCreating || isUpdating}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating || isUpdating}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isCreating || isUpdating || !name.trim()}
            >
              {isCreating || isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : serviceFeeId ? (
                "Salvar Alterações"
              ) : (
                "Criar Taxa"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

