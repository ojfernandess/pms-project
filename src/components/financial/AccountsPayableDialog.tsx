/**
 * Dialog para criar/editar Conta a Pagar
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccountsPayable } from "@/hooks/useAccountsPayable";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { Loader2 } from "lucide-react";
import type { AccountsPayable } from "@/services/financial/accountsPayableService";

interface AccountsPayableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payable?: AccountsPayable;
}

export const AccountsPayableDialog = ({
  open,
  onOpenChange,
  payable,
}: AccountsPayableDialogProps) => {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();
  const { createPayable, createInstallment, isCreating, isCreatingInstallment } = useAccountsPayable();

  const [formData, setFormData] = useState({
    supplier_name: payable?.supplier_name || "",
    supplier_document: payable?.supplier_document || "",
    supplier_email: payable?.supplier_email || "",
    supplier_phone: payable?.supplier_phone || "",
    description: payable?.description || "",
    amount: payable?.amount.toString() || "",
    due_date: payable?.due_date || "",
    type: (payable?.type || "supplier") as AccountsPayable['type'],
    category: payable?.category || "",
    notes: payable?.notes || "",
  });

  const [installments, setInstallments] = useState(1);
  const [useInstallments, setUseInstallments] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentId) return;

    const baseParams = {
      establishment_id: establishmentId,
      supplier_name: formData.supplier_name,
      supplier_document: formData.supplier_document || undefined,
      supplier_email: formData.supplier_email || undefined,
      supplier_phone: formData.supplier_phone || undefined,
      description: formData.description,
      amount: parseFloat(formData.amount),
      due_date: formData.due_date,
      type: formData.type,
      category: formData.category || undefined,
      notes: formData.notes || undefined,
    };

    if (useInstallments && installments > 1) {
      createInstallment(
        {
          ...baseParams,
          installments,
          intervalDays: 30,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            resetForm();
          },
        }
      );
    } else {
      createPayable(baseParams, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_name: "",
      supplier_document: "",
      supplier_email: "",
      supplier_phone: "",
      description: "",
      amount: "",
      due_date: "",
      type: "supplier",
      category: "",
      notes: "",
    });
    setInstallments(1);
    setUseInstallments(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {payable ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}
          </DialogTitle>
          <DialogDescription>
            {payable
              ? "Edite os dados da conta a pagar"
              : "Preencha os dados para criar uma nova conta a pagar"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier_name">Fornecedor *</Label>
              <Input
                id="supplier_name"
                value={formData.supplier_name}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="supplier_document">CNPJ/CPF</Label>
              <Input
                id="supplier_document"
                value={formData.supplier_document}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_document: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier_email">Email</Label>
              <Input
                id="supplier_email"
                type="email"
                value={formData.supplier_email}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_email: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="supplier_phone">Telefone</Label>
              <Input
                id="supplier_phone"
                value={formData.supplier_phone}
                onChange={(e) =>
                  setFormData({ ...formData, supplier_phone: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="amount">Valor *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="due_date">Vencimento *</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({ ...formData, type: value as AccountsPayable['type'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Fornecedor</SelectItem>
                  <SelectItem value="ota_commission">Comissão OTA</SelectItem>
                  <SelectItem value="gateway_fee">Taxa Gateway</SelectItem>
                  <SelectItem value="operational">Operacional</SelectItem>
                  <SelectItem value="tax">Imposto</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="category">Centro de Custo</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            />
          </div>

          {!payable && (
            <div className="flex items-center gap-4">
              <input
                type="checkbox"
                id="use_installments"
                checked={useInstallments}
                onChange={(e) => setUseInstallments(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="use_installments" className="cursor-pointer">
                Parcelar em
              </Label>
              {useInstallments && (
                <Input
                  type="number"
                  min="2"
                  max="24"
                  value={installments}
                  onChange={(e) => setInstallments(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              )}
              {useInstallments && <span>parcelas</span>}
            </div>
          )}

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isCreating || isCreatingInstallment}
            >
              {(isCreating || isCreatingInstallment) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Conta"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

