import { describe, expect, it } from "vitest";
import { computePaymentDerivedStatusUpdates } from "@/lib/reservationPaymentStatusReconcile";

describe("computePaymentDerivedStatusUpdates", () => {
  it("marca unpaid quando não há pagamento", () => {
    const updates = computePaymentDerivedStatusUpdates([
      {
        id: "r1",
        status: "confirmed",
        paid_amount: 0,
        total_amount: 100,
        reservation_service_fees: [],
      },
    ]);
    expect(updates).toEqual([{ id: "r1", status: "unpaid" }]);
  });

  it("marca pending quando base paga mas taxa pendente", () => {
    const updates = computePaymentDerivedStatusUpdates([
      {
        id: "r2",
        status: "confirmed",
        paid_amount: 100,
        total_amount: 100,
        reservation_service_fees: [{ amount: 50, quantity: 1 }],
      },
    ]);
    expect(updates).toEqual([{ id: "r2", status: "pending" }]);
  });
});