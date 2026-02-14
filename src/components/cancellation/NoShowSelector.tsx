/**
 * Componente para selecionar e processar no-shows manualmente
 * Lista reservas que passaram do horário de check-in sem check-in
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Calendar, User, Phone, Mail } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/reservationUtils";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { detectAndApplyNoShow } from "@/utils/cancellationPolicyService";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface NoShowCandidate {
  id: string;
  reservation_code: string;
  checkin_date: string;
  checkout_date: string;
  total_amount: number;
  paid_amount: number;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  status: string;
  hours_past_checkin: number;
}

export const NoShowSelector = () => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  // Buscar reservas candidatas a no-show
  const { data: candidates = [], isLoading, refetch } = useQuery({
    queryKey: ["no_show_candidates", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return [];

      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split("T")[0];

      // Buscar reservas confirmadas com check-in no passado
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          total_amount,
          paid_amount,
          status,
          guest:clients!guest_id(
            full_name,
            phone,
            email
          )
        `)
        .eq("establishment_id", establishmentId)
        .eq("status", "confirmed")
        .lte("checkin_date", currentDate)
        .is("cancelled_at", null)
        .is("no_show_at", null)
        .order("checkin_date", { ascending: false });

      if (error) throw error;

      // Filtrar reservas que passaram do horário de check-in (18:00)
      const candidates: NoShowCandidate[] = [];

      for (const reservation of reservations || []) {
        const checkinDate = new Date(reservation.checkin_date);
        const checkinDeadline = new Date(checkinDate);
        checkinDeadline.setHours(18, 0, 0, 0); // 18:00 do dia do check-in

        // Se passou do deadline de hoje ou é de um dia anterior
        if (now > checkinDeadline) {
          const hoursPast = Math.floor((now.getTime() - checkinDeadline.getTime()) / (1000 * 60 * 60));

          candidates.push({
            id: reservation.id,
            reservation_code: reservation.reservation_code || "",
            checkin_date: reservation.checkin_date,
            checkout_date: reservation.checkout_date,
            total_amount: reservation.total_amount || 0,
            paid_amount: reservation.paid_amount || 0,
            guest_name: (reservation.guest as any)?.full_name || "N/A",
            guest_phone: (reservation.guest as any)?.phone,
            guest_email: (reservation.guest as any)?.email,
            status: reservation.status,
            hours_past_checkin: hoursPast,
          });
        }
      }

      return candidates;
    },
    refetchInterval: 60000, // Refetch a cada minuto
  });

  const toggleSelection = (reservationId: string) => {
    setSelectedReservations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(reservationId)) {
        newSet.delete(reservationId);
      } else {
        newSet.add(reservationId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedReservations(new Set(candidates.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedReservations(new Set());
  };

  const handleProcessSelected = async () => {
    if (selectedReservations.size === 0) {
      toast.error("Selecione pelo menos uma reserva para processar");
      return;
    }

    setProcessing(true);
    let processedCount = 0;
    let errorCount = 0;

    try {
      for (const reservationId of selectedReservations) {
        try {
          const result = await detectAndApplyNoShow(reservationId);
          if (result.success) {
            processedCount++;
          } else {
            errorCount++;
            console.error(`Erro ao processar reserva ${reservationId}:`, result.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`Erro ao processar reserva ${reservationId}:`, error);
        }
      }

      if (processedCount > 0) {
        toast.success(`${processedCount} no-show(s) processado(s) com sucesso`);
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
        queryClient.invalidateQueries({ queryKey: ["no_show_candidates"] });
        setSelectedReservations(new Set());
        refetch();
      }

      if (errorCount > 0) {
        toast.warning(`${errorCount} reserva(s) não puderam ser processadas`);
      }
    } catch (error) {
      console.error("Erro ao processar no-shows:", error);
      toast.error("Erro ao processar no-shows selecionados");
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Carregando reservas candidatas a no-show...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Reservas Candidatas a No-Show</h3>
          <p className="text-sm text-muted-foreground">
            Reservas confirmadas que passaram do horário de check-in (18:00) sem check-in realizado
          </p>
        </div>
        <div className="flex gap-2">
          {candidates.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={selectAll}>
                Selecionar Todas
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Desmarcar Todas
              </Button>
            </>
          )}
          <Button
            onClick={handleProcessSelected}
            disabled={selectedReservations.size === 0 || processing}
            size="sm"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                Processar Selecionadas ({selectedReservations.size})
              </>
            )}
          </Button>
        </div>
      </div>

      {candidates.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhuma reserva candidata a no-show encontrada.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            O sistema verifica automaticamente reservas confirmadas que passaram do horário de check-in (18:00).
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedReservations.size === candidates.length && candidates.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAll();
                      } else {
                        deselectAll();
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Hóspede</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tempo Após Check-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedReservations.has(candidate.id)}
                      onCheckedChange={() => toggleSelection(candidate.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {candidate.reservation_code}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{candidate.guest_name}</span>
                      </div>
                      {candidate.guest_phone && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {candidate.guest_phone}
                        </div>
                      )}
                      {candidate.guest_email && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {candidate.guest_email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span>{formatDate(candidate.checkin_date)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span>{formatDate(candidate.checkout_date)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(candidate.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{candidate.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={candidate.hours_past_checkin > 24 ? "destructive" : "default"}>
                      {candidate.hours_past_checkin}h após 18:00
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {candidates.length > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                Informações sobre No-Show
              </p>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>Selecione uma ou múltiplas reservas para aplicar no-show</li>
                <li>O sistema calculará a multa baseada na política de cancelamento</li>
                <li>Uma fatura será criada automaticamente para cada multa</li>
                <li>Um log de auditoria será registrado para cada processamento</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

