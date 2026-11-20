import {
  buildCommercialSummary,
  buildLeadsBySourceCsv,
} from "./crm-reports.logic";

describe("crm-reports.logic", () => {
  const deals = [
    {
      id: "1",
      status: "open",
      source: "motor",
      amount: 100,
      reservation_id: null,
      converted_at: null,
      created_at: "2026-01-10T00:00:00Z",
      lost_reason: null,
    },
    {
      id: "2",
      status: "won",
      source: "motor",
      amount: 200,
      reservation_id: "r1",
      converted_at: "2026-01-12T00:00:00Z",
      created_at: "2026-01-11T00:00:00Z",
      lost_reason: null,
    },
    {
      id: "3",
      status: "lost",
      source: "quote_staff",
      amount: 50,
      reservation_id: null,
      converted_at: null,
      created_at: "2026-01-15T00:00:00Z",
      lost_reason: "preco",
    },
  ];

  const contacts = [
    {
      id: "c1",
      source: "motor",
      classification: "vip",
      created_at: "2026-01-01T00:00:00Z",
      tags: ["vip"],
    },
    {
      id: "c2",
      source: "manual",
      classification: null,
      created_at: "2026-02-01T00:00:00Z",
    },
  ];

  it("builds commercial summary with conversion", () => {
    const summary = buildCommercialSummary(deals, contacts);
    expect(summary.leadsTotal).toBe(3);
    expect(summary.opportunitiesOpen).toBe(1);
    expect(summary.opportunitiesWon).toBe(1);
    expect(summary.opportunitiesLost).toBe(1);
    expect(summary.conversionRate).toBeCloseTo(33.3, 0);
    expect(summary.wonAmount).toBe(200);
    expect(summary.vipContacts).toBe(1);
    expect(summary.bySource.motor).toBe(2);
  });

  it("exports leads by source csv", () => {
    const csv = buildLeadsBySourceCsv(deals);
    expect(csv).toContain("source,total,won,lost,won_amount");
    expect(csv).toContain("motor,2,1,0,200.00");
  });
});
