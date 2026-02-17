/**
 * Componente de Listagem de Estornos
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { useRefunds } from "@/hooks/useRefunds";
import { formatCurrency } from "@/lib/financialUtils";
import { Loader2, Search, CheckCircle, XCircle, Clock, Eye, User, Calendar, Hash } from "lucide-react";
import type { Refund } from "@/services/financial/refundService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";

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
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [refundForView, setRefundForView] = useState<Refund | null>(null);

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

  // Buscar reserva e hóspede quando abrir o diálogo de detalhes
  const { data: reservationDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["reservation_guest_for_refund", refundForView?.reservation_id],
    queryFn: async () => {
      if (!refundForView?.reservation_id) return null;
      const { data: res, error: resError } = await supabase
        .from("reservations")
        .select("id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, guest_name, guest_id, client_id")
        .eq("id", refundForView.reservation_id)
        .single();
      if (resError || !res) return null;
      let guest = null;
      const guestId = res.guest_id || res.client_id;
      if (guestId) {
        const { data: client } = await supabase
          .from("clients")
          .select("full_name, email, phone, document_number")
          .eq("id", guestId)
          .single();
        guest = client;
      }
      return { reservation: res, guest };
    },
    enabled: viewDetailsOpen && !!refundForView?.reservation_id,
  });

  const openViewDetails = (refund: Refund) => {
    setRefundForView(refund);
    setViewDetailsOpen(true);
  };

  const goToReservation = () => {
    if (reservationDetails?.reservation?.reservation_code && establishmentId) {
      setViewDetailsOpen(false);
      navigate(`/${establishmentId}/reservas/${reservationDetails.reservation.reservation_code}`);
    }
  };

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
                    <div className="flex items-center gap-2 flex-wrap">
                      {refund.reservation_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openViewDetails(refund)}
                          title="Ver hóspede e reserva"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver reserva
                        </Button>
                      )}
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

      {/* Dialog Ver hóspede e reserva */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hóspede e reserva</DialogTitle>
            <DialogDescription>
              Dados da reserva vinculada ao estorno
              {refundForView && (
                <span className="block mt-1 text-muted-foreground font-normal">
                  Estorno: {formatCurrency(refundForView.amount)} — {format(new Date(refundForView.created_at), "PPP", { locale: ptBR })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : reservationDetails ? (
              <>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Reserva
                  </h4>
                  <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                    <p><span className="text-muted-foreground">Código:</span> {reservationDetails.reservation.reservation_code}</p>
                    <p><span className="text-muted-foreground">Check-in:</span> {reservationDetails.reservation.checkin_date ? format(new Date(reservationDetails.reservation.checkin_date), "PPP", { locale: ptBR }) : "—"}</p>
                    <p><span className="text-muted-foreground">Check-out:</span> {reservationDetails.reservation.checkout_date ? format(new Date(reservationDetails.reservation.checkout_date), "PPP", { locale: ptBR }) : "—"}</p>
                    <p><span className="text-muted-foreground">Total:</span> {formatCurrency(Number(reservationDetails.reservation.total_amount || 0))}</p>
                    <p><span className="text-muted-foreground">Status:</span> {reservationDetails.reservation.status}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Hóspede
                  </h4>
                  <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                    {reservationDetails.guest ? (
                      <>
                        <p><span className="text-muted-foreground">Nome:</span> {reservationDetails.guest.full_name || reservationDetails.reservation.guest_name || "—"}</p>
                        {reservationDetails.guest.email && <p><span className="text-muted-foreground">E-mail:</span> {reservationDetails.guest.email}</p>}
                        {reservationDetails.guest.phone && <p><span className="text-muted-foreground">Telefone:</span> {reservationDetails.guest.phone}</p>}
                        {reservationDetails.guest.document_number && <p><span className="text-muted-foreground">Documento:</span> {reservationDetails.guest.document_number}</p>}
                      </>
                    ) : (
                      <p><span className="text-muted-foreground">Nome:</span> {reservationDetails.reservation.guest_name || "—"}</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Reserva não encontrada ou sem vínculo.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDetailsOpen(false)}>
              Fechar
            </Button>
            {reservationDetails?.reservation?.reservation_code && establishmentId && (
              <Button onClick={goToReservation}>
                <Calendar className="h-4 w-4 mr-2" />
                Abrir reserva
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

