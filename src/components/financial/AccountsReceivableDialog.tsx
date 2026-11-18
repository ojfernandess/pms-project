import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccountsReceivable } from "@/hooks/useAccountsReceivable";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  EXPECTED_PAYMENT_METHODS,
  RECEIVABLE_CATEGORIES,
  type ExpectedPaymentMethodId,
  type ReceivableCategoryId,
} from "@/lib/financial/receivableCategories";
import { searchEstablishmentClients } from "@/services/financial/financialDebtorsService";
import type { ReceivableDebtorType } from "@/services/financial/accountsReceivableService";
import { Loader2 } from "lucide-react";

interface AccountsReceivableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountsReceivableDialog({ open, onOpenChange }: AccountsReceivableDialogProps) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();
  const { createReceivable, createInstallment, isCreating, isCreatingInstallment } = useAccountsReceivable();

  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [debtorMode, setDebtorMode] = useState<"catalog" | "manual">("catalog");
  const [form, setForm] = useState({
    debtor_name: "",
    debtor_document: "",
    description: "",
    amount: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    financial_category: "",
    document_number: "",
    expected_payment_method: "" as ExpectedPaymentMethodId | "",
    reservation_id: "",
    notes: "",
    debtor_type: "guest" as ReceivableDebtorType,
  });
  const [useInstallments, setUseInstallments] = useState(false);
  const [installments, setInstallments] = useState(2);

  const { data: clients = [] } = useQuery({
    queryKey: ["ar_client_search", establishmentId, clientSearch],
    queryFn: async () => {
      if (!establishmentId) return [];
      const res = await searchEstablishmentClients(establishmentId, clientSearch);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open && !!establishmentId && debtorMode === "catalog",
  });

  useEffect(() => {
    if (!clientId || debtorMode !== "catalog") return;
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    setForm((prev) => ({
      ...prev,
      debtor_name: c.full_name,
      debtor_document: c.document_number || "",
    }));
  }, [clientId, clients, debtorMode]);

  const reset = () => {
    setClientId("");
    setClientSearch("");
    setDebtorMode("catalog");
    setForm({
      debtor_name: "",
      debtor_document: "",
      description: "",
      amount: "",
      issue_date: new Date().toISOString().split("T")[0],
      due_date: "",
      financial_category: "",
      document_number: "",
      expected_payment_method: "",
      reservation_id: "",
      notes: "",
      debtor_type: "guest",
    });
    setUseInstallments(false);
    setInstallments(2);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentId) return;
    if (debtorMode === "catalog" && !clientId) return;
    if (debtorMode === "manual" && !form.debtor_name.trim()) return;

    const payload = {
      establishment_id: establishmentId,
      client_id: clientId || undefined,
      debtor_type: form.debtor_type,
      debtor_name: form.debtor_name,
      debtor_document: form.debtor_document || undefined,
      financial_category: (form.financial_category || undefined) as ReceivableCategoryId | undefined,
      document_number: form.document_number || undefined,
      issue_date: form.issue_date,
      expected_payment_method: form.expected_payment_method || undefined,
      reservation_id: form.reservation_id.trim() || undefined,
      description: form.description,
      amount: parseFloat(form.amount),
      due_date: form.due_date,
      origin: "manual" as const,
      type: "other" as const,
      notes: form.notes || undefined,
    };

    const onDone = { onSuccess: () => { onOpenChange(false); reset(); } };

    if (useInstallments && installments >= 2) {
      createInstallment({ ...payload, installments, intervalDays: 30 }, onDone);
    } else {
      createReceivable(payload, onDone);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova conta a receber</DialogTitle>
          <DialogDescription>Cadastro manual — hóspede, empresa ou outro devedor</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Tipo de devedor</Label>
            <Select
              value={form.debtor_type}
              onValueChange={(v) => setForm({ ...form, debtor_type: v as ReceivableDebtorType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">Hóspede / pessoa física</SelectItem>
                <SelectItem value="company">Empresa (faturamento)</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button type="button" size="sm" variant={debtorMode === "catalog" ? "default" : "outline"} onClick={() => setDebtorMode("catalog")}>
              Cliente cadastrado
            </Button>
            <Button type="button" size="sm" variant={debtorMode === "manual" ? "default" : "outline"} onClick={() => setDebtorMode("manual")}>
              Informar manualmente
            </Button>
          </div>

          {debtorMode === "catalog" ? (
            <div className="space-y-2">
              <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
              <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione…</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                      {c.document_number ? ` · ${c.document_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome / razão social *</Label>
                <Input value={form.debtor_name} onChange={(e) => setForm({ ...form, debtor_name: e.target.value })} required />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input value={form.debtor_document} onChange={(e) => setForm({ ...form, debtor_document: e.target.value })} />
              </div>
            </div>
          )}

          {debtorMode === "catalog" && clientId && (
            <DebtorSnapshot debtorName={form.debtor_name} document={form.debtor_document} />
          )}

          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div>
              <Label>Emissão</Label>
              <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div>
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.financial_category || "none"} onValueChange={(v) => setForm({ ...form, financial_category: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {RECEIVABLE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma prevista</Label>
              <Select
                value={form.expected_payment_method || "none"}
                onValueChange={(v) => setForm({ ...form, expected_payment_method: v === "none" ? "" : (v as ExpectedPaymentMethodId) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informada</SelectItem>
                  {EXPECTED_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nº documento</Label>
              <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} />
            </div>
            <div>
              <Label>ID reserva (opcional)</Label>
              <Input value={form.reservation_id} onChange={(e) => setForm({ ...form, reservation_id: e.target.value })} placeholder="UUID da reserva" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox id="ar_installments" checked={useInstallments} onCheckedChange={(v) => setUseInstallments(v === true)} />
            <Label htmlFor="ar_installments" className="font-normal cursor-pointer">
              Parcelar em
            </Label>
            {useInstallments && (
              <Input className="w-20" type="number" min={2} max={24} value={installments} onChange={(e) => setInstallments(parseInt(e.target.value, 10) || 2)} />
            )}
            {useInstallments && <span className="text-sm">parcelas mensais</span>}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isCreating || isCreatingInstallment}>
              {(isCreating || isCreatingInstallment) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar título"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DebtorSnapshot({ debtorName, document }: { debtorName: string; document: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm bg-muted/50 rounded-md p-3">
      <div>
        <span className="text-muted-foreground">Devedor: </span>
        <span className="font-medium">{debtorName || "—"}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Documento: </span>
        <span>{document || "—"}</span>
      </div>
    </div>
  );
}