import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { Car, ExternalLink, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/reservationUtils";
import { getLodgingParkingFeeBalance } from "@/lib/parkingPaymentSync";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Props = {
  parkingReservationId: string;
  lodgingReservationId: string;
};

export function ParkingLinkedBillingCard({ parkingReservationId, lodgingReservationId }: Props) {
  const { establishmentId: establishmentIdFromParams } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const establishmentRouteId =
    establishmentIdFromParams ||
    selectedEstablishment?.numeric_id?.toString() ||
    getSelectedEstablishmentId() ||
    "";

  const { data, isLoading } = useQuery({
    queryKey: ["parking_linked_billing", lodgingReservationId, parkingReservationId],
    queryFn: async () => {
      const [{ data: lodging, error: lodgeErr }, balance] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, reservation_code, guest_name, checkin_date, checkout_date")
          .eq("id", lodgingReservationId)
          .single(),
        getLodgingParkingFeeBalance(lodgingReservationId),
      ]);
      if (lodgeErr) throw lodgeErr;
      return { lodging, balance };
    },
    enabled: !!lodgingReservationId,
  });

  if (isLoading) {
    return (
      <Card className="p-4 border-blue-100 bg-blue-50/40">
        <p className="text-sm text-muted-foreground">Carregando cobrança do estacionamento…</p>
      </Card>
    );
  }

  const lodging = data?.lodging;
  const balance = data?.balance;

  const payBadge = !balance ? (
    <Badge variant="outline">Sem taxa na hospedagem</Badge>
  ) : balance.isFullyPaid ? (
    <Badge className="bg-green-600">Taxa paga na hospedagem</Badge>
  ) : balance.isPartiallyPaid ? (
    <Badge className="bg-amber-500">Pagamento parcial</Badge>
  ) : (
    <Badge variant="destructive">Taxa pendente na hospedagem</Badge>
  );

  return (
    <Card className="p-4 border-blue-200/70 bg-gradient-to-br from-slate-50 to-blue-50/50">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Car className="h-5 w-5 text-blue-700" />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">Estacionamento — cobrança na hospedagem</h3>
            {payBadge}
          </div>
          <p className="text-xs text-muted-foreground">
            O valor da vaga não é duplicado aqui; a taxa é lançada e paga na reserva de hospedagem vinculada.
          </p>

          {lodging ? (
            <div className="text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Hospedagem vinculada:</span>{" "}
                {establishmentRouteId && lodging.reservation_code ? (
                  <Link
                    to={`/${establishmentRouteId}/reservas/${lodging.reservation_code}`}
                    className="font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                  >
                    {lodging.reservation_code}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="font-mono font-medium">{lodging.reservation_code}</span>
                )}
                {lodging.guest_name ? <span className="text-muted-foreground"> · {lodging.guest_name}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Período hospedagem:{" "}
                {format(parseISO(String(lodging.checkin_date).split("T")[0]), "dd/MM/yyyy", { locale: ptBR })} →{" "}
                {format(parseISO(String(lodging.checkout_date).split("T")[0]), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          ) : null}

          {balance ? (
            <div className="flex flex-wrap gap-4 text-sm pt-1 border-t border-blue-100/80 mt-2 pt-2">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatCurrency(balance.feeAmount)} × {balance.feeQuantity} ={" "}
                  <strong>{formatCurrency(balance.feeTotal)}</strong>
                </span>
              </div>
              <div>
                Pago na hospedagem: <strong className="text-green-700">{formatCurrency(balance.paid)}</strong>
              </div>
              {balance.pending > 0.02 ? (
                <div>
                  Pendente: <strong className="text-amber-700">{formatCurrency(balance.pending)}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Esta reserva (vaga) ID interno: <span className="font-mono">{parkingReservationId.slice(0, 8)}…</span>
          </p>
        </div>
      </div>
    </Card>
  );
}