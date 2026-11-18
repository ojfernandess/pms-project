import { describe, expect, it } from "vitest";
import {
  receivableCategoryLabel,
  resolveReceivableDebtorLabel,
  RECEIVABLE_CATEGORIES,
} from "./receivableCategories";

describe("receivableCategories", () => {
  it("expõe categorias de recebimento", () => {
    expect(RECEIVABLE_CATEGORIES.map((c) => c.id)).toContain("corporate");
  });

  it("receivableCategoryLabel", () => {
    expect(receivableCategoryLabel("corporate")).toBe("Faturamento corporativo");
    expect(receivableCategoryLabel(null)).toBe("—");
  });

  it("resolveReceivableDebtorLabel", () => {
    expect(resolveReceivableDebtorLabel({ debtor_name: "ACME Ltda" })).toBe("ACME Ltda");
    expect(
      resolveReceivableDebtorLabel({ description: "Reserva 123 - João Silva" }),
    ).toBe("João Silva");
  });
});