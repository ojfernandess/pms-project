import { describe, expect, it } from "vitest";
import { summarizeReservationTraceRing } from "./reservationOperationTrace";

describe("summarizeReservationTraceRing", () => {
  it("computes percentiles per operation", () => {
    const entries = [
      { operation: "createReservation.critical", ms: 100, at: "t1" },
      { operation: "createReservation.critical", ms: 200, at: "t2" },
      { operation: "createReservation.critical", ms: 300, at: "t3" },
      { operation: "createReservation.critical", ms: 400, at: "t4" },
      { operation: "cancelReservation.critical", ms: 50, at: "t5" },
    ];
    const summary = summarizeReservationTraceRing(entries);
    const create = summary.find((r) => r.operation === "createReservation.critical");
    const cancel = summary.find((r) => r.operation === "cancelReservation.critical");
    expect(create?.count).toBe(4);
    expect(create?.p50).toBe(200);
    expect(create?.p95).toBe(400);
    expect(create?.max).toBe(400);
    expect(cancel?.p50).toBe(50);
  });
});