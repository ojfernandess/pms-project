import { useQuery } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { fetchParkingFeeConfig } from "@/lib/parkingFeeConfig";

export function useParkingFeeConfig(
  buildingId?: string | null,
  options?: { strictBuildingScope?: boolean },
) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id;
  const strictBuildingScope = Boolean(options?.strictBuildingScope);

  return useQuery({
    queryKey: ["parking_fee_config", establishmentId, buildingId ?? null, strictBuildingScope],
    queryFn: async () => {
      if (!establishmentId) return null;
      return fetchParkingFeeConfig({
        establishmentId,
        buildingId: buildingId ?? null,
        strictBuildingScope,
      });
    },
    enabled: Boolean(establishmentId),
  });
}