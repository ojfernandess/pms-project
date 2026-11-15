import { useQuery } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { fetchCleaningFeeConfig } from "@/lib/cleaningFeeConfig";

export function useCleaningFeeConfig(buildingId?: string | null) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id;

  return useQuery({
    queryKey: ["cleaning_fee_config", establishmentId, buildingId ?? null],
    queryFn: async () => {
      if (!establishmentId) return null;
      return fetchCleaningFeeConfig({ establishmentId, buildingId: buildingId ?? null });
    },
    enabled: !!establishmentId,
  });
}