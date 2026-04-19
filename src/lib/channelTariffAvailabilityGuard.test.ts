import { describe, it, expect } from "vitest";
import {
  buildTariffCategoryDateKeySet,
  eachDateInRangeInclusive,
} from "./channelTariffAvailabilityGuard";

describe("channelTariffAvailabilityGuard", () => {
  it("buildTariffCategoryDateKeySet agrega categoria|data", () => {
    const s = buildTariffCategoryDateKeySet([
      { category_id: "a", date: "2026-01-01" },
      { category_id: "a", date: "2026-01-02" },
    ]);
    expect(s.has("a|2026-01-01")).toBe(true);
    expect(s.has("a|2026-01-03")).toBe(false);
  });

  it("eachDateInRangeInclusive cobre início e fim", () => {
    const d = eachDateInRangeInclusive("2026-01-01", "2026-01-03");
    expect(d).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});
