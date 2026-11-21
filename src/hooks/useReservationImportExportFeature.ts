import { useMemo } from "react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

export function useReservationImportExportFeature() {
  const { settings } = useSiteSettings();
  const { selectedEstablishment } = useEstablishment();

  const enabled = useMemo(() => {
    return isFeatureEnabledForEstablishment(
      (settings?.features_enabled as Record<string, unknown> | undefined)?.reservation_import_export,
      selectedEstablishment?.id,
    );
  }, [settings?.features_enabled, selectedEstablishment?.id]);

  return { enabled, establishmentId: selectedEstablishment?.id || null };
}
