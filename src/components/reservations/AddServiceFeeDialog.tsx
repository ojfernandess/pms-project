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
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/reservationUtils";

interface AddServiceFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceFee: {
    id: string;
    name: string;
    description?: string;
  };
  reservationId: string;
  existingFee?: {
    id: string;
    amount: number;
    quantity: number;
    notes?: string;
  };
  onConfirm: (data: {
    service_fee_id: string;
    amount: number;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
  /** Preenchimento ao abrir (ex.: estacionamento pelos dias da reserva) */
  suggestedAmount?: number;
  suggestedQuantity?: number;
  quantityHint?: string;
}

export const AddServiceFeeDialog = ({
  open,
  onOpenChange,
  serviceFee,
  reservationId,
  existingFee,
  onConfirm,
  isSubmitting = false,
  suggestedAmount,
  suggestedQuantity,
  quantityHint,
}: AddServiceFeeDialogProps) => {
  const [amount, setAmount] = useState("0.00");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (existingFee) {
        setAmount(existingFee.amount.toString());
        setQuantity(existingFee.quantity.toString());
        setNotes(existingFee.notes || "");
      } else {
        if (suggestedAmount != null && suggestedAmount > 0) {
          setAmount(String(suggestedAmount));
          setQuantity(String(suggestedQuantity != null && suggestedQuantity > 0 ? suggestedQuantity : 1));
        } else {
          setAmount("0.00");
          setQuantity("1");
        }
        setNotes("");
      }
    }
  }, [open, existingFee, suggestedAmount, suggestedQuantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amountNum = parseFloat(amount.replace(",", ".")) || 0;
    const quantityNum = parseInt(quantity) || 1;

    if (amountNum <= 0) {
      return;
    }

    await onConfirm({
      service_fee_id: serviceFee.id,
      amount: amountNum,
      quantity: quantityNum,
      notes: notes.trim() || undefined,
    });
  };

  const handleAmountChange = (value: string) => {
    // Permitir apenas números, vírgula e ponto
    const cleaned = value.replace(/[^\d,.-]/g, "");
    // Substituir vírgula por ponto para cálculo
    const normalized = cleaned.replace(",", ".");
    setAmount(cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {existingFee ? "Editar Taxa" : "Adicionar Taxa"}
          </DialogTitle>
          <DialogDescription>
            {existingFee 
              ? `Edite os valores da taxa "${serviceFee.name}"`
              : `Adicione a taxa "${serviceFee.name}" à reserva`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">
              Valor (R$) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="amount"
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0,00"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantidade
              {quantityHint ? (
                <span className="block text-xs font-normal text-muted-foreground">{quantityHint}</span>
              ) : null}
            </Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre esta taxa"
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {amount && parseFloat(amount.replace(",", ".")) > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Total:</div>
              <div className="text-lg font-bold">
                {formatCurrency(
                  (parseFloat(amount.replace(",", ".")) || 0) * (parseInt(quantity) || 1)
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !amount || parseFloat(amount.replace(",", ".")) <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : existingFee ? (
                "Salvar Alterações"
              ) : (
                "Adicionar Taxa"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};


