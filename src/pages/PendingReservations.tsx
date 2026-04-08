import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  Calendar,
  User,
  Bed,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  RotateCcw,
} from "lucide-react";
import { usePendingReservations } from "@/hooks/usePendingReservations";
import { useReservations } from "@/hooks/useReservations";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { SplitReservationDialog } from "@/components/reservations/SplitReservationDialog";
import { ChangeRoomDialog } from "@/components/reservations/ChangeRoomDialog";
import { formatCurrency, formatDate } from "@/lib/reservationUtils";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";
import {
  channexRevisionPayloadGuestName,
  formatReservationChannelOrigin,
  resolveReservationBookingSourceLogo,
} from "@/lib/reservationChannelDisplay";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CancelReservationDialog } from "@/components/reservations/CancelReservationDialog";
import { invokeChannexFinalizeCancellationRevision } from "@/lib/channexReservationsSyncInvoke";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";

type ChannexCancelDialogTarget = {
  revisionId: string;
  channelId: string;
  establishmentId: string;
  reservation: {
    id: string;
    reservation_code?: string | null;
    checkin_date?: string | null;
    checkout_date?: string | null;
    total_amount?: number | null;
    paid_amount?: number | null;
    pricing_plan_id?: string | null;
    status?: string | null;
  };
};

