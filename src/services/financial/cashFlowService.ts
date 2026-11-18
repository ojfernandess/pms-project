import { supabase } from "@/integrations/supabase/client";
import { parseCashFlowReport, type CashFlowReportPayload } from "@/lib/financial/cashFlowAggregation";

export async function getFinancialCashFlowReport(
  establishmentId: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; data?: CashFlowReportPayload; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("get_financial_cash_flow_report", {
      p_establishment_id: establishmentId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw error;
    const parsed = parseCashFlowReport(data);
    if (!parsed) throw new Error("Resposta inválida do fluxo de caixa");
    return { success: true, data: parsed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function backfillSettlementCashFlow(
  establishmentId?: string,
): Promise<{ success: boolean; posted?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("backfill_settlement_cash_flow", {
      p_establishment_id: establishmentId ?? null,
    });
    if (error) throw error;
    return { success: true, posted: Number(data || 0) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}