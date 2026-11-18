import { useQuery } from "@tanstack/react-query";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { getFinancialCashFlowReport } from "@/services/financial/cashFlowService";

export function useFinancialCashFlow(period: { startDate: string; endDate: string }) {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  return useQuery({
    queryKey: ["financial_cash_flow_report", establishmentId, period.startDate, period.endDate],
    queryFn: async () => {
      if (!establishmentId) return null;
      const result = await getFinancialCashFlowReport(establishmentId, period.startDate, period.endDate);
      if (!result.success) throw new Error(result.error || "Erro ao carregar fluxo de caixa");
      return result.data;
    },
    enabled: !!establishmentId && !!period.startDate && !!period.endDate,
  });
}