import { useState } from "react";
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
} from "lucide-react";
import { usePendingReservations } from "@/hooks/usePendingReservations";
import { SplitReservationDialog } from "@/components/reservations/SplitReservationDialog";
import { ChangeRoomDialog } from "@/components/reservations/ChangeRoomDialog";
import { formatCurrency, formatDate } from "@/lib/reservationUtils";
import { reservationGuestDisplayName } from "@/lib/reservationGuestDisplay";
import { formatReservationChannelOrigin } from "@/lib/reservationChannelDisplay";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PendingReservations = () => {
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { newOTAReservations, newCounterReservations, noCheckIn, overbookings, isLoading, refetch, markPendingAsResolved, isMarkingResolved } =
    usePendingReservations();
  const [selectedOverbooking, setSelectedOverbooking] = useState<any | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [changeRoomDialogOpen, setChangeRoomDialogOpen] = useState(false);
  const [selectedReservationForRoomChange, setSelectedReservationForRoomChange] = useState<any | null>(null);

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
    setSelectedReservationForRoomChange({
      reservation: overbooking.reservation,
      availableRooms: overbooking.availableRooms,
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
            Reservas OTA
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
            Overbookings
            {overbookings.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {overbookings.length}
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
                <h2 className="text-xl font-semibold">Novas Reservas OTA/Channel Manager (Últimos 7 dias)</h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : newOTAReservations.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há novas reservas de OTA nos últimos 7 dias.
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
                            className="max-w-[min(100%,280px)] whitespace-normal text-left font-normal"
                            title={formatReservationChannelOrigin(reservation)}
                          >
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
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : overbookings.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Não há overbookings no momento.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {overbookings.map((overbooking: any) => (
                    <Card key={overbooking.reservation.id} className="p-4">
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
                              Quartos Disponíveis na Categoria ({overbooking.availableRooms.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {overbooking.availableRooms.length > 0 ? (
                                overbooking.availableRooms.map((room: any) => (
                                  <Badge 
                                    key={room.id} 
                                    variant="outline"
                                    className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors"
                                    onClick={() => {
                                      setSelectedReservationForRoomChange({
                                        reservation: overbooking.reservation,
                                        availableRooms: overbooking.availableRooms,
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
                                  Nenhum quarto disponível na categoria atual
                                </span>
                              )}
                            </div>
                            {overbooking.availableRooms.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                💡 Clique em um quarto para trocar ou use os botões abaixo para dividir a reserva
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={() => handleChangeRoom(overbooking)}
                            disabled={overbooking.availableRooms.length === 0}
                            variant="default"
                          >
                            <Bed className="h-4 w-4 mr-2" />
                            Trocar Quarto
                          </Button>
                          <Button
                            onClick={() => handleSplitOverbooking(overbooking)}
                            disabled={overbooking.availableRooms.length === 0}
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
    </div>
  );
};

export default PendingReservations;

