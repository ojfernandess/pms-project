/**
 * Componente de Listagem de Faturas
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
import { useInvoices } from "@/hooks/useInvoices";
import { formatCurrency } from "@/lib/financialUtils";
import { Loader2, FileText, Search, CheckCircle, XCircle, Download } from "lucide-react";
import type { Invoice } from "@/services/financial/invoiceService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusLabels: Record<Invoice['status'], string> = {
  draft: "Rascunho",
  issued: "Emitida",
  paid: "Paga",
  cancelled: "Cancelada",
  overdue: "Vencida",
};

const statusColors: Record<Invoice['status'], string> = {
  draft: "bg-gray-100 text-gray-800",
  issued: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  overdue: "bg-orange-100 text-orange-800",
};

const typeLabels: Record<Invoice['type'], string> = {
  reservation: "Reserva",
  penalty: "Multa",
  service: "Serviço",
  refund: "Reembolso",
  other: "Outro",
};

export const InvoiceList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  const filters = {
    status: statusFilter !== "all" ? statusFilter as Invoice['status'] : undefined,
    type: typeFilter !== "all" ? typeFilter as Invoice['type'] : undefined,
  };

  const { invoices, isLoading, issue, isIssuing, pay, isPaying, cancel, isCancelling } = useInvoices(filters);

  // Filtrar por termo de busca
  const filteredInvoices = invoices.filter((inv) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(term) ||
      inv.client_name.toLowerCase().includes(term) ||
      inv.notes?.toLowerCase().includes(term)
    );
  });

  const handlePayInvoice = () => {
    if (!selectedInvoice || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    pay(
      {
        invoiceId: selectedInvoice.id,
        amount,
      },
      {
        onSuccess: () => {
          setPaymentDialogOpen(false);
          setPaymentAmount("");
          setSelectedInvoice(null);
        },
      }
    );
  };

  const handleIssue = (invoice: Invoice) => {
    if (confirm(`Deseja emitir a fatura ${invoice.invoice_number}?`)) {
      issue(invoice.id);
    }
  };

  const handleCancel = (invoice: Invoice) => {
    if (confirm(`Deseja cancelar a fatura ${invoice.invoice_number}?`)) {
      cancel(invoice.id);
    }
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
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente ou descrição..."
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
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="issued">Emitida</SelectItem>
              <SelectItem value="paid">Paga</SelectItem>
              <SelectItem value="overdue">Vencida</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="reservation">Reserva</SelectItem>
              <SelectItem value="penalty">Multa</SelectItem>
              <SelectItem value="service">Serviço</SelectItem>
              <SelectItem value="refund">Reembolso</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Faturas</h3>
        </div>
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma fatura encontrada
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const remaining = invoice.total_amount - invoice.paid_amount;
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.series}-{invoice.invoice_number}
                    </TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell>{typeLabels[invoice.type]}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.issue_date), "PPP", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.due_date), "PPP", { locale: ptBR })}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                    <TableCell>{formatCurrency(invoice.paid_amount)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[invoice.status]}>
                        {statusLabels[invoice.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {invoice.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleIssue(invoice)}
                            disabled={isIssuing}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Emitir
                          </Button>
                        )}
                        {invoice.status === 'issued' && remaining > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setPaymentAmount(remaining.toFixed(2));
                              setPaymentDialogOpen(true);
                            }}
                          >
                            Pagar
                          </Button>
                        )}
                        {invoice.pdf_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(invoice.pdf_url, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(invoice)}
                            disabled={isCancelling}
                          >
                            <XCircle className="h-4 w-4" />
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
              Fatura: {selectedInvoice?.series}-{selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Valor Total</Label>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(selectedInvoice?.total_amount || 0)}
              </p>
            </div>
            <div>
              <Label>Valor Pago</Label>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(selectedInvoice?.paid_amount || 0)}
              </p>
            </div>
            <div>
              <Label>Saldo Restante</Label>
              <p className="text-sm font-semibold">
                {formatCurrency(
                  (selectedInvoice?.total_amount || 0) - (selectedInvoice?.paid_amount || 0)
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
                  (selectedInvoice?.total_amount || 0) - (selectedInvoice?.paid_amount || 0)
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
                setSelectedInvoice(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePayInvoice}
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

