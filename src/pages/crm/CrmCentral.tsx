import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { CrmContext360Panel } from "@/components/crm/CrmContext360Panel";
import CheckinChargeSettings from "@/pages/CheckinChargeSettings";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import {
  resolveCrmContactIdFromReservation,
  type CentralFocusReservation,
} from "@/lib/crm/crmCentral";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const CrmCentral = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const { settings } = useSiteSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const contactIdParam = searchParams.get("contactId");
  const reservationIdParam = searchParams.get("reservationId");

  const [focusedReservation, setFocusedReservation] = useState<CentralFocusReservation | null>(
    reservationIdParam ? { id: reservationIdParam } : null,
  );
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(contactIdParam);

  const messagingEnabled = isFeatureEnabledForEstablishment(
    (settings?.features_enabled as Record<string, unknown>)?.checkin_charge_enabled,
    selectedEstablishment?.company_id,
    true,
  );

  useEffect(() => {
    setResolvedContactId(contactIdParam);
  }, [contactIdParam]);

  useEffect(() => {
    if (reservationIdParam) {
      setFocusedReservation((prev) =>
        prev?.id === reservationIdParam ? prev : { id: reservationIdParam },
      );
    }
  }, [reservationIdParam]);

  const companyId = selectedEstablishment?.company_id;

  useQuery({
    queryKey: [
      "crm-central-resolve-contact",
      companyId,
      focusedReservation?.id,
      focusedReservation?.client_id,
      focusedReservation?.guest_id,
      contactIdParam,
    ],
    queryFn: async () => {
      if (contactIdParam) return contactIdParam;
      if (!companyId || !focusedReservation) return null;
      const id = await resolveCrmContactIdFromReservation(companyId, focusedReservation);
      setResolvedContactId(id);
      return id;
    },
    enabled: !!companyId && (!!focusedReservation || !!contactIdParam),
  });

  const handleFocusReservation = (row: CentralFocusReservation) => {
    setFocusedReservation(row);
    const next = new URLSearchParams(searchParams);
    next.set("reservationId", row.id);
    next.delete("contactId");
    setSearchParams(next, { replace: true });
  };

  return (
    <CrmFeatureGate>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Central CRM</h1>
            <p className="text-muted-foreground text-sm">
              Mensagens & Cobranças existentes + contexto 360 do contato. Sem segundo WhatsApp.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/crm/contatos`}>Contatos</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/cobranca-checkin`}>
                Tela completa
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {messagingEnabled ? (
              <div className="rounded-lg border bg-background overflow-hidden">
                <CheckinChargeSettings
                  embedded
                  focusedReservationId={focusedReservation?.id || reservationIdParam}
                  onFocusReservation={handleFocusReservation}
                />
              </div>
            ) : (
              <Card className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">Mensagens & Cobranças indisponível</h2>
                <p className="text-sm text-muted-foreground">
                  Ative a flag da empresa no Super Admin para usar o canal já existente (WhatsApp /
                  Chatwoot / Evolution). A Central CRM não cria inbox paralelo.
                </p>
              </Card>
            )}
          </div>

          <aside className="min-w-0">
            <CrmContext360Panel
              contactId={resolvedContactId || contactIdParam}
              reservationId={focusedReservation?.id || reservationIdParam}
            />
          </aside>
        </div>
      </div>
    </CrmFeatureGate>
  );
};

export default CrmCentral;
