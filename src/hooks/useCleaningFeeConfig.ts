import { useQuery } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { fetchCleaningFeeConfig } from "@/lib/cleaningFeeConfig";

export function useCleaningFeeConfig(
  buildingId?: string | null,
  options?: { strictBuildingScope?: boolean },
) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id;
  const strictBuildingScope = Boolean(options?.strictBuildingScope);

  return useQuery({
    queryKey: ["cleaning_fee_config", establishmentId, buildingId ?? null, strictBuildingScope],
    queryFn: async () => {
      if (!establishmentId) return null;
      return fetchCleaningFeeConfig({
        establishmentId,
        buildingId: buildingId ?? null,
        strictBuildingScope,
      });
    },
    enabled: !!establishmentId,
  });
}