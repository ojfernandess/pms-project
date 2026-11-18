import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXPECTED_PAYMENT_METHODS } from "@/lib/financial/receivableCategories";
import { titleOpenBalance } from "@/lib/financial/financialTitleStatus";
import { formatCurrency } from "@/lib/financialUtils";
import { resolveReceivableDebtorLabel } from "@/lib/financial/receivableCategories";
import type { AccountsReceivable } from "@/services/financial/accountsReceivableService";
import { Loader2 } from "lucide-react";
import { useAccountsReceivable } from "@/hooks/useAccountsReceivable";

type LineAmount = { id: string; amount: string };

interface ReceivableBatchPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivables: AccountsReceivable[];
  onComplete?: () => void;
}

export function ReceivableBatchPaymentDialog({
  open,
  onOpenChange,
  receivables,
  onComplete,
}: ReceivableBatchPaymentDialogProps) {
  const { payReceivableBatch, isPayingBatch } = useAccountsReceivable();
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [reference, setReference] = useState("");

  const [lines, setLines] = useState<LineAmount[]>(() =>
    receivables.map((r) => ({
      id: r.id,
      amount: titleOpenBalance(r.amount, r.paid_amount).toFixed(2),
    })),
  );

  useEffect(() => {
    if (open) {
      setLines(
        receivables.map((r) => ({
          id: r.id,
          amount: titleOpenBalance(r.amount, r.paid_amount).toFixed(2),
        })),
      );
    }
  }, [open, receivables]);

  const total = lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);

  const handleSubmit = () => {
    const items = lines
      .map((line) => ({
        accounts_receivable_id: line.id,
        amount: parseFloat(line.amount),
      }))
      .filter((i) => !Number.isNaN(i.amount) && i.amount > 0);

    if (!items.length) return;

    payReceivableBatch(
      {
        items,
        effectiveDate,
        paymentMethod,
        reference: reference || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onComplete?.();
        },
      },
    );
  };

  const byId = new Map(receivables.map((r) => [r.id, r]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recebimento em lote</DialogTitle>
          <DialogDescription>
            Distribua um recebimento único entre {receivables.length} título(s) — ideal para empresas com várias faturas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Data efetiva</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <Label>Forma</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPECTED_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referência / comprovante</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Devedor</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead className="w-32">Receber agora</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const r = byId.get(line.id);
              if (!r) return null;
              const open = titleOpenBalance(r.amount, r.paid_amount);
              return (
                <TableRow key={line.id}>
                  <TableCell className="text-sm">{resolveReceivableDebtorLabel(r)}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.description}</TableCell>
                  <TableCell>{formatCurrency(open)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={open}
                      value={line.amount}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, amount: e.target.value } : l)))
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex justify-end text-lg font-semibold">Total do lote: {formatCurrency(total)}</div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPayingBatch || total <= 0}>
            {isPayingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar lote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}