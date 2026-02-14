/**
 * Componente de Listagem de Contas a Receber
 */

import { useState } from "react";
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
import { useAccountsReceivable } from "@/hooks/useAccountsReceivable";
import { formatCurrency } from "@/lib/financialUtils";
import { formatDate } from "@/lib/reservationUtils";
import { Loader2, DollarSign, Filter, Search, Eye, Edit } from "lucide-react";
import type { AccountsReceivable } from "@/services/financial/accountsReceivableService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const originLabels: Record<AccountsReceivable['origin'], string> = {
  reservation: "Reserva",
  prepayment: "Pré-pagamento",
  penalty: "Multa",
  cancellation_penalty: "Multa Cancelamento",
  no_show_penalty: "Multa No-Show",
  extra_consumption: "Consumo Extra",
  service_fee: "Taxa de Serviço",
  other: "Outro",
};

const statusLabels: Record<AccountsReceivable['status'], string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const statusColors: Record<AccountsReceivable['status'], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  partial: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export const AccountsReceivableList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReceivable, setSelectedReceivable] = useState<AccountsReceivable | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  const filters = {
    status: statusFilter !== "all" ? statusFilter as AccountsReceivable['status'] : undefined,
    origin: originFilter !== "all" ? originFilter as AccountsReceivable['origin'] : undefined,
    overdueOnly: statusFilter === "overdue",
  };

  const { receivables, summary, isLoading, payReceivable, isPaying } = useAccountsReceivable(filters);

  // Filtrar por termo de busca
  const filteredReceivables = receivables.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.description.toLowerCase().includes(term) ||
      r.reservation_id?.toLowerCase().includes(term) ||
      r.client_id?.toLowerCase().includes(term)
    );
  });

  const handlePayReceivable = () => {
    if (!selectedReceivable || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    const remaining = selectedReceivable.amount - selectedReceivable.paid_amount;
    if (amount > remaining) {
      return;
    }

    payReceivable(
      {
        receivableId: selectedReceivable.id,
        amount,
      },
      {
        onSuccess: () => {
          setPaymentDialogOpen(false);
          setPaymentAmount("");
          setSelectedReceivable(null);
        },
      }
    );
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
      {/* Cards de Resumo */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total a Receber</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.total)}</p>
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
                <p className="text-sm text-muted-foreground">Pago</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(summary.paid)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, reserva ou cliente..."
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

          <Select value={originFilter} onValueChange={setOriginFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Origens</SelectItem>
              <SelectItem value="reservation">Reserva</SelectItem>
              <SelectItem value="prepayment">Pré-pagamento</SelectItem>
              <SelectItem value="cancellation_penalty">Multa Cancelamento</SelectItem>
              <SelectItem value="no_show_penalty">Multa No-Show</SelectItem>
              <SelectItem value="extra_consumption">Consumo Extra</SelectItem>
              <SelectItem value="service_fee">Taxa de Serviço</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Contas a Receber</h3>
        </div>
        {filteredReceivables.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma conta a receber encontrada
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceivables.map((receivable) => {
                const remaining = receivable.amount - receivable.paid_amount;
                const isOverdue = receivable.status === "overdue" || 
                  (receivable.status === "pending" && new Date(receivable.due_date) < new Date());

                return (
                  <TableRow key={receivable.id}>
                    <TableCell className="font-medium">
                      {receivable.description}
                    </TableCell>
                    <TableCell>
                      {originLabels[receivable.origin]}
                    </TableCell>
                    <TableCell>
                      <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                        {format(new Date(receivable.due_date), "PPP", { locale: ptBR })}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(receivable.amount)}</TableCell>
                    <TableCell>{formatCurrency(receivable.paid_amount)}</TableCell>
                    <TableCell>
                      <span className={remaining > 0 ? "font-semibold" : ""}>
                        {formatCurrency(remaining)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[receivable.status]}>
                        {statusLabels[receivable.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {remaining > 0 && receivable.status !== "cancelled" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedReceivable(receivable);
                              setPaymentAmount(remaining.toFixed(2));
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Pagar
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

      {/* Dialog de Pagamento */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>
              Registrar pagamento para: {selectedReceivable?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Valor Total</Label>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(selectedReceivable?.amount || 0)}
              </p>
            </div>
            <div>
              <Label>Valor Pago</Label>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(selectedReceivable?.paid_amount || 0)}
              </p>
            </div>
            <div>
              <Label>Saldo Restante</Label>
              <p className="text-sm font-semibold">
                {formatCurrency(
                  (selectedReceivable?.amount || 0) - (selectedReceivable?.paid_amount || 0)
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
                max={
                  (selectedReceivable?.amount || 0) - (selectedReceivable?.paid_amount || 0)
                }
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPaymentDialogOpen(false);
                setPaymentAmount("");
                setSelectedReceivable(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePayReceivable}
              disabled={isPaying || !paymentAmount || parseFloat(paymentAmount) <= 0}
            >
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
    </div>
  );
};

