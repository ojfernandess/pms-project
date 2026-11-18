/**
 * Dialog para criar Conta a Pagar
 */

import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useAccountsPayable } from "@/hooks/useAccountsPayable";
import { useFinancialSuppliers } from "@/hooks/useFinancialSuppliers";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { EXPENSE_CATEGORIES, RECURRENCE_PATTERNS, type RecurrencePatternId } from "@/lib/financial/expenseCategories";
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
  const { suppliers } = useFinancialSuppliers();

  const [supplierMode, setSupplierMode] = useState<"catalog" | "manual">("catalog");
  const [supplierId, setSupplierId] = useState<string>("");
  const [formData, setFormData] = useState({
    supplier_name: "",
    supplier_document: "",
    supplier_email: "",
    supplier_phone: "",
    description: "",
    amount: "",
    due_date: "",
    type: "supplier" as AccountsPayable["type"],
    category: "",
    cost_center: "",
    document_number: "",
    notes: "",
  });

  const [installments, setInstallments] = useState(1);
  const [useInstallments, setUseInstallments] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternId>("monthly");
  const [customIntervalDays, setCustomIntervalDays] = useState("30");
  const [requestApproval, setRequestApproval] = useState(false);

  useEffect(() => {
    if (!supplierId || supplierMode !== "catalog") return;
    const s = suppliers.find((x) => x.id === supplierId);
    if (!s) return;
    setFormData((prev) => ({
      ...prev,
      supplier_name: s.name,
      supplier_document: s.document_number || "",
      supplier_email: s.email || "",
      supplier_phone: s.phone || "",
      category: s.category || prev.category,
    }));
  }, [supplierId, supplierMode, suppliers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentId) return;
    if (isRecurring && useInstallments) return;
    if (supplierMode === "catalog" && !supplierId) return;
    if (supplierMode === "manual" && !formData.supplier_name.trim()) return;

    const baseParams = {
      establishment_id: establishmentId,
      supplier_id: supplierMode === "catalog" && supplierId ? supplierId : undefined,
      supplier_name: formData.supplier_name,
      supplier_document: formData.supplier_document || undefined,
      supplier_email: formData.supplier_email || undefined,
      supplier_phone: formData.supplier_phone || undefined,
      description: formData.description,
      amount: parseFloat(formData.amount),
      due_date: formData.due_date,
      type: formData.type,
      category: formData.category || undefined,
      cost_center: formData.cost_center || undefined,
      document_number: formData.document_number || undefined,
      notes: formData.notes || undefined,
      is_recurring: isRecurring,
      recurrence_pattern: isRecurring ? recurrencePattern : undefined,
      custom_interval_days:
        isRecurring && recurrencePattern === "custom" ? parseInt(customIntervalDays, 10) || 30 : undefined,
      request_approval: requestApproval,
    };

    const onDone = {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    };

    if (useInstallments && installments > 1 && !isRecurring) {
      createInstallment({ ...baseParams, installments, intervalDays: 30 }, onDone);
    } else {
      createPayable(baseParams, onDone);
    }
  };

  const resetForm = () => {
    setSupplierId("");
    setSupplierMode("catalog");
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
      cost_center: "",
      document_number: "",
      notes: "",
    });
    setInstallments(1);
    setUseInstallments(false);
    setIsRecurring(false);
    setRecurrencePattern("monthly");
    setCustomIntervalDays("30");
    setRequestApproval(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payable ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}</DialogTitle>
          <DialogDescription>
            {payable
              ? "Edite os dados da conta a pagar"
              : "Preencha os dados para criar uma nova conta a pagar"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Fornecedor *</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={supplierMode === "catalog" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplierMode("catalog")}
              >
                Cadastro
              </Button>
              <Button
                type="button"
                variant={supplierMode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplierMode("manual")}
              >
                Manual
              </Button>
            </div>
            {supplierMode === "catalog" ? (
              <Select value={supplierId || "none"} onValueChange={(v) => setSupplierId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione…</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                placeholder="Nome do fornecedor"
                required
              />
            )}
          </div>

          {(supplierMode === "manual" || supplierId) && (
            <div className="grid grid-cols-2 gap-4">
              {supplierMode === "catalog" && (
                <div className="col-span-2">
                  <Label>Nome (snapshot)</Label>
                  <Input value={formData.supplier_name} readOnly className="bg-muted" />
                </div>
              )}
              <div>
                <Label htmlFor="supplier_document">CNPJ/CPF</Label>
                <Input
                  id="supplier_document"
                  value={formData.supplier_document}
                  onChange={(e) => setFormData({ ...formData, supplier_document: e.target.value })}
                  readOnly={supplierMode === "catalog"}
                />
              </div>
              <div>
                <Label htmlFor="document_number">Nº documento fiscal</Label>
                <Input
                  id="document_number"
                  value={formData.document_number}
                  onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="supplier_email">E-mail</Label>
                <Input
                  id="supplier_email"
                  type="email"
                  value={formData.supplier_email}
                  onChange={(e) => setFormData({ ...formData, supplier_email: e.target.value })}
                  readOnly={supplierMode === "catalog"}
                />
              </div>
              <div>
                <Label htmlFor="supplier_phone">Telefone</Label>
                <Input
                  id="supplier_phone"
                  value={formData.supplier_phone}
                  onChange={(e) => setFormData({ ...formData, supplier_phone: e.target.value })}
                  readOnly={supplierMode === "catalog"}
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="description">Descrição *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="due_date">Vencimento *</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as AccountsPayable["type"] })}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria de despesa</Label>
              <Select
                value={formData.category || "none"}
                onValueChange={(v) => setFormData({ ...formData, category: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cost_center">Centro de custo</Label>
              <Input
                id="cost_center"
                value={formData.cost_center}
                onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
              />
            </div>
          </div>

          {!payable && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="request_approval"
                  checked={requestApproval}
                  onCheckedChange={(v) => setRequestApproval(v === true)}
                />
                <Label htmlFor="request_approval" className="cursor-pointer font-normal">
                  Solicitar aprovação antes de pagar
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_recurring"
                  checked={isRecurring}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setIsRecurring(next);
                    if (next) setUseInstallments(false);
                  }}
                />
                <Label htmlFor="is_recurring" className="cursor-pointer font-normal">
                  Despesa recorrente (gera títulos automaticamente)
                </Label>
              </div>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div>
                    <Label>Frequência</Label>
                    <Select
                      value={recurrencePattern}
                      onValueChange={(v) => setRecurrencePattern(v as RecurrencePatternId)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_PATTERNS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {recurrencePattern === "custom" && (
                    <div>
                      <Label>Intervalo (dias)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={customIntervalDays}
                        onChange={(e) => setCustomIntervalDays(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {!isRecurring && (
                <div className="flex items-center gap-4 flex-wrap">
                  <Checkbox
                    id="use_installments"
                    checked={useInstallments}
                    onCheckedChange={(v) => setUseInstallments(v === true)}
                  />
                  <Label htmlFor="use_installments" className="cursor-pointer font-normal">
                    Parcelar em
                  </Label>
                  {useInstallments && (
                    <Input
                      type="number"
                      min="2"
                      max="24"
                      value={installments}
                      onChange={(e) => setInstallments(parseInt(e.target.value, 10) || 1)}
                      className="w-20"
                    />
                  )}
                  {useInstallments && <span className="text-sm">parcelas</span>}
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
            <Button type="submit" disabled={isCreating || isCreatingInstallment}>
              {isCreating || isCreatingInstallment ? (
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