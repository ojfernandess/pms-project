import { describe, expect, it } from "vitest";
import { expenseCategoryLabel, EXPENSE_CATEGORIES, RECURRENCE_PATTERNS } from "./expenseCategories";

describe("expenseCategories", () => {
  it("lista categorias fixas", () => {
    expect(EXPENSE_CATEGORIES.length).toBeGreaterThan(10);
    expect(RECURRENCE_PATTERNS.map((p) => p.id)).toContain("monthly");
  });

  it("expenseCategoryLabel resolve id conhecido", () => {
    expect(expenseCategoryLabel("electricity")).toBe("Energia elétrica");
    expect(expenseCategoryLabel("unknown")).toBe("unknown");
    expect(expenseCategoryLabel(null)).toBe("—");
  });
});