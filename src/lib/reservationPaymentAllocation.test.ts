import { describe, expect, it } from "vitest";
import { allocateReservationPayments } from "@/lib/reservationPaymentAllocation";

describe("allocateReservationPayments", () => {
  it("aplica pagamento [COMPONENT:all] à taxa de estacionamento após o valor base", () => {
    const serviceFees = [
      { id: "fee-parking", amount: 30, quantity: 2, created_at: "2025-01-01T10:00:00Z" },
    ];
    const payments = [
      {
        amount: 160,
        notes: "[COMPONENT:all] | Itens quitados: Valor base (R$ 100,00); Estacionamento (R$ 60,00)",
        created_at: "2025-01-02T12:00:00Z",
      },
    ];

    const { feesPaid } = allocateReservationPayments({
      payments,
      serviceFees,
      originalBaseAmount: 100,
      extensionAmount: 0,
      wasCreatedWithoutPayment: true,
      extensionAddedAt: null,
    });

    expect(feesPaid["fee-parking"]).toBeCloseTo(60, 2);
  });

  it("honra pagamento direto [COMPONENT:fee-*]", () => {
    const serviceFees = [{ id: "fee-parking", amount: 25, quantity: 1, created_at: "2025-01-01T10:00:00Z" }];
    const payments = [
      {
        amount: 25,
        notes: "[COMPONENT:fee-fee-parking]",
        created_at: "2025-01-02T12:00:00Z",
      },
    ];

    const { feesPaid } = allocateReservationPayments({
      payments,
      serviceFees,
      originalBaseAmount: 200,
      extensionAmount: 0,
      wasCreatedWithoutPayment: true,
      extensionAddedAt: null,
    });

    expect(feesPaid["fee-parking"]).toBe(25);
  });

  it("pagamento Stripe legado [COMPONENT:base] não quita taxas (regressão)", () => {
    const serviceFees = [
      { id: "fee-clean", amount: 50, quantity: 1, created_at: "2025-01-01T08:00:00Z" },
      { id: "fee-parking", amount: 30, quantity: 2, created_at: "2025-01-01T08:01:00Z" },
    ];
    const payments = [
      {
        amount: 200,
        notes: "[STRIPE] Payment Intent: pi_x\n[COMPONENT:base]",
        created_at: "2025-01-02T12:00:00Z",
      },
    ];
    const { feesPaid } = allocateReservationPayments({
      payments,
      serviceFees,
      originalBaseAmount: 100,
      extensionAmount: 0,
      wasCreatedWithoutPayment: true,
      extensionAddedAt: null,
    });
    expect(feesPaid["fee-clean"] ?? 0).toBe(0);
    expect(feesPaid["fee-parking"] ?? 0).toBe(0);
  });
});