import { ReactNode } from "react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { Card } from "@/components/ui/card";

export function CrmFeatureGate({ children }: { children: ReactNode }) {
  const { selectedEstablishment } = useEstablishment();
  const { settings } = useSiteSettings();
  const enabled = isFeatureEnabledForEstablishment(
    (settings?.features_enabled as Record<string, unknown>)?.crm,
    selectedEstablishment?.company_id,
    true,
  );

  if (!selectedEstablishment?.company_id || !enabled) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold mb-2">CRM indisponível</h1>
        <p className="text-muted-foreground text-sm">
          A funcionalidade CRM não está habilitada para esta empresa. Peça ao Super Admin para
          ativar em Controle de Funcionalidades.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
