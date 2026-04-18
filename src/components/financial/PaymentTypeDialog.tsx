import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePaymentCarriers } from "@/hooks/usePaymentCarriers";
import { Loader2 } from "lucide-react";

interface PaymentTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  paymentTypeId?: string;
  carrierId?: string;
}

const PAYMENT_METHODS = [
  { value: "deposit", label: "Depósito" },
  { value: "pix", label: "PIX" },
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "debit_card", label: "Cartão de Débito" },
];

const CARD_BRANDS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "elo", label: "Elo" },
  { value: "amex", label: "American Express" },
  { value: "hipercard", label: "Hipercard" },
  { value: "diners", label: "Diners Club" },
  { value: "discover", label: "Discover" },
];

export const PaymentTypeDialog = ({
  open,
  onOpenChange,
  onSuccess,
  paymentTypeId,
  carrierId,
}: PaymentTypeDialogProps) => {
  const { carriers, paymentTypes, createPaymentType, updatePaymentType, isCreating } =
    usePaymentCarriers();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    carrier_id: carrierId || "",
    name: "",
    payment_method: "",
    card_brand: "",
    card_fee: "0",
    installments_2_6_fee: "0",
    installments_7_12_fee: "0",
    payment_days: "0",
    is_active: true,
  });

  const isCardPayment = formData.payment_method === "credit_card" || formData.payment_method === "debit_card";

  useEffect(() => {
    if (paymentTypeId && open) {
      const paymentType = paymentTypes.find((pt: any) => pt.id === paymentTypeId);
      if (paymentType) {
        setFormData({
          carrier_id: paymentType.carrier_id || carrierId || "",
          name: paymentType.name || "",
          payment_method: paymentType.payment_method || "",
          card_brand: paymentType.card_brand || "",
          card_fee: String(paymentType.card_fee || 0),
          installments_2_6_fee: String(paymentType.installments_2_6_fee || 0),
          installments_7_12_fee: String(paymentType.installments_7_12_fee || 0),
          payment_days: String(paymentType.payment_days || 0),
          is_active: paymentType.is_active ?? true,
        });
      }
    } else if (!paymentTypeId && open) {
      setFormData({
        carrier_id: carrierId || "",
        name: "",
        payment_method: "",
        card_brand: "",
        card_fee: "0",
        installments_2_6_fee: "0",
        installments_7_12_fee: "0",
        payment_days: "0",
        is_active: true,
      });
    }
  }, [paymentTypeId, open, paymentTypes, carrierId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.carrier_id) {
        throw new Error("Portador é obrigatório");
      }
      if (!formData.payment_method) {
        throw new Error("Método de pagamento é obrigatório");
      }
      if (isCardPayment && !formData.card_brand) {
        throw new Error("Bandeira do cartão é obrigatória para cartões");
      }

      const data: any = {
        carrier_id: formData.carrier_id,
        name: formData.name,
        payment_method: formData.payment_method,
        card_fee: parseFloat(formData.card_fee) || 0,
        installments_2_6_fee: parseFloat(formData.installments_2_6_fee) || 0,
        installments_7_12_fee: parseFloat(formData.installments_7_12_fee) || 0,
        payment_days: parseInt(formData.payment_days) || 0,
        is_active: formData.is_active,
      };

      if (isCardPayment) {
        data.card_brand = formData.card_brand;
      }

      if (paymentTypeId) {
        await updatePaymentType({ id: paymentTypeId, ...data });
      } else {
        await createPaymentType(data);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {paymentTypeId ? "Editar Tipo de Pagamento" : "Novo Tipo de Pagamento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: PIX Banco do Brasil, Visa Crédito, etc."
              required
            />
          </div>

          <div>
            <Label htmlFor="carrier_id">Portador de Pagamento *</Label>
            <Select
              value={formData.carrier_id}
              onValueChange={(value) => setFormData({ ...formData, carrier_id: value })}
              required
              disabled={!!carrierId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um portador" />
              </SelectTrigger>
              <SelectContent>
                {carriers
                  .filter((c: any) => c.is_active)
                  .map((carrier: any) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.code} - {carrier.description}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="payment_method">Método de Pagamento *</Label>
            <Select
              value={formData.payment_method}
              onValueChange={(value) =>
                setFormData({ ...formData, payment_method: value, card_brand: "" })
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o método" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCardPayment && (
            <div>
              <Label htmlFor="card_brand">Bandeira do Cartão *</Label>
              <Select
                value={formData.card_brand}
                onValueChange={(value) => setFormData({ ...formData, card_brand: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a bandeira" />
                </SelectTrigger>
                <SelectContent>
                  {CARD_BRANDS.map((brand) => (
                    <SelectItem key={brand.value} value={brand.value}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isCardPayment && (
            <>
              <div>
                <Label htmlFor="card_fee">Taxa do Cartão (%)</Label>
                <Input
                  id="card_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.card_fee}
                  onChange={(e) => setFormData({ ...formData, card_fee: e.target.value })}
                  placeholder="Ex: 2.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="installments_2_6_fee">Taxa Parcelas 2-6x (%)</Label>
                  <Input
                    id="installments_2_6_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.installments_2_6_fee}
                    onChange={(e) =>
                      setFormData({ ...formData, installments_2_6_fee: e.target.value })
                    }
                    placeholder="Ex: 3.0"
                  />
                </div>
                <div>
                  <Label htmlFor="installments_7_12_fee">Taxa Parcelas 7-12x (%)</Label>
                  <Input
                    id="installments_7_12_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.installments_7_12_fee}
                    onChange={(e) =>
                      setFormData({ ...formData, installments_7_12_fee: e.target.value })
                    }
                    placeholder="Ex: 4.5"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="payment_days">Dias para Pagamento</Label>
            <Input
              id="payment_days"
              type="number"
              min="0"
              value={formData.payment_days}
              onChange={(e) => setFormData({ ...formData, payment_days: e.target.value })}
              placeholder="Ex: 0 (à vista), 30 (30 dias)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              0 = à vista, 30 = 30 dias, etc.
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
            <Button type="submit" disabled={loading || isCreating}>
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : paymentTypeId ? (
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

