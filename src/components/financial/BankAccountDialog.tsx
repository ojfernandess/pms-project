/**
 * Dialog para cadastrar Conta Bancária
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
import { Switch } from "@/components/ui/switch";
import { useBankReconciliation } from "@/hooks/useBankReconciliation";
import { Loader2 } from "lucide-react";

interface BankAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BankAccountDialog = ({
  open,
  onOpenChange,
}: BankAccountDialogProps) => {
  const { createAccount, isCreatingAccount } = useBankReconciliation();

  const [formData, setFormData] = useState({
    bank_name: "",
    bank_code: "",
    agency_number: "",
    agency_digit: "",
    account_number: "",
    account_digit: "",
    account_type: "checking" as "checking" | "savings" | "investment" | "other",
    holder_name: "",
    holder_document: "",
    holder_type: "individual" as "individual" | "company",
    is_default: false,
    currency: "BRL",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount(formData, {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setFormData({
      bank_name: "",
      bank_code: "",
      agency_number: "",
      agency_digit: "",
      account_number: "",
      account_digit: "",
      account_type: "checking",
      holder_name: "",
      holder_document: "",
      holder_type: "individual",
      is_default: false,
      currency: "BRL",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Conta Bancária</DialogTitle>
          <DialogDescription>
            Cadastre uma nova conta bancária para conciliação
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bank_name">Nome do Banco *</Label>
              <Input
                id="bank_name"
                value={formData.bank_name}
                onChange={(e) =>
                  setFormData({ ...formData, bank_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="bank_code">Código do Banco</Label>
              <Input
                id="bank_code"
                value={formData.bank_code}
                onChange={(e) =>
                  setFormData({ ...formData, bank_code: e.target.value })
                }
                placeholder="Ex: 001, 341"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="agency_number">Agência *</Label>
              <Input
                id="agency_number"
                value={formData.agency_number}
                onChange={(e) =>
                  setFormData({ ...formData, agency_number: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="agency_digit">Dígito Agência</Label>
              <Input
                id="agency_digit"
                value={formData.agency_digit}
                onChange={(e) =>
                  setFormData({ ...formData, agency_digit: e.target.value })
                }
                maxLength={1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="account_number">Conta *</Label>
              <Input
                id="account_number"
                value={formData.account_number}
                onChange={(e) =>
                  setFormData({ ...formData, account_number: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="account_digit">Dígito Conta</Label>
              <Input
                id="account_digit"
                value={formData.account_digit}
                onChange={(e) =>
                  setFormData({ ...formData, account_digit: e.target.value })
                }
                maxLength={1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="account_type">Tipo de Conta *</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, account_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Conta Corrente</SelectItem>
                  <SelectItem value="savings">Poupança</SelectItem>
                  <SelectItem value="investment">Investimento</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Moeda *</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="holder_name">Nome do Titular *</Label>
              <Input
                id="holder_name"
                value={formData.holder_name}
                onChange={(e) =>
                  setFormData({ ...formData, holder_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="holder_document">CPF/CNPJ</Label>
              <Input
                id="holder_document"
                value={formData.holder_document}
                onChange={(e) =>
                  setFormData({ ...formData, holder_document: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="holder_type">Tipo de Titular</Label>
            <Select
              value={formData.holder_type}
              onValueChange={(value: any) =>
                setFormData({ ...formData, holder_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Pessoa Física</SelectItem>
                <SelectItem value="company">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_default: checked })
              }
            />
            <Label htmlFor="is_default" className="cursor-pointer">
              Conta padrão do estabelecimento
            </Label>
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
            <Button type="submit" disabled={isCreatingAccount}>
              {isCreatingAccount ? (
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

