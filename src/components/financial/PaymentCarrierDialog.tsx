import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePaymentCarriers } from "@/hooks/usePaymentCarriers";
import { Loader2 } from "lucide-react";

interface PaymentCarrierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  carrierId?: string;
}

export const PaymentCarrierDialog = ({
  open,
  onOpenChange,
  onSuccess,
  carrierId,
}: PaymentCarrierDialogProps) => {
  const { carriers, createCarrier, updateCarrier, isCreating } = usePaymentCarriers();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    agency: "",
    account: "",
    is_active: true,
  });

  useEffect(() => {
    if (carrierId && open) {
      const carrier = carriers.find((c: any) => c.id === carrierId);
      if (carrier) {
        setFormData({
          code: carrier.code || "",
          description: carrier.description || "",
          agency: carrier.agency || "",
          account: carrier.account || "",
          is_active: carrier.is_active ?? true,
        });
      }
    } else if (!carrierId && open) {
      setFormData({
        code: "",
        description: "",
        agency: "",
        account: "",
        is_active: true,
      });
    }
  }, [carrierId, open, carriers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.code.trim()) {
        throw new Error("Código é obrigatório");
      }
      if (!formData.description.trim()) {
        throw new Error("Descrição é obrigatória");
      }

      if (carrierId) {
        await updateCarrier({ id: carrierId, ...formData });
      } else {
        await createCarrier(formData);
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
          <DialogTitle>
            {carrierId ? "Editar Portador de Pagamento" : "Novo Portador de Pagamento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="code">Código *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="Ex: BANCO001"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Banco do Brasil"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="agency">Agência</Label>
              <Input
                id="agency"
                value={formData.agency}
                onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                placeholder="Ex: 1234-5"
              />
            </div>
            <div>
              <Label htmlFor="account">Conta</Label>
              <Input
                id="account"
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                placeholder="Ex: 12345-6"
              />
            </div>
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
            <Button type="submit" disabled={loading || isCreating}>
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : carrierId ? (
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

