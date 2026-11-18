/**
 * Componente de Listagem de Contas a Receber
 */

import { useMemo, useState } from "react";
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
import { useAccountsReceivable } from "@/hooks/useAccountsReceivable";
import { formatCurrency } from "@/lib/financialUtils";
import { formatDate } from "@/lib/reservationUtils";
import { Loader2, DollarSign, Search, Eye, Plus, X, Layers } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { titleOpenBalance } from "@/lib/financial/financialTitleStatus";
import { receivableCategoryLabel, resolveReceivableDebtorLabel, RECEIVABLE_CATEGORIES } from "@/lib/financial/receivableCategories";
import { AccountsReceivableDialog } from "./AccountsReceivableDialog";
import { ReceivableBatchPaymentDialog } from "./ReceivableBatchPaymentDialog";
import { EXPECTED_PAYMENT_METHODS } from "@/lib/financial/receivableCategories";
import type { AccountsReceivable } from "@/services/financial/accountsReceivableService";
import { listReceivableSettlements } from "@/services/financial/financialSettlementsService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
import {
  formatReservationChannelOrigin,
  resolveReservationBookingSourceLogo,
} from "@/lib/reservationChannelDisplay";

const originLabels: Record<AccountsReceivable['origin'], string> = {
  reservation: "Reserva",
  prepayment: "Pré-pagamento",
  penalty: "Multa",
  cancellation_penalty: "Multa Cancelamento",
  no_show_penalty: "Multa No-Show",
  extra_consumption: "Consumo Extra",
  service_fee: "Taxa de Serviço",
  other: "Outro",
  manual: "Manual",
  checkin_charge: "Cobrança check-in",
};

const debtorTypeLabels: Record<string, string> = {
  guest: "Hóspede",
  company: "Empresa",
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

function toDisplayManagerName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Channel Manager";
  const lower = value.toLowerCase();
  if (lower.includes("aiosell")) return "Aiosell";
  if (lower.includes("bukly")) return "Bukly";
  if (lower.includes("channex")) return "Channex";
  return value;
}

function toDisplayPartnerName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "não informado";
  const lower = value.toLowerCase();
  if (lower === "ota" || lower === "channel_manager" || lower === "channel manager") return "não informado";
  if (lower === "direct") return "Direct";
  if (lower === "booking.com" || lower === "booking") return "Booking.com";
  if (lower === "airbnb") return "Airbnb";
  if (lower === "expedia") return "Expedia";
  return value;
}