const PendingReservations = () => {
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const { cancelReservation } = useReservations();
  const { newOTAReservations, newCounterReservations, noCheckIn, overbookings, channexModified, channexCancelled, channexModifiedCompleted, channexCancelledCompleted, isLoading, refetch, markPendingAsResolved, isMarkingResolved, acceptChannexRevision, isAcceptingChannexRevision } =
    usePendingReservations();
  const [selectedOverbooking, setSelectedOverbooking] = useState<any | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [changeRoomDialogOpen, setChangeRoomDialogOpen] = useState(false);
  const [selectedReservationForRoomChange, setSelectedReservationForRoomChange] = useState<any | null>(null);
  const [showCompletedChannex, setShowCompletedChannex] = useState(false);
  const [channexCancelTarget, setChannexCancelTarget] = useState<ChannexCancelDialogTarget | null>(null);
  const [finalizingChannexRevisionId, setFinalizingChannexRevisionId] = useState<string | null>(null);

  // URL :establishmentId é o numeric_id (ex. "5"), não o UUID. APIs Supabase/edge usam establishment.id (UUID).
  const establishmentIdResolved = selectedEstablishment?.id || establishmentId || "";

  const openChannexCancelAsMapFlow = (item: any) => {
    const res = item?.reservation;
    if (!establishmentIdResolved) {
      toast.error("Estabelecimento não identificado.");
      return;
    }
    if (!res?.id) {
      toast.error("Sem reserva vinculada nesta pendência. Execute a sincronização de reservas Channex e tente de novo.");
      return;
    }
    const st = String(res.status ?? "").toLowerCase();
    if (st === "cancelled") {
      toast.info("A reserva já está cancelada no PMS. Use «Finalizar no Channex».");
      return;
    }
    setChannexCancelTarget({
      revisionId: String(item.revision_id),
      channelId: String(item.ota_channel_id),
      establishmentId: establishmentIdResolved,
      reservation: {
        id: String(res.id),
        reservation_code: res.reservation_code ?? null,
        checkin_date: res.checkin_date ?? null,
        checkout_date: res.checkout_date ?? null,
        total_amount: res.total_amount ?? null,
        paid_amount: res.paid_amount ?? null,
        pricing_plan_id: res.pricing_plan_id ?? null,
        status: res.status ?? null,
      },
    });
  };

  const handleChannexCancelDialogConfirm = async (reason: string, refundPayments: boolean) => {
    if (!channexCancelTarget) return;
    const target = channexCancelTarget;
    await cancelReservation({
      id: target.reservation.id,
      reason,
      refundPayments,
    });
    try {
      await invokeChannexFinalizeCancellationRevision(target.channelId, target.establishmentId, target.revisionId);
      toast.success("Pendência Channex concluída: reserva cancelada no PMS e revisão finalizada.");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Reserva cancelada no PMS. Use «Finalizar no Channex (já cancelada no PMS)» nesta pendência para concluir.",
      );
    }
    refetch();
  };

  const finalizeChannexRevisionOnly = async (item: any) => {
    if (!establishmentIdResolved) {
      toast.error("Estabelecimento não identificado.");
      return;
    }
    setFinalizingChannexRevisionId(String(item.revision_id));
    try {
      await invokeChannexFinalizeCancellationRevision(
        String(item.ota_channel_id),
        establishmentIdResolved,
        String(item.revision_id),
      );
      toast.success("Revisão Channex finalizada (reserva já estava cancelada no PMS).");
      scheduleChannelSyncAfterInventoryChange(establishmentIdResolved);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao finalizar revisão Channex");
    } finally {
      setFinalizingChannexRevisionId(null);
    }
  };

  const handleViewReservation = (reservationCode: string) => {
    if (establishmentId) {
      navigate(`/${establishmentId}/reservas/${reservationCode}`);
    }
  };

  const handleSplitOverbooking = (overbooking: any) => {
    setSelectedOverbooking(overbooking);
    setSplitDialogOpen(true);
  };

  const handleChangeRoom = (overbooking: any) => {
    const fallbackRooms = Array.isArray(overbooking.alternativeRooms) ? overbooking.alternativeRooms : [];
    const candidateRooms =
      Array.isArray(overbooking.availableRooms) && overbooking.availableRooms.length > 0
        ? overbooking.availableRooms
        : fallbackRooms;
    setSelectedReservationForRoomChange({
      reservation: overbooking.reservation,
      availableRooms: candidateRooms,
    });
    setChangeRoomDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pendências</h2>
          <p className="text-muted-foreground text-sm">
            Gerencie novas reservas, check-ins pendentes e overbookings
          </p>
        </div>
        <Button onClick={refetch} variant="outline" size="sm">
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="ota" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ota" className="relative">
            Reservas de Canal
            {newOTAReservations.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {newOTAReservations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="counter" className="relative">
            Reservas Balcão
            {newCounterReservations.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {newCounterReservations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="no-checkin" className="relative">
            Sem Check-in
            {noCheckIn.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {noCheckIn.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overbookings" className="relative">
            Overbookings / Modificadas / Canceladas
            {overbookings.length + channexModified.length + channexCancelled.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {overbookings.length + channexModified.length + channexCancelled.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Reservas OTA */}
        <TabsContent value="ota">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Novas Reservas de Canal (Últimos 7 dias)</h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : newOTAReservations.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há novas reservas de canal nos últimos 7 dias.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newOTAReservations.map((reservation: any) => (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          {reservation.reservation_code}
                        </TableCell>
                        <TableCell>
                          {reservationGuestDisplayName(reservation)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkin_date)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkout_date)}
                        </TableCell>
                        <TableCell>
                          {reservation.rooms?.name ||
                            reservation.rooms?.room_number ||
                            "Sem quarto"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="max-w-[min(100%,280px)] whitespace-normal text-left font-normal inline-flex items-center gap-2"
                            title={formatReservationChannelOrigin(reservation)}
                          >
                            {(() => {
                              const source = resolveReservationBookingSourceLogo(
                                reservation as Parameters<typeof resolveReservationBookingSourceLogo>[0]
                              );
                              if (!source.logoUrl) return null;
                              return (
                                <img
                                  src={source.logoUrl}
                                  alt={source.sourceCode ? `Logo OTA ${source.sourceCode}` : "Logo OTA"}
                                  className="h-3.5 w-3.5 rounded-sm object-contain"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              );
                            })()}
                            {formatReservationChannelOrigin(reservation)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(reservation.total_amount || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reservation.status === "confirmed"
                                ? "default"
                                : reservation.status === "pending"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {reservation.status === "confirmed"
                              ? "Confirmada"
                              : reservation.status === "pending"
                              ? "Pendente"
                              : "Pré-reserva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewReservation(reservation.reservation_code)
                              }
                            >
                              Ver Detalhes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markPendingAsResolved(reservation.id)}
                              disabled={isMarkingResolved}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Resolver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab: Reservas Balcão */}
        <TabsContent value="counter">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Novas Reservas Balcão (Últimos 7 dias)</h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : newCounterReservations.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há novas reservas de balcão nos últimos 7 dias.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newCounterReservations.map((reservation: any) => (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          {reservation.reservation_code}
                        </TableCell>
                        <TableCell>
                          {reservationGuestDisplayName(reservation)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkin_date)}
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkout_date)}
                        </TableCell>
                        <TableCell>
                          {reservation.rooms?.name ||
                            reservation.rooms?.room_number ||
                            "Sem quarto"}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(reservation.total_amount || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reservation.status === "confirmed"
                                ? "default"
                                : reservation.status === "pending"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {reservation.status === "confirmed"
                              ? "Confirmada"
                              : reservation.status === "pending"
                              ? "Pendente"
                              : "Pré-reserva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewReservation(reservation.reservation_code)
                              }
                            >
                              Ver Detalhes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markPendingAsResolved(reservation.id)}
                              disabled={isMarkingResolved}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Resolver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab: Sem Check-in */}
        <TabsContent value="no-checkin">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Hóspedes Sem Check-in</h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : noCheckIn.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há hóspedes aguardando check-in.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noCheckIn.map((reservation: any) => (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          {reservation.reservation_code}
                        </TableCell>
                        <TableCell>
                          {reservationGuestDisplayName(reservation)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {formatDate(reservation.checkin_date)}
                            {format(parseISO(reservation.checkin_date), "yyyy-MM-dd") <
                              format(new Date(), "yyyy-MM-dd") && (
                              <Badge variant="destructive" className="text-xs">
                                Atrasado
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDate(reservation.checkout_date)}
                        </TableCell>
                        <TableCell>
                          {reservation.rooms?.name ||
                            reservation.rooms?.room_number ||
                            "Sem quarto"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reservation.status === "confirmed"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {reservation.status === "confirmed"
                              ? "Confirmada"
                              : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewReservation(reservation.reservation_code)
                              }
                            >
                              Ver Detalhes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markPendingAsResolved(reservation.id)}
                              disabled={isMarkingResolved}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Resolver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab: Overbookings */}
        <TabsContent value="overbookings">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="text-xl font-semibold">Overbookings</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCompletedChannex((v) => !v)}
                >
                  {showCompletedChannex ? "Ocultar histórico concluído" : "Mostrar histórico concluído"}
                </Button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : overbookings.length === 0 && channexModified.length === 0 && channexCancelled.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há overbookings no momento.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {channexModified.length > 0 && (
                    <Card className="p-4 border-amber-300">
                      <h3 className="font-semibold mb-3">Reservas Modificadas (Channex)</h3>
                      <div className="space-y-3">
                        {channexModified.map((item: any) => {
                          const payload = item.payload || {};
                          const room = Array.isArray(payload.rooms) ? payload.rooms[0] || {} : {};
                          const reservationRow = item.reservation || null;
                          const displayCheckin =
                            reservationRow?.checkin_date ||
                            payload.arrival_date ||
                            room.checkin_date ||
                            "-";
                          const displayCheckout =
                            reservationRow?.checkout_date ||
                            payload.departure_date ||
                            room.checkout_date ||
                            "-";
                          const displayAmount =
                            reservationRow?.total_amount ??
                            payload.amount ??
                            room.amount ??
                            "-";
                          const processStatus = String(item.process_status || "pending");
                          const processingMeta = payload?._processing_meta || {};
                          const modificationDetails = Array.isArray(processingMeta?.modification_details)
                            ? processingMeta.modification_details
                            : [];
                          const payloadGuest = channexRevisionPayloadGuestName(payload);
                          const displayChannexGuest =
                            payloadGuest !== "N/A"
                              ? payloadGuest
                              : String(reservationRow?.guest_name ?? "").trim() || "N/A";
                          const statusLabel =
                            processStatus === "failed"
                              ? "Falhou"
                              : processStatus === "acked"
                                ? "Sincronizada"
                                : processStatus === "processed"
                                  ? "Processada"
                                  : "Pendente";
                          return (
                            <div key={item.id} className="rounded-md border p-3">
                              <div className="mb-2 flex items-center gap-2">
                                <Badge
                                  variant={
                                    processStatus === "failed"
                                      ? "destructive"
                                      : processStatus === "acked"
                                        ? "default"
                                        : "outline"
                                  }
                                >
                                  {statusLabel}
                                </Badge>
                              </div>
                              <p className="text-sm"><strong>Reserva:</strong> {item.unique_id || item.booking_id}</p>
                              <p className="text-sm"><strong>Hóspede:</strong> {displayChannexGuest}</p>
                              <p className="text-sm"><strong>Período:</strong> {displayCheckin} até {displayCheckout}</p>
                              <p className="text-sm"><strong>Valor:</strong> {displayAmount}</p>
                              {modificationDetails.length > 0 ? (
                                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/40 p-2">
                                  <p className="text-xs font-semibold text-amber-900">Detalhes da modificação:</p>
                                  <ul className="mt-1 space-y-1 text-xs text-amber-900">
                                    {modificationDetails.map((change: any, idx: number) => (
                                      <li key={`${item.id}-change-${idx}`}>
                                        <strong>{String(change.field || "campo")}:</strong>{" "}
                                        {String(change.before ?? "-")} {" -> "} {String(change.after ?? "-")}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {item.error_message ? (
                                <p className="text-xs text-destructive mt-1">
                                  Último erro: {item.error_message}
                                </p>
                              ) : null}
                              <p className="text-sm text-muted-foreground">Ao aceitar: a reserva anterior é cancelada e uma nova versão é reprocessada no mapa.</p>
                              <Button
                                size="sm"
                                className="mt-2"
                                disabled={isAcceptingChannexRevision}
                                onClick={() =>
                                  acceptChannexRevision({
                                    revisionId: item.revision_id,
                                    channelId: item.ota_channel_id,
                                    bookingId: item.booking_id || undefined,
                                    bookingUniqueId: item.unique_id || undefined,
                                    status: "modified",
                                  })
                                }
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Reprocessar Modificação
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {channexCancelled.length > 0 && (
                    <Card className="p-4 border-red-300">
                      <h3 className="font-semibold mb-3">Reservas Canceladas (Channex)</h3>
                      <div className="space-y-3">
                        {channexCancelled.map((item: any) => {
                          const payload = item.payload || {};
                          const reservationRow = item.reservation || null;
                          const payloadGuestCx = channexRevisionPayloadGuestName(payload);
                          const displayChannexGuestCx =
                            payloadGuestCx !== "N/A"
                              ? payloadGuestCx
                              : String(reservationRow?.guest_name ?? "").trim() || "N/A";
                          const displayCheckin =
                            reservationRow?.checkin_date ||
                            payload.arrival_date ||
                            "-";
                          const displayCheckout =
                            reservationRow?.checkout_date ||
                            payload.departure_date ||
                            "-";
                          const processStatus = String(item.process_status || "pending");
                          const statusLabel =
                            processStatus === "failed"
                              ? "Falhou"
                              : processStatus === "acked"
                                ? "Sincronizada"
                                : processStatus === "processed"
                                  ? "Processada"
                                  : "Pendente";
                          return (
                            <div key={item.id} className="rounded-md border p-3">
                              <div className="mb-2 flex items-center gap-2">
                                <Badge
                                  variant={
                                    processStatus === "failed"
                                      ? "destructive"
                                      : processStatus === "acked"
                                        ? "default"
                                        : "outline"
                                  }
                                >
                                  {statusLabel}
                                </Badge>
                              </div>
                              <p className="text-sm"><strong>Reserva:</strong> {item.unique_id || item.booking_id}</p>
                              <p className="text-sm"><strong>Hóspede:</strong> {displayChannexGuestCx}</p>
                              <p className="text-sm"><strong>Período:</strong> {displayCheckin} até {displayCheckout}</p>
                              {item.error_message ? (
                                <p className="text-xs text-destructive mt-1">
                                  Último erro: {item.error_message}
                                </p>
                              ) : null}
                              <p className="text-sm text-muted-foreground">
                                O canal já cancelou e liberou disponibilidade. No PMS use o <strong>mesmo fluxo do mapa de reservas</strong>: política de
                                cancelamento, multa e opção de estornar pagamentos. Só depois a pendência Channex é finalizada e o inventário local é
                                reenviado ao Channex.
                              </p>
                              {!item.reservation_id || !reservationRow?.id ? (
                                <p className="text-xs text-amber-800 mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                                  Pendência sem reserva vinculada. Em Canais → Channex, execute a sincronização de reservas para criar o vínculo antes de
                                  cancelar aqui.
                                </p>
                              ) : null}
                              {reservationRow?.id &&
                              String(reservationRow.status ?? "").toLowerCase() !== "cancelled" ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="mt-2"
                                  disabled={!!finalizingChannexRevisionId || isAcceptingChannexRevision}
                                  onClick={() => openChannexCancelAsMapFlow(item)}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancelar no PMS (política e estorno)
                                </Button>
                              ) : null}
                              {reservationRow?.id &&
                              String(reservationRow.status ?? "").toLowerCase() === "cancelled" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="mt-2"
                                  disabled={
                                    finalizingChannexRevisionId === String(item.revision_id) || isAcceptingChannexRevision
                                  }
                                  onClick={() => finalizeChannexRevisionOnly(item)}
                                >
                                  {finalizingChannexRevisionId === String(item.revision_id) ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                  )}
                                  Finalizar no Channex (já cancelada no PMS)
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {showCompletedChannex && (channexModifiedCompleted.length > 0 || channexCancelledCompleted.length > 0) ? (
                    <Card className="p-4 border-emerald-300">
                      <h3 className="font-semibold mb-3">Histórico concluído (Channex)</h3>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {channexModifiedCompleted.map((item: any) => (
                          <div key={item.id} className="rounded-md border p-2">
                            <Badge variant="default" className="mb-2">Modificada sincronizada</Badge>
                            <p><strong>Reserva:</strong> {item.unique_id || item.booking_id}</p>
                          </div>
                        ))}
                        {channexCancelledCompleted.map((item: any) => (
                          <div key={item.id} className="rounded-md border p-2">
                            <Badge variant="default" className="mb-2">Cancelada sincronizada</Badge>
                            <p><strong>Reserva:</strong> {item.unique_id || item.booking_id}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  {overbookings.map((overbooking: any) => (
                    <Card key={overbooking.reservation.id} className="p-4">
                      {(() => {
                        const hasCategoryRooms = (overbooking.availableRooms?.length ?? 0) > 0;
                        const fallbackRooms = overbooking.alternativeRooms ?? [];
                        const roomsToDisplay = hasCategoryRooms ? overbooking.availableRooms : fallbackRooms;
                        return (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">
                                {overbooking.reservation.reservation_code}
                              </h3>
                              <Badge variant="destructive">Conflito</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Hóspede:{" "}
                              {reservationGuestDisplayName(overbooking.reservation)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Período: {formatDate(overbooking.reservation.checkin_date)} -{" "}
                              {formatDate(overbooking.reservation.checkout_date)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Quarto:{" "}
                              {overbooking.reservation.rooms?.name ||
                                overbooking.reservation.rooms?.room_number ||
                                "N/A"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Valor: {formatCurrency(overbooking.reservation.total_amount || 0)}
                            </p>
                          </div>
                        </div>

                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <div className="space-y-1">
                              <p>
                                <strong>Conflita com {overbooking.conflictingReservations.length} reserva(s):</strong>
                              </p>
                              <ul className="list-disc list-inside space-y-1">
                                {overbooking.conflictingReservations.map(
                                  (conflict: any) => (
                                    <li key={conflict.id}>
                                      {conflict.reservation_code} -{" "}
                                      {reservationGuestDisplayName(conflict, "N/A")}
                                      {" "}({formatDate(conflict.checkin_date)} -{" "}
                                      {formatDate(conflict.checkout_date)})
                                    </li>
                                  )
                                )}
                              </ul>
                              <p className="mt-2">
                                <strong>Datas em conflito:</strong>{" "}
                                {overbooking.conflictDates
                                  .map((date: string) =>
                                    format(parseISO(date), "dd/MM/yyyy", {
                                      locale: ptBR,
                                    })
                                  )
                                  .join(", ")}
                              </p>
                            </div>
                          </AlertDescription>
                        </Alert>

                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-2">
                              {hasCategoryRooms
                                ? `Quartos Disponíveis na Categoria (${roomsToDisplay.length}):`
                                : `Quartos Disponíveis em Outras Categorias (${roomsToDisplay.length}):`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {roomsToDisplay.length > 0 ? (
                                roomsToDisplay.map((room: any) => (
                                  <Badge 
                                    key={room.id} 
                                    variant="outline"
                                    className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors"
                                    onClick={() => {
                                      setSelectedReservationForRoomChange({
                                        reservation: overbooking.reservation,
                                        availableRooms: roomsToDisplay,
                                        preselectedRoomId: room.id,
                                      });
                                      setChangeRoomDialogOpen(true);
                                    }}
                                  >
                                    <Bed className="h-3 w-3 mr-1" />
                                    {room.name || room.room_number}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  Nenhum quarto disponível para o período (nem na categoria atual).
                                </span>
                              )}
                            </div>
                            {roomsToDisplay.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                💡 Clique em um quarto para trocar ou use os botões abaixo.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={() => handleChangeRoom(overbooking)}
                            disabled={roomsToDisplay.length === 0}
                            variant="default"
                          >
                            <Bed className="h-4 w-4 mr-2" />
                            {hasCategoryRooms ? "Trocar Quarto" : "Trocar Quarto/Categoria"}
                          </Button>
                          <Button
                            onClick={() => handleSplitOverbooking(overbooking)}
                            disabled={roomsToDisplay.length === 0}
                            variant="outline"
                          >
                            Dividir Reserva
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              handleViewReservation(
                                overbooking.reservation.reservation_code
                              )
                            }
                          >
                            Ver Detalhes
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => markPendingAsResolved(overbooking.reservation.id)}
                            disabled={isMarkingResolved}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Resolver
                          </Button>
                        </div>
                      </div>
                        );
                      })()}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para dividir reserva */}
      {selectedOverbooking && (
        <SplitReservationDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          overbooking={selectedOverbooking}
          onSuccess={() => {
            refetch();
            setSelectedOverbooking(null);
          }}
        />
      )}

      {/* Dialog para trocar quarto */}
      {selectedReservationForRoomChange && (
        <ChangeRoomDialog
          open={changeRoomDialogOpen}
          onOpenChange={setChangeRoomDialogOpen}
          reservation={selectedReservationForRoomChange.reservation}
          availableRooms={selectedReservationForRoomChange.availableRooms}
          preselectedRoomId={selectedReservationForRoomChange.preselectedRoomId}
          onSuccess={() => {
            refetch();
            setSelectedReservationForRoomChange(null);
          }}
        />
      )}

      {channexCancelTarget ? (
        <CancelReservationDialog
          open
          onOpenChange={(open) => {
            if (!open) setChannexCancelTarget(null);
          }}
          reservationId={channexCancelTarget.reservation.id}
          reservationCode={channexCancelTarget.reservation.reservation_code ?? undefined}
          paidAmount={Number(channexCancelTarget.reservation.paid_amount ?? 0)}
          hasPayments={Number(channexCancelTarget.reservation.paid_amount ?? 0) > 0}
          reservationData={
            channexCancelTarget.reservation.checkin_date
              ? {
                  checkin_date: channexCancelTarget.reservation.checkin_date,
                  checkout_date:
                    channexCancelTarget.reservation.checkout_date ||
                    channexCancelTarget.reservation.checkin_date,
                  total_amount: Number(channexCancelTarget.reservation.total_amount ?? 0),
                  pricing_plan_id: channexCancelTarget.reservation.pricing_plan_id ?? null,
                }
              : undefined
          }
          onConfirm={handleChannexCancelDialogConfirm}
        />
      ) : null}
    </div>
  );
};

export default PendingReservations;

