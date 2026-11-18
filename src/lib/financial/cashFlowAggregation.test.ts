import { describe, expect, it } from "vitest";
import { cumulativeNetBalanceSeries, parseCashFlowReport } from "./cashFlowAggregation";

describe("cashFlowAggregation", () => {
  it("parseCashFlowReport", () => {
    const parsed = parseCashFlowReport({
      realized_inflows: 100,
      realized_outflows: 40,
      realized_net: 60,
      projected_receivables: 200,
      projected_payables: 50,
      projected_net: 150,
      as_of: "2026-01-01",
      daily: [{ day: "2026-01-01", inflows: 100, outflows: 0 }],
    });
    expect(parsed?.realized_net).toBe(60);
    expect(parsed?.daily).toHaveLength(1);
  });

  it("cumulativeNetBalanceSeries", () => {
    const series = cumulativeNetBalanceSeries([
      { day: "2026-01-01", inflows: 100, outflows: 30 },
      { day: "2026-01-02", inflows: 0, outflows: 20 },
    ]);
    expect(series[0].balance).toBe(70);
    expect(series[1].balance).toBe(50);
  });
});