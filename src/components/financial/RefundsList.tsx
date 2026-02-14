/**
 * Componente de Listagem de Estornos
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
import { Textarea } from "@/components/ui/textarea";
import { useRefunds } from "@/hooks/useRefunds";
import { formatCurrency } from "@/lib/financialUtils";
import { Loader2, Search, CheckCircle, XCircle, Clock } from "lucide-react";
import type { Refund } from "@/services/financial/refundService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusLabels: Record<Refund['status'], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  processed: "Processado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
};

const statusColors: Record<Refund['status'], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  processed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const methodLabels: Record<Refund['refund_method'], string> = {
  original: "Método Original",
  bank_transfer: "Transferência Bancária",
  credit: "Crédito",
  other: "Outro",
};

export const RefundsList = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const filters = {
    status: statusFilter !== "all" ? statusFilter as Refund['status'] : undefined,
  };

  const {
    refunds,
    isLoading,
    approve,
    isApproving,
    process,
    isProcessing,
    reject,
    isRejecting,
  } = useRefunds(filters);

  // Filtrar por termo de busca
  const filteredRefunds = refunds.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.reason.toLowerCase().includes(term) ||
      r.id.toLowerCase().includes(term)
    );
  });

  const handleApprove = (refund: Refund) => {
    if (confirm(`Deseja aprovar o estorno de ${formatCurrency(refund.amount)}?`)) {
      approve(refund.id);
    }
  };

  const handleProcess = (refund: Refund) => {
    if (confirm(`Deseja processar o estorno de ${formatCurrency(refund.amount)}?`)) {
      process(refund.id);
    }
  };

  const handleReject = () => {
    if (!selectedRefund || !rejectReason.trim()) {
      return;
    }

    reject(
      {
        refundId: selectedRefund.id,
        reason: rejectReason,
      },
      {
        onSuccess: () => {
          setRejectDialogOpen(false);
          setRejectReason("");
          setSelectedRefund(null);
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
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por motivo ou ID..."
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
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="processed">Processado</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Estornos</h3>
        </div>
        {filteredRefunds.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum estorno encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRefunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>
                    {format(new Date(refund.created_at), "PPP", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(refund.amount)}
                  </TableCell>
                  <TableCell>
                    {methodLabels[refund.refund_method]}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {refund.reason}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[refund.status]}>
                      {statusLabels[refund.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {refund.status === 'pending' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(refund)}
                            disabled={isApproving}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRefund(refund);
                              setRejectDialogOpen(true);
                            }}
                            disabled={isRejecting}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {refund.status === 'approved' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProcess(refund)}
                          disabled={isProcessing}
                        >
                          <Clock className="h-4 w-4 mr-1" />
                          Processar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialog de Rejeição */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Estorno</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição do estorno de {formatCurrency(selectedRefund?.amount || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="reject-reason">Motivo da Rejeição *</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Descreva o motivo da rejeição..."
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
                setSelectedRefund(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReject}
              disabled={isRejecting || !rejectReason.trim()}
              variant="destructive"
            >
              {isRejecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejeitando...
                </>
              ) : (
                "Rejeitar Estorno"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

