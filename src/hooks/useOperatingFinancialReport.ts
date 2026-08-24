import { useQuery } from "@tanstack/react-query";
import {
  fetchDailyResult,
  fetchOperatingReport,
  type DailyResultLineConfig,
  type OperatingFilters,
} from "@/services/financial/operatingReportService";

export function useOperatingFinancialReport(filters: OperatingFilters | null) {
  return useQuery({
    queryKey: ["financial_operating_report", filters],
    enabled: !!filters,
    queryFn: () => fetchOperatingReport(filters!),
    staleTime: 30_000,
  });
}

export function useFinancialDailyResult(
  day: string | null,
  lines: DailyResultLineConfig[] | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["financial_daily_result", day, lines],
    enabled: enabled && !!day && !!lines,
    queryFn: () => fetchDailyResult({ day: day!, lines: lines! }),
    staleTime: 30_000,
  });
}
