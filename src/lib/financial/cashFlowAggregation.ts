import { roundMoney } from "@/lib/financial/financialTitleStatus";

export type CashFlowDailyPoint = {
  day: string;
  inflows: number;
  outflows: number;
};

export type CashFlowReportPayload = {
  realized_inflows: number;
  realized_outflows: number;
  realized_net: number;
  projected_receivables: number;
  projected_payables: number;
  projected_net: number;
  as_of: string;
  daily: CashFlowDailyPoint[];
};

export function parseCashFlowReport(raw: unknown): CashFlowReportPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const daily = Array.isArray(r.daily)
    ? (r.daily as Record<string, unknown>[]).map((row) => ({
        day: String(row.day ?? ""),
        inflows: Number(row.inflows ?? 0),
        outflows: Number(row.outflows ?? 0),
      }))
    : [];

  return {
    realized_inflows: Number(r.realized_inflows ?? 0),
    realized_outflows: Number(r.realized_outflows ?? 0),
    realized_net: Number(r.realized_net ?? 0),
    projected_receivables: Number(r.projected_receivables ?? 0),
    projected_payables: Number(r.projected_payables ?? 0),
    projected_net: Number(r.projected_net ?? 0),
    as_of: String(r.as_of ?? ""),
    daily,
  };
}

export function cumulativeNetBalanceSeries(points: CashFlowDailyPoint[]): Array<CashFlowDailyPoint & { balance: number }> {
  let balance = 0;
  return points.map((p) => {
    balance = roundMoney(balance + p.inflows - p.outflows);
    return { ...p, balance };
  });
}