import { useQuery } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { fetchParkingFeeConfig } from "@/lib/parkingFeeConfig";

export function useParkingFeeConfig(buildingId?: string | null) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id;

  return useQuery({
    queryKey: ["parking_fee_config", establishmentId, buildingId ?? null],
    queryFn: async () => {
      if (!establishmentId) return null;
      return fetchParkingFeeConfig({ establishmentId, buildingId: buildingId ?? null });
    },
    enabled: Boolean(establishmentId),
  });
}