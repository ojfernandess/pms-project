import { describe, expect, it } from "vitest";
import {
  calculateCancellationPenalty,
  type CancellationPolicy,
  type ReservationData,
} from "./cancellationPolicyCalculator";

const basePolicy: CancellationPolicy = {
  id: "pol-1",
  name: "Não reembolsável 100%",
  has_free_cancellation: false,
  free_cancellation_deadline: null,
  cancellation_fee_type: "percentage",
  cancellation_fee_percentage: 100,
  cancellation_fee_when: "em qualquer momento",
  cancellation_fee_after_deadline_type: null,
  cancellation_fee_after_deadline_percentage: null,
  no_show_fee_type: "same_as_cancellation",
  no_show_fee_percentage: null,
  requires_prepayment: false,
  prepayment_percentage: null,
  prepayment_when: "",
  policy_summary: null,
  prepayment_summary: null,
};

function reservation(overrides: Partial<ReservationData> = {}): ReservationData {
  return {
    id: "res-1",
    checkin_date: "2030-06-10",
    checkout_date: "2030-06-12",
    total_amount: 200,
    service_fees_total: 0,
    paid_amount: 0,
    pricing_plan_id: null,
    status: "confirmed",
    establishment_id: "est-1",
    created_at: "2030-05-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("calculateCancellationPenalty with service fees", () => {
  it("includes service fees in percentage base", () => {
    const result = calculateCancellationPenalty(
      basePolicy,
      reservation({ total_amount: 200, service_fees_total: 50 }),
      new Date("2030-06-01T12:00:00.000Z"),
    );
    expect(result.penalty).toBe(250);
    expect(result.calculationDetails.baseAmount).toBe(250);
  });

  it("includes fees when computing first night", () => {
    const policy: CancellationPolicy = {
      ...basePolicy,
      cancellation_fee_type: "first_night",
      cancellation_fee_percentage: null,
    };
    const result = calculateCancellationPenalty(
      policy,
      reservation({ total_amount: 200, service_fees_total: 40 }),
      new Date("2030-06-01T12:00:00.000Z"),
    );
    // 2 nights → (200+40)/2 = 120
    expect(result.penalty).toBe(120);
  });
});