export const AccountsReceivableList = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [debtorFilter, setDebtorFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReceivable, setSelectedReceivable] = useState<AccountsReceivable | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentReference, setPaymentReference] = useState("");
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [receivableForView, setReceivableForView] = useState<AccountsReceivable | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const filters = {
    status: statusFilter !== "all" && statusFilter !== "overdue" ? (statusFilter as AccountsReceivable["status"]) : undefined,
    origin: originFilter !== "all" ? (originFilter as AccountsReceivable["origin"]) : undefined,
    debtorType:
      debtorFilter !== "all" ? (debtorFilter as AccountsReceivable["debtor_type"]) : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    overdueOnly: statusFilter === "overdue",
  };

  const { receivables, summary, isLoading, payReceivable, isPaying, cancelReceivable, isCancelling } =
    useAccountsReceivable(filters);

  const { data: settlementHistory = [] } = useQuery({
    queryKey: ["receivable_settlements", selectedReceivable?.id],
    queryFn: async () => {
      if (!selectedReceivable?.id) return [];
      const result = await listReceivableSettlements(selectedReceivable.id);
      if (!result.success) throw new Error(result.error);
      return (result.data || []).filter((s) => !s.reversed_at);
    },
    enabled: paymentDialogOpen && !!selectedReceivable?.id,
  });

  // Buscar reserva e hóspede quando abrir o diálogo de detalhes
  const { data: reservationDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["reservation_guest_for_receivable", receivableForView?.reservation_id],
    queryFn: async () => {
      if (!receivableForView?.reservation_id) return null;
      const { data: res, error: resError } = await supabase
        .from("reservations")
        .select("id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, guest_name, guest_id, client_id")
        .eq("id", receivableForView.reservation_id)
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
    enabled: viewDetailsOpen && !!receivableForView?.reservation_id,
  });

  const openViewDetails = (receivable: AccountsReceivable) => {
    setReceivableForView(receivable);
    setViewDetailsOpen(true);
  };

  const goToReservation = () => {
    if (reservationDetails?.reservation?.reservation_code && establishmentId) {
      setViewDetailsOpen(false);
      navigate(`/${establishmentId}/reservas/${reservationDetails.reservation.reservation_code}`);
    }
  };

  // Filtrar por termo de busca
  const filteredReceivables = receivables.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.description.toLowerCase().includes(term) ||
      r.reservation_id?.toLowerCase().includes(term) ||
      r.client_id?.toLowerCase().includes(term) ||
      resolveReceivableDebtorLabel(r).toLowerCase().includes(term) ||
      r.debtor_document?.toLowerCase().includes(term)
    );
  });

  const batchReceivables = filteredReceivables.filter((r) => selectedBatchIds.includes(r.id));

  const toggleBatchId = (id: string, checked: boolean) => {
    setSelectedBatchIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const reservationIds = useMemo(
    () => [...new Set(filteredReceivables.map((r) => r.reservation_id).filter((id): id is string => !!id))],
    [filteredReceivables]
  );

  const { data: reservationOriginsMap = {} } = useQuery({
    queryKey: ["accounts-receivable-reservation-origins", reservationIds],
    queryFn: async () => {
      if (!reservationIds.length) return {} as Record<string, { label: string; logoUrl: string | null }>;
      // Evita 400 por URL longa (id=in.(...)) quando a lista é grande.
      const CHUNK_SIZE = 10;
      const allRows: Array<{
        id: string;
        channel?: string | null;
        ota_reservations?: Array<{
          ota_reservation_code?: string | null;
          ota_source_channel_name?: string | null;
          ota_segment?: string | null;
          ota_channels?: { name?: string | null; channel_manager_type?: string | null } | null;
        }> | null;
      }> = [];

      for (let i = 0; i < reservationIds.length; i += CHUNK_SIZE) {
        const chunk = reservationIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from("reservations")
          .select(`
            id,
            channel,
            ota_reservations (
              ota_reservation_code,
              ota_source_channel_name,
              ota_segment,
              ota_channels (
                name,
                channel_manager_type
              )
            )
          `)
          .in("id", chunk);
        if (!error) {
          allRows.push(...((data ?? []) as typeof allRows));
          continue;
        }

        // Fallback defensivo: se um lote falhar (ex.: URL ainda extensa), busca 1 a 1.
        for (const reservationId of chunk) {
          const { data: singleData, error: singleError } = await supabase
            .from("reservations")
            .select(`
              id,
              channel,
              ota_reservations (
                ota_reservation_code,
                ota_source_channel_name,
                ota_segment,
                ota_channels (
                  name,
                  channel_manager_type
                )
              )
            `)
            .eq("id", reservationId)
            .limit(1);
          if (singleError) continue;
          allRows.push(...((singleData ?? []) as typeof allRows));
        }
      }

      const map: Record<string, { label: string; logoUrl: string | null }> = {};
      allRows.forEach((reservation) => {
        const logo = resolveReservationBookingSourceLogo(
          reservation as Parameters<typeof resolveReservationBookingSourceLogo>[0]
        );
        map[reservation.id] = {
          label: formatReservationChannelOrigin(reservation),
          logoUrl: logo.logoUrl,
        };
      });

      return map;
    },
    enabled: reservationIds.length > 0,
  });

  const resolveReservationOriginLabel = (receivable: AccountsReceivable): string => {
    if (!receivable.reservation_id) return "—";
    const md = (receivable.metadata ?? {}) as Record<string, unknown>;
    const metadataManagerHint =
      (typeof md.channel_manager === "string" && md.channel_manager.trim()) ||
      (typeof md.manager === "string" && md.manager.trim()) ||
      (typeof md.source_manager === "string" && md.source_manager.trim()) ||
      "";
    const metadataPartnerHint =
      (typeof md.ota_source_channel_name === "string" && md.ota_source_channel_name.trim()) ||
      (typeof md.source_channel === "string" && md.source_channel.trim()) ||
      (typeof md.channel_name === "string" && md.channel_name.trim()) ||
      (typeof md.partner === "string" && md.partner.trim()) ||
      (typeof md.channel === "string" && md.channel.trim()) ||
      (typeof md.origin === "string" && md.origin.trim()) ||
      "";

    const fromReservation = reservationOriginsMap[receivable.reservation_id];
    if (fromReservation?.label && fromReservation.label.trim()) {
      const normalized = fromReservation.label.toLowerCase();
      // Padroniza visual para reservas vindas de channel: "Aiosell / Booking.com" ou "Aiosell / Direct"
      if (normalized.includes("ota / channel manager")) {
        const partnerMatch = fromReservation.label.match(/Canal parceiro:\s*([^·]+)/i);
        const managerBits = fromReservation.label.split("·").map((s) => s.trim());
        const managerName = managerBits.find(
          (bit) =>
            bit &&
            !bit.toLowerCase().includes("ota / channel manager") &&
            !bit.toLowerCase().includes("canal parceiro:") &&
            !bit.toLowerCase().includes("segmento:")
        );
        const partner = toDisplayPartnerName(partnerMatch?.[1]?.trim());
        const managerLabel = toDisplayManagerName(managerName);
        if (managerName || partner) {
          return `${managerLabel} / ${partner || "não informado"}`;
        }
        const fallbackManager = toDisplayManagerName(metadataManagerHint || "Aiosell");
        const fallbackPartner = toDisplayPartnerName(metadataPartnerHint || "");
        return `${fallbackManager} / ${fallbackPartner}`;
      }
      return fromReservation.label;
    }

    const rawHints = [
      md.origin,
      md.channel,
      md.channel_name,
      md.source,
      md.source_channel,
      md.ota_source_channel_name,
      md.channel_manager,
    ]
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .filter(Boolean);

    const joined = rawHints.join(" ");
    const looksLikeChannel =
      joined.includes("ota") ||
      joined.includes("channel") ||
      joined.includes("booking") ||
      joined.includes("airbnb") ||
      joined.includes("expedia") ||
      joined.includes("aiosell");

    if (looksLikeChannel) {
      const managerHint =
        rawHints.find((h) => h.includes("aiosell")) ||
        rawHints.find((h) => h.includes("bukly")) ||
        "Channel Manager";
      const partnerHint =
        (typeof md.ota_source_channel_name === "string" && md.ota_source_channel_name.trim()) ||
        (typeof md.channel_name === "string" && md.channel_name.trim()) ||
        (typeof md.source_channel === "string" && md.source_channel.trim()) ||
        (typeof md.channel === "string" && md.channel.trim()) ||
        (typeof md.origin === "string" && md.origin.trim()) ||
        "não informado";
      const managerLabel =
        toDisplayManagerName(managerHint);
      return `${managerLabel} / ${toDisplayPartnerName(String(partnerHint))}`;
    }

    // Sem indícios de OTA/channel manager: tratar como reserva do PMS/balcão.
    return "Direto (PMS / balcão)";
  };

  const handlePayReceivable = () => {
    if (!selectedReceivable || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    const remaining = titleOpenBalance(selectedReceivable.amount, selectedReceivable.paid_amount);
    if (amount > remaining + 0.02) {
      return;
    }

    payReceivable(
      {
        receivableId: selectedReceivable.id,
        amount,
        paymentMethod,
        reference: paymentReference || undefined,
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
                <p className="text-sm text-muted-foreground">Recebido (títulos quitados)</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(summary.paid)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por devedor, descrição ou reserva..."
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
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          <Select value={debtorFilter} onValueChange={setDebtorFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Devedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos devedores</SelectItem>
              <SelectItem value="guest">Hóspede</SelectItem>
              <SelectItem value="company">Empresa</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {RECEIVABLE_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant={batchMode ? "default" : "outline"} onClick={() => { setBatchMode((v) => !v); setSelectedBatchIds([]); }}>
            <Layers className="h-4 w-4 mr-2" />
            Lote
          </Button>

          {batchMode && selectedBatchIds.length > 0 && (
            <Button onClick={() => setBatchDialogOpen(true)}>
              Receber {selectedBatchIds.length} título(s)
            </Button>
          )}

          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova conta
          </Button>
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
                {batchMode && <TableHead className="w-10" />}
                <TableHead>Cliente / empresa</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceivables.map((receivable) => {
                const remaining = titleOpenBalance(receivable.amount, receivable.paid_amount);
                const isOverdue = receivable.status === "overdue" || 
                  (receivable.status === "pending" && new Date(receivable.due_date) < new Date());
                const canSelectBatch = batchMode && remaining > 0.02 && receivable.status !== "cancelled";

                return (
                  <TableRow key={receivable.id}>
                    {batchMode && (
                      <TableCell>
                        {canSelectBatch ? (
                          <Checkbox
                            checked={selectedBatchIds.includes(receivable.id)}
                            onCheckedChange={(v) => toggleBatchId(receivable.id, v === true)}
                          />
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-sm">
                      <div>{resolveReceivableDebtorLabel(receivable)}</div>
                      {receivable.debtor_type && (
                        <span className="text-xs text-muted-foreground">
                          {debtorTypeLabels[receivable.debtor_type] || receivable.debtor_type}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {receivable.description}
                      {receivable.total_installments && receivable.total_installments > 1 && (
                        <Badge variant="outline" className="ml-2">
                          {receivable.installment_number}/{receivable.total_installments}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {receivableCategoryLabel(receivable.financial_category)}
                    </TableCell>
                    <TableCell>
                      {originLabels[receivable.origin] ?? receivable.origin}
                    </TableCell>
                    <TableCell>
                      <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                        {format(new Date(receivable.due_date), "PPP", { locale: ptBR })}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(receivable.amount)}</TableCell>
                    <TableCell>
                      <span className={remaining > 0.02 ? "font-semibold" : ""}>
                        {formatCurrency(remaining)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[receivable.status]}>
                        {statusLabels[receivable.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {receivable.reservation_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openViewDetails(receivable)}
                            title="Ver hóspede e reserva"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver reserva
                          </Button>
                        )}
                        {remaining > 0.02 && receivable.status !== "cancelled" && !batchMode && (
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
                            Receber
                          </Button>
                        )}
                        {receivable.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Cancelar título "${receivable.description}"?`)) {
                                cancelReceivable(receivable.id);
                              }
                            }}
                            disabled={isCancelling}
                          >
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

      {/* Dialog de Pagamento */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
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
              <Label htmlFor="payment-amount">Valor do recebimento</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={titleOpenBalance(selectedReceivable?.amount || 0, selectedReceivable?.paid_amount || 0)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma de pagamento</Label>
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
                <Label>Referência</Label>
                <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            {settlementHistory.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Histórico de recebimentos</p>
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
                "Registrar recebimento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountsReceivableDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <ReceivableBatchPaymentDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        receivables={batchReceivables}
        onComplete={() => {
          setSelectedBatchIds([]);
          setBatchMode(false);
        }}
      />

      {/* Dialog Ver hóspede e reserva */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hóspede e reserva</DialogTitle>
            <DialogDescription>
              Dados da reserva vinculada à conta a receber
              {receivableForView && (
                <span className="block mt-1 text-muted-foreground font-normal">
                  {receivableForView.description} — {formatCurrency(receivableForView.amount)} (venc.: {format(new Date(receivableForView.due_date), "PPP", { locale: ptBR })})
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

