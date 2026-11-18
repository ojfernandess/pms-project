/**
 * Componente de Listagem de Contas a Pagar
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAccountsPayable } from "@/hooks/useAccountsPayable";
import { formatCurrency } from "@/lib/financialUtils";
import { titleOpenBalance } from "@/lib/financial/financialTitleStatus";
import { expenseCategoryLabel } from "@/lib/financial/expenseCategories";
import { listPayableSettlements } from "@/services/financial/financialSettlementsService";
import { Loader2, DollarSign, Search, Plus, X, RefreshCw, Users, Check, Ban } from "lucide-react";
import type { AccountsPayable, PayableApprovalStatus } from "@/services/financial/accountsPayableService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AccountsPayableDialog } from "./AccountsPayableDialog";
import { FinancialSuppliersDialog } from "./FinancialSuppliersDialog";

const typeLabels: Record<AccountsPayable["type"], string> = {
  ota_commission: "Comissão OTA",
  gateway_fee: "Taxa Gateway",
  supplier: "Fornecedor",
  operational: "Operacional",
  tax: "Imposto",
  other: "Outro",
};

const statusLabels: Record<AccountsPayable["status"], string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const statusColors: Record<AccountsPayable["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  partial: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const approvalLabels: Record<PayableApprovalStatus, string> = {
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

export const AccountsPayableList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayable, setSelectedPayable] = useState<AccountsPayable | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suppliersDialogOpen, setSuppliersDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  const filters = {
    status: statusFilter !== "all" && statusFilter !== "overdue" ? (statusFilter as AccountsPayable["status"]) : undefined,
    type: typeFilter !== "all" ? (typeFilter as AccountsPayable["type"]) : undefined,
    overdueOnly: statusFilter === "overdue",
  };

  const {
    payables,
    summary,
    isLoading,
    payPayable,
    isPaying,
    cancelPayable,
    isCancelling,
    approvePayable,
    isApproving,
    rejectPayable,
    isRejecting,
    spawnRecurring,
    isSpawningRecurring,
  } = useAccountsPayable(filters);

  const { data: settlementHistory = [] } = useQuery({
    queryKey: ["payable_settlements", selectedPayable?.id],
    queryFn: async () => {
      if (!selectedPayable?.id) return [];
      const result = await listPayableSettlements(selectedPayable.id);
      if (!result.success) throw new Error(result.error);
      return (result.data || []).filter((s) => !s.reversed_at);
    },
    enabled: paymentDialogOpen && !!selectedPayable?.id,
  });

  const filteredPayables = payables.filter((p) => {
    if (approvalFilter !== "all" && (p.approval_status || "approved") !== approvalFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.description.toLowerCase().includes(term) ||
      p.supplier_name.toLowerCase().includes(term) ||
      p.supplier_document?.toLowerCase().includes(term) ||
      p.document_number?.toLowerCase().includes(term)
    );
  });

  const handlePayPayable = () => {
    if (!selectedPayable || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const remaining = titleOpenBalance(selectedPayable.amount, selectedPayable.paid_amount);
    if (amount > remaining + 0.02) return;

    payPayable(
      { payableId: selectedPayable.id, amount },
      {
        onSuccess: () => {
          setPaymentDialogOpen(false);
          setPaymentAmount("");
          setSelectedPayable(null);
        },
      },
    );
  };

  const handleCancel = (payable: AccountsPayable) => {
    if (confirm(`Deseja realmente cancelar a conta "${payable.description}"?`)) {
      cancelPayable(payable.id);
    }
  };

  const handleApprove = (payable: AccountsPayable) => {
    approvePayable({ payableId: payable.id });
  };

  const handleReject = (payable: AccountsPayable) => {
    const notes = window.prompt("Motivo da rejeição (opcional):") ?? undefined;
    rejectPayable({ payableId: payable.id, notes: notes || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo em aberto</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalOpen ?? summary.total)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendente</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.pending)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-yellow-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vencido</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(summary.overdue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aguardando aprovação</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">
                  {formatCurrency(summary.pendingApproval ?? 0)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pago (títulos quitados)</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(summary.paid)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, fornecedor ou documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="overdue">Vencido</SelectItem>
            </SelectContent>
          </Select>

          <Select value={approvalFilter} onValueChange={setApprovalFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Aprovação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas aprovações</SelectItem>
              <SelectItem value="pending_approval">Aguardando</SelectItem>
              <SelectItem value="approved">Aprovadas</SelectItem>
              <SelectItem value="rejected">Rejeitadas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="ota_commission">Comissão OTA</SelectItem>
              <SelectItem value="gateway_fee">Taxa Gateway</SelectItem>
              <SelectItem value="supplier">Fornecedor</SelectItem>
              <SelectItem value="operational">Operacional</SelectItem>
              <SelectItem value="tax">Imposto</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => spawnRecurring()} disabled={isSpawningRecurring}>
            {isSpawningRecurring ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Gerar recorrências
          </Button>

          <Button variant="outline" onClick={() => setSuppliersDialogOpen(true)}>
            <Users className="h-4 w-4 mr-2" />
            Fornecedores
          </Button>

          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Conta
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Contas a Pagar</h3>
        </div>
        {filteredPayables.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhuma conta a pagar encontrada</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aprovação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayables.map((payable) => {
                const remaining = titleOpenBalance(payable.amount, payable.paid_amount);
                const approval = (payable.approval_status || "approved") as PayableApprovalStatus;
                const canPay =
                  remaining > 0.02 &&
                  payable.status !== "cancelled" &&
                  approval === "approved";
                const isOverdue =
                  payable.status === "overdue" ||
                  ((payable.status === "pending" || payable.status === "partial") &&
                    new Date(payable.due_date) < new Date());

                return (
                  <TableRow key={payable.id}>
                    <TableCell className="font-medium">{payable.supplier_name}</TableCell>
                    <TableCell>
                      {payable.description}
                      {payable.total_installments > 1 && (
                        <Badge variant="outline" className="ml-2">
                          {payable.installment_number}/{payable.total_installments}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {expenseCategoryLabel(payable.category)}
                    </TableCell>
                    <TableCell>
                      <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                        {format(new Date(payable.due_date), "PPP", { locale: ptBR })}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(payable.amount)}</TableCell>
                    <TableCell>
                      <span className={remaining > 0.02 ? "font-semibold" : ""}>{formatCurrency(remaining)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[payable.status]}>{statusLabels[payable.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          approval === "pending_approval"
                            ? "border-amber-500 text-amber-700"
                            : approval === "rejected"
                              ? "border-red-500 text-red-700"
                              : ""
                        }
                      >
                        {approvalLabels[approval]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {approval === "pending_approval" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApprove(payable)}
                              disabled={isApproving}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReject(payable)}
                              disabled={isRejecting}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canPay && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPayable(payable);
                              setPaymentAmount(remaining.toFixed(2));
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        {payable.status !== "cancelled" && approval !== "rejected" && (
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(payable)} disabled={isCancelling}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>Registrar pagamento para: {selectedPayable?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Valor Total</Label>
              <p className="text-sm text-muted-foreground">{formatCurrency(selectedPayable?.amount || 0)}</p>
            </div>
            <div>
              <Label>Valor Pago</Label>
              <p className="text-sm text-muted-foreground">{formatCurrency(selectedPayable?.paid_amount || 0)}</p>
            </div>
            <div>
              <Label>Saldo Restante</Label>
              <p className="text-sm font-semibold">
                {formatCurrency(
                  titleOpenBalance(selectedPayable?.amount || 0, selectedPayable?.paid_amount || 0),
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="payment-amount">Valor do Pagamento</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={titleOpenBalance(selectedPayable?.amount || 0, selectedPayable?.paid_amount || 0)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {settlementHistory.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Histórico de pagamentos</p>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {settlementHistory.map((s) => (
                    <li key={s.id} className="flex justify-between text-muted-foreground">
                      <span>
                        {format(new Date(s.effective_date), "dd/MM/yyyy", { locale: ptBR })}
                        {s.payment_method ? ` · ${s.payment_method}` : ""}
                      </span>
                      <span className="font-medium text-foreground">{formatCurrency(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPaymentDialogOpen(false);
                setPaymentAmount("");
                setSelectedPayable(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handlePayPayable} disabled={isPaying || !paymentAmount || parseFloat(paymentAmount) <= 0}>
              {isPaying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                "Registrar Pagamento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountsPayableDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <FinancialSuppliersDialog open={suppliersDialogOpen} onOpenChange={setSuppliersDialogOpen} />
    </div>
  );
};