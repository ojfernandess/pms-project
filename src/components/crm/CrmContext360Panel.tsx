import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCrmContact360 } from "@/lib/crm/crmApi";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { ExternalLink, Loader2, UserRound } from "lucide-react";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  contactId: string | null;
  reservationId?: string | null;
  emptyHint?: string;
};

export function CrmContext360Panel({ contactId, reservationId, emptyHint }: Props) {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-central-360", contactId],
    queryFn: () => getCrmContact360(contactId!),
    enabled: !!contactId,
  });

  if (!contactId) {
    return (
      <Card className="p-4 h-full min-h-[320px] flex flex-col justify-center text-center space-y-2">
        <UserRound className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Contexto 360</p>
        <p className="text-xs text-muted-foreground">
          {emptyHint ||
            "Selecione uma reserva em Mensagens & Cobranças para ver o contato CRM ao lado — sem inbox paralelo."}
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">Contexto 360</p>
        <p className="text-xs text-muted-foreground">
          Contato CRM não encontrado para esta reserva. O envio continua pelo canal já configurado.
        </p>
      </Card>
    );
  }

  const { contact, indicators, reservations } = data;
  const focused =
    reservationId &&
    reservations.find((r) => String(r.id) === String(reservationId));

  return (
    <Card className="p-4 space-y-4 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Contexto 360</p>
            <h2 className="text-lg font-semibold leading-tight">{contact.full_name}</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2">
            <Link to={`${base}/crm/contatos/${contact.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {[contact.email, contact.phone].filter(Boolean).join(" · ") || "Sem contato"}
        </p>
        {contact.source && <Badge variant="secondary">{contact.source}</Badge>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">LTV</p>
          <p className="text-xs font-semibold">{money(indicators.ltv)}</p>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Estadias</p>
          <p className="text-xs font-semibold">{indicators.stayCount}</p>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Ticket</p>
          <p className="text-xs font-semibold">{money(indicators.averageTicket)}</p>
        </div>
      </div>

      {focused && (
        <div className="rounded-md border p-3 space-y-1 text-xs">
          <p className="font-medium">Reserva em foco</p>
          <p className="font-mono">{String(focused.reservation_code || focused.id)}</p>
          <p className="text-muted-foreground">
            {String(focused.checkin_date || "—")} → {String(focused.checkout_date || "—")}
          </p>
          <p>{String(focused.status || "—")} · {money(Number(focused.total_amount || 0))}</p>
          {focused.reservation_code && (
            <Button asChild variant="link" className="h-auto p-0 text-xs">
              <Link to={`${base}/reservas/${focused.reservation_code}`}>Abrir no PMS</Link>
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Últimas hospedagens</p>
        <ul className="space-y-1.5">
          {reservations.slice(0, 5).map((r) => (
            <li key={String(r.id)} className="text-xs flex justify-between gap-2 border-b border-border/40 pb-1">
              <span className="font-mono truncate">{String(r.reservation_code || r.id)}</span>
              <span className="text-muted-foreground shrink-0">{String(r.status || "")}</span>
            </li>
          ))}
          {!reservations.length && (
            <li className="text-xs text-muted-foreground">Sem reservas vinculadas</li>
          )}
        </ul>
      </div>
    </Card>
  );
}
