import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Filter, Calendar, User, Bed, Loader2, Map, AlertTriangle, Bell } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useReservations } from "@/hooks/useReservations";
import { usePendingReservations } from "@/hooks/usePendingReservations";
import { useExpiredPreregistrations } from "@/hooks/useExpiredPreregistrations";
import { ReservationDialog } from "@/components/reservations/ReservationDialog";
import { ReservationTimeline } from "@/components/reservations/ReservationTimeline";
import { ReservationCalendarMap } from "@/components/reservations/ReservationCalendarMap";
import { BlockRoomDialog } from "@/components/reservations/BlockRoomDialog";
import { BlockViewDialog } from "@/components/reservations/BlockViewDialog";
import { CancelReservationDialog } from "@/components/reservations/CancelReservationDialog";
import PendingReservations from "@/pages/PendingReservations";
import { formatCurrency, formatDate } from "@/lib/reservationUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useNavigate, useParams } from "react-router-dom";
import { logActivity } from "@/lib/activityLogger";
import { useTranslation } from "react-i18next";

const Reservations = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<string | undefined>();
  const [initialReservationData, setInitialReservationData] = useState<{
    checkin_date?: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
    channel?: string;
    pricing_plan_id?: string;
    adults?: number;
    children?: number;
    total_amount?: number;
    action?: "confirmed" | "blocked" | "preregistration";
  } | undefined>();
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockDialogData, setBlockDialogData] = useState<{
    category_id: string;
    room_id?: string;
    checkin_date: string;
    checkout_date: string;
  } | null>(null);
  const [blockViewDialogOpen, setBlockViewDialogOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<{ 
    id: string; 
    code?: string;
    paid_amount?: number;
    checkin_date?: string;
    checkout_date?: string;
    total_amount?: number;
    pricing_plan_id?: string | null;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("map");

  const { reservations, isLoading, refetch, checkIn, checkOut, cancelReservation, updateReservation, replaceReservationRoom, confirmPreregistration } = useReservations();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  
  // Buscar pendências para mostrar indicador
  const { newOTAReservations, newCounterReservations, noCheckIn, overbookings } = usePendingReservations();
  
  // Cancelar pré-reservas expiradas ao carregar a página
  const { cancelExpired } = useExpiredPreregistrations();
  
  useEffect(() => {
    // Cancelar pré-reservas expiradas ao carregar a página
    cancelExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch das reservas quando mudar para a aba do mapa para garantir sincronização
  useEffect(() => {
    if (activeTab === "map") {
      // Invalidar e refetch todas as queries de reservas para garantir que o mapa mostre dados atualizados
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    }
  }, [activeTab, queryClient]);
  
  // Calcular total de pendências
  const totalPending = (newOTAReservations?.length || 0) + 
                      (newCounterReservations?.length || 0) + 
                      (noCheckIn?.length || 0) + 
                      (overbookings?.length || 0);
  const hasPending = totalPending > 0;

  // Debug: monitorar estado do dialog
  useEffect(() => {
    if (dialogOpen) {
      console.log("Dialog aberto, reservationId:", selectedReservationId);
    }
  }, [dialogOpen, selectedReservationId]);

  // Estatísticas - usar mesma lógica do mapa de reservas
  // IMPORTANTE: Uma reserva pode aparecer em múltiplas categorias
  // - Confirmadas: reservas com valor base pago
  // - Pendentes: reservas com taxas pendentes OU base não paga completamente
  const stats = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let unpaid = 0;
    const today = new Date().toISOString().split("T")[0];
    let checkinsToday = 0;

    reservations.forEach((r: any) => {
      // Pular status especiais que não dependem de pagamento
      if (['blocked', 'cancelled', 'checkedin', 'checkedout', 'noshow', 'preregistration'].includes(r.status)) {
        return;
      }

      const paidAmount = Number(r.paid_amount || 0);
      const baseTotalAmount = Number(r.total_amount || 0);
      
      // Calcular total incluindo taxas extras
      const serviceFeesTotal = (r.reservation_service_fees || []).reduce((sum: number, fee: any) => {
        return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
      }, 0);
      
      const totalWithFees = baseTotalAmount + serviceFeesTotal;
      
      // Determinar em quais categorias a reserva se encaixa
      let isConfirmed = false;
      let isPending = false;
      let isUnpaid = false;
      
      if (paidAmount === 0) {
        // Sem pagamento = Não Pago
        isUnpaid = true;
      } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
        // Valor base pago = Confirmada
        isConfirmed = true;
        
        // Verificar se há taxas pendentes
        if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
          // Base paga MAS com taxas pendentes = Também Pendente
          isPending = true;
        }
      } else {
        // Base não paga completamente = Pendente
        isPending = true;
      }
      
      // Contar em cada categoria
      if (isConfirmed) confirmed++;
      if (isPending) pending++;
      if (isUnpaid) unpaid++;
      
      // Contar check-ins de hoje
      if (r.checkin_date === today && (isConfirmed || isPending || isUnpaid)) {
        checkinsToday++;
      }
    });

    return { confirmed, pending, unpaid, checkinsToday };
  }, [reservations]);

  // Filtrar reservas
  const filteredReservations = useMemo(() => {
    return reservations.filter((reservation: any) => {
      // Converter identification_number para string para busca
      const identificationNumberStr = reservation.identification_number 
        ? `#${reservation.identification_number}` 
        : '';
      
      const matchesSearch =
        reservation.reservation_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        identificationNumberStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.guest?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.financial_responsible?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.rooms?.room_number?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || reservation.status === statusFilter;

      // Filtro por data: verificar se a reserva se sobrepõe ao período filtrado
      let matchesDate = true;
      if (dateFromFilter || dateToFilter) {
        const reservationCheckin = new Date(reservation.checkin_date);
        const reservationCheckout = new Date(reservation.checkout_date);
        
        if (dateFromFilter && dateToFilter) {
          // Período completo: reserva deve se sobrepor ao período filtrado
          const filterFrom = new Date(dateFromFilter);
          const filterTo = new Date(dateToFilter);
          // Reserva se sobrepõe se: checkout >= filterFrom E checkin <= filterTo
          matchesDate = reservationCheckout >= filterFrom && reservationCheckin <= filterTo;
        } else if (dateFromFilter) {
          // Apenas data inicial: reserva deve começar ou terminar após a data inicial
          const filterFrom = new Date(dateFromFilter);
          matchesDate = reservationCheckout >= filterFrom;
        } else if (dateToFilter) {
          // Apenas data final: reserva deve começar antes ou na data final
          const filterTo = new Date(dateToFilter);
          matchesDate = reservationCheckin <= filterTo;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [reservations, searchTerm, statusFilter, dateFromFilter, dateToFilter]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      unpaid: { label: "Não Pago", variant: "destructive" },
      pending: { label: "Pendente", variant: "secondary" },
      confirmed: { label: "Confirmada", variant: "default" },
      checkedin: { label: "Check-in", variant: "outline" },
      checkedout: { label: "Check-out", variant: "outline" },
      cancelled: { label: "Cancelada", variant: "destructive" },
      noshow: { label: "No Show", variant: "destructive" },
      blocked: { label: "Quarto Bloqueado", variant: "secondary" },
    };

    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleEdit = (id: string) => {
    const currentId = establishmentId || localStorage.getItem("selectedEstablishmentId");
    if (currentId) {
      // Buscar o reservation_code da reserva
      const reservation = reservations.find((r: any) => r.id === id);
      if (reservation?.reservation_code) {
        navigate(`/${currentId}/reservas/${reservation.reservation_code}`);
      } else {
        // Fallback: se não encontrar o código, usar o ID (para compatibilidade)
        navigate(`/${currentId}/reservas/${id}`);
      }
    }
  };

  const handleNew = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log("handleNew chamado");
    setSelectedReservationId(undefined);
    setInitialReservationData(undefined);
    setDialogOpen(true);
  };

  const handleCheckIn = async (id: string, roomId?: string) => {
    try {
      await checkIn({ id, roomId });
    } catch (error) {
      // Error já tratado no hook
    }
  };

  const handleCheckOut = async (id: string) => {
    try {
      await checkOut(id);
    } catch (error) {
      // Error já tratado no hook
    }
  };

  const handleCancel = (id: string, code?: string, paidAmount?: number, reservation?: any) => {
    setReservationToCancel({ 
      id, 
      code, 
      paid_amount: paidAmount,
      checkin_date: reservation?.checkin_date,
      checkout_date: reservation?.checkout_date,
      total_amount: reservation?.total_amount,
      pricing_plan_id: reservation?.pricing_plan_id,
    });
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async (reason: string, refundPayments: boolean) => {
    if (!reservationToCancel) return;
    
    try {
      await cancelReservation({ id: reservationToCancel.id, reason, refundPayments });
      setCancelDialogOpen(false);
      setReservationToCancel(null);
    } catch (error) {
      // Error já tratado no hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("reservations.title")}</h1>
          <p className="text-muted-foreground">{t("reservations.subtitle")}</p>
        </div>
        {canCreate("reservations") && activeTab === "list" && (
          <Button 
            onClick={handleNew}
            type="button"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("reservations.newReservation")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.confirmed}</p>
              <p className="text-sm text-muted-foreground">{t("reservations.confirmed")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <User className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">{t("reservations.pendingStatus")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.unpaid}</p>
              <p className="text-sm text-muted-foreground">{t("reservations.unpaid")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bed className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.checkinsToday}</p>
              <p className="text-sm text-muted-foreground">{t("reservations.checkinsToday")}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">{t("reservations.list")}</TabsTrigger>
          <TabsTrigger value="map">{t("reservations.map")}</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            <div className="flex items-center gap-2">
              Pendências
              {hasPending && (
                <>
                  <Bell className="h-4 w-4 text-destructive animate-blink" />
                  <Badge variant="destructive" className="animate-blink">
                    {totalPending}
                  </Badge>
                </>
              )}
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="p-6">
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("reservations.searchPlaceholder")}
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      placeholder="Data inicial"
                      className="w-[150px]"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                    />
                  </div>
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="date"
                    placeholder="Data final"
                    className="w-[150px]"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                    min={dateFromFilter || undefined}
                  />
                  {(dateFromFilter || dateToFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDateFromFilter("");
                        setDateToFilter("");
                      }}
                      className="h-9"
                    >
                      Limpar datas
                    </Button>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Filter className="h-4 w-4 mr-2" />
                      {t("common.filter")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                      {t("reservations.all")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("unpaid")}>
                      {t("reservations.unpaidStatus")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("pending")}>
                      {t("reservations.pendingStatusFilter")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("confirmed")}>
                      {t("reservations.confirmedStatus")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("checkedin")}>
                      {t("reservations.checkedin")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("checkedout")}>
                      {t("reservations.checkedout")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("blocked")}>
                      {t("reservations.blocked")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("cancelled")}>
                      {t("reservations.cancelled")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma reserva encontrada
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Hóspede</TableHead>
                <TableHead>Quarto</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map((reservation: any) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{reservation.identification_number || "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {reservation.reservation_code}
                  </TableCell>
                  <TableCell>
                    {reservation.guest?.full_name || reservation.financial_responsible?.full_name || "N/A"}
                  </TableCell>
                  <TableCell>
                    {reservation.rooms?.room_number || "Não atribuído"}
                  </TableCell>
                  <TableCell>{formatDate(reservation.checkin_date)}</TableCell>
                  <TableCell>{formatDate(reservation.checkout_date)}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(reservation.total_amount)}
                  </TableCell>
                  <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[180px]">
                        {/* Ver Detalhes - sempre visível */}
                        <DropdownMenuItem 
                          onSelect={(e) => {
                            e.preventDefault();
                            handleEdit(reservation.id);
                          }}
                        >
                          Ver Detalhes
                        </DropdownMenuItem>
                        
                        {/* Separador */}
                        {(canUpdate("reservations") || canDelete("reservations")) && (
                          <DropdownMenuSeparator />
                        )}
                        
                        {/* Editar - apenas se tiver permissão */}
                        {canUpdate("reservations") && (
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              handleEdit(reservation.id);
                            }}
                          >
                            Editar Reserva
                          </DropdownMenuItem>
                        )}
                        
                        {/* Check-in - apenas se status for confirmed */}
                        {canUpdate("reservations") && reservation.status === "confirmed" && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              handleCheckIn(reservation.id, reservation.room_id);
                            }}
                          >
                            Fazer Check-in
                          </DropdownMenuItem>
                        )}
                        
                        {/* Check-out - apenas se status for checkedin */}
                        {canUpdate("reservations") && reservation.status === "checkedin" && (
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              handleCheckOut(reservation.id);
                            }}
                          >
                            Fazer Check-out
                          </DropdownMenuItem>
                        )}
                        
                        {/* Efetivar Pré-reserva - apenas se status for preregistration */}
                        {canUpdate("reservations") && reservation.status === "preregistration" && (
                          <DropdownMenuItem 
                            onSelect={async (e) => {
                              e.preventDefault();
                              try {
                                await confirmPreregistration(reservation.id);
                                refetch();
                              } catch (error) {
                                // Erro já tratado no hook
                              }
                            }}
                            className="text-primary focus:text-primary"
                          >
                            Efetivar Pré-reserva
                          </DropdownMenuItem>
                        )}
                        
                        {/* Separador antes de ações destrutivas */}
                        {canDelete("reservations") && !["checkedout", "cancelled"].includes(reservation.status) && (
                          <DropdownMenuSeparator />
                        )}
                        
                        {/* Cancelar - apenas se tiver permissão e não estiver checkedout/cancelled */}
                        {canDelete("reservations") && !["checkedout", "cancelled"].includes(reservation.status) && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              handleCancel(reservation.id, reservation.reservation_code, reservation.paid_amount, reservation);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            Cancelar Reserva
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="map">
          <ReservationCalendarMap
            onSelectReservation={async (id) => {
              const currentId = establishmentId || localStorage.getItem("selectedEstablishmentId");
              if (currentId) {
                // Buscar o reservation_code da reserva
      const reservation = reservations.find((r: any) => r.id === id);
      if (reservation?.reservation_code) {
        navigate(`/${currentId}/reservas/${reservation.reservation_code}`);
      } else {
        // Fallback: se não encontrar o código, usar o ID (para compatibilidade)
        navigate(`/${currentId}/reservas/${id}`);
      }
              }
            }}
            onCreateReservation={(data: any) => {
              // Se for bloqueio, abrir modal específico de bloqueio
              if (data.action === "blocked") {
                setBlockDialogData({
                  category_id: data.category_id || "",
                  room_id: data.room_id,
                  checkin_date: data.checkin_date || "",
                  checkout_date: data.checkout_date || "",
                });
                setBlockDialogOpen(true);
              } else {
                // Para outras ações, usar o modal normal
                setSelectedReservationId(undefined);
                setInitialReservationData(data);
                setDialogOpen(true);
              }
            }}
            onReservationAction={(action, reservationId) => {
              if (action === "edit") {
                setSelectedReservationId(reservationId);
                setInitialReservationData(undefined);
                setDialogOpen(true);
              } else if (action === "checkin") {
                handleCheckIn(reservationId);
              } else if (action === "checkout") {
                handleCheckOut(reservationId);
              } else if (action === "cancel") {
                const reservation = reservations.find((r: any) => r.id === reservationId);
                handleCancel(reservationId, reservation?.reservation_code, reservation?.paid_amount, reservation);
              }
            }}
          />
        </TabsContent>

        <TabsContent value="pending">
          <PendingReservations />
        </TabsContent>
      </Tabs>

      <ReservationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedReservationId(undefined);
            setInitialReservationData(undefined);
          }
        }}
        onSuccess={() => {
          // Invalidar e refetch imediato para reservas (incluindo mapa e pré-reservas)
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.refetchQueries({ queryKey: ["reservations"] });
          // Invalidar também queries relacionadas
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });
          // Forçar refetch das reservas para garantir que a lista seja atualizada
          refetch();
          setDialogOpen(false);
          setSelectedReservationId(undefined);
          setInitialReservationData(undefined);
        }}
        reservationId={selectedReservationId}
        initialData={initialReservationData}
      />

      {/* Modal de Bloqueio */}
      {blockDialogData && (
        <BlockRoomDialog
          open={blockDialogOpen}
          onOpenChange={(open) => {
            setBlockDialogOpen(open);
            if (!open) {
              setBlockDialogData(null);
            }
          }}
          onSuccess={() => {
            refetch();
            setBlockDialogOpen(false);
            setBlockDialogData(null);
          }}
          initialData={blockDialogData}
        />
      )}

      {/* Modal de Visualização de Bloqueio */}
      {selectedBlockId && (
        <BlockViewDialog
          open={blockViewDialogOpen}
          onOpenChange={(open) => {
            setBlockViewDialogOpen(open);
            if (!open) {
              setSelectedBlockId(undefined);
            }
          }}
          reservationId={selectedBlockId}
          onDelete={async () => {
            if (selectedBlockId) {
              try {
                // Buscar dados do bloqueio antes de deletar
                const { data: blockReservation } = await supabase
                  .from("reservations")
                  .select(`
                    *,
                    rooms (*),
                    room_categories (*)
                  `)
                  .eq("id", selectedBlockId)
                  .single();

                // Para bloqueios, deletar a reserva ao invés de cancelar
                const { error } = await supabase
                  .from("reservations")
                  .delete()
                  .eq("id", selectedBlockId);
                
                if (error) throw error;

                // Registrar log de atividade
                if (blockReservation) {
                  try {
                    const roomName = blockReservation.rooms?.name || 
                                   blockReservation.rooms?.room_number || 
                                   blockReservation.room_categories?.name || 
                                   "N/A";
                    const blockReason = blockReservation.notes?.replace(/^Bloqueio:\s*/i, "") || "Não informado";
                    
                    await logActivity({
                      actionType: "unblocked",
                      entityType: "block",
                      entityId: blockReservation.id,
                      entityCode: null, // Bloqueios não têm código de reserva
                      description: `Quarto ${roomName} desbloqueado e removido (bloqueio de ${blockReservation.checkin_date} a ${blockReservation.checkout_date})`,
                      oldValues: {
                        status: "blocked",
                        room_id: blockReservation.room_id,
                        room_name: roomName,
                        checkin_date: blockReservation.checkin_date,
                        checkout_date: blockReservation.checkout_date,
                        reason: blockReason,
                      },
                      metadata: {
                        reservation_id: blockReservation.id,
                        deleted: true,
                      },
                    });
                  } catch (logError) {
                    console.error("Erro ao registrar log de desbloqueio:", logError);
                    // Não interromper o fluxo principal
                  }
                }
                
                // Invalidar queries para atualizar a UI
                queryClient.invalidateQueries({ queryKey: ["reservations"] });
                queryClient.invalidateQueries({ queryKey: ["rooms"] });
                queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
                
                toast.success("Bloqueio removido com sucesso!");
                refetch();
                setBlockViewDialogOpen(false);
                setSelectedBlockId(undefined);
              } catch (error: any) {
                toast.error(error.message || "Erro ao remover bloqueio");
              }
            }
          }}
        />
      )}

      {/* Modal de Cancelamento */}
      {reservationToCancel && (
        <CancelReservationDialog
          open={cancelDialogOpen}
          onOpenChange={(open) => {
            setCancelDialogOpen(open);
            if (!open) {
              setReservationToCancel(null);
            }
          }}
          reservationId={reservationToCancel.id}
          reservationCode={reservationToCancel.code}
          paidAmount={reservationToCancel.paid_amount || 0}
          hasPayments={(reservationToCancel.paid_amount || 0) > 0}
          reservationData={reservationToCancel.checkin_date ? {
            checkin_date: reservationToCancel.checkin_date,
            checkout_date: reservationToCancel.checkout_date || reservationToCancel.checkin_date,
            total_amount: reservationToCancel.total_amount || 0,
            pricing_plan_id: reservationToCancel.pricing_plan_id || null,
          } : undefined}
          onConfirm={handleConfirmCancel}
        />
      )}
    </div>
  );
};

export default Reservations;
