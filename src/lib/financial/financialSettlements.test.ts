import { describe, expect, it } from "vitest";
import { buildSettlementIdempotencyKey } from "@/services/financial/financialSettlementsService";

describe("buildSettlementIdempotencyKey", () => {
  it("gera chave estável para o mesmo lançamento", () => {
    const a = buildSettlementIdempotencyKey({
      scope: "ar",
      entityId: "11111111-1111-1111-1111-111111111111",
      amount: 100.5,
      effectiveDate: "2025-12-01",
      clientToken: "submit-1",
    });
    const b = buildSettlementIdempotencyKey({
      scope: "ar",
      entityId: "11111111-1111-1111-1111-111111111111",
      amount: 100.5,
      effectiveDate: "2025-12-01",
      clientToken: "submit-1",
    });
    expect(a).toBe(b);
  });

  it("muda chave quando valor ou data mudam", () => {
    const base = buildSettlementIdempotencyKey({
      scope: "ar",
      entityId: "11111111-1111-1111-1111-111111111111",
      amount: 50,
      effectiveDate: "2025-12-01",
    });
    const other = buildSettlementIdempotencyKey({
      scope: "ar",
      entityId: "11111111-1111-1111-1111-111111111111",
      amount: 50.01,
      effectiveDate: "2025-12-01",
    });
    expect(base).not.toBe(other);
  });
});