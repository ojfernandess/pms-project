import {
  computeEarnPoints,
  parseTiers,
  resolveTierKey,
  DEFAULT_LOYALTY_TIERS,
} from "./crm-loyalty.logic";

describe("crm-loyalty.logic", () => {
  it("computes earn points from amount", () => {
    expect(computeEarnPoints(100, 1)).toBe(100);
    expect(computeEarnPoints(99.9, 1)).toBe(99.9);
    expect(computeEarnPoints(50, 2)).toBe(100);
    expect(computeEarnPoints(-10, 1)).toBe(0);
  });

  it("resolves tier from lifetime points", () => {
    const tiers = parseTiers(DEFAULT_LOYALTY_TIERS);
    expect(resolveTierKey(0, tiers)).toBe("bronze");
    expect(resolveTierKey(500, tiers)).toBe("silver");
    expect(resolveTierKey(1500, tiers)).toBe("gold");
    expect(resolveTierKey(4000, tiers)).toBe("platinum");
  });
});
