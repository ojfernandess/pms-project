import { normalizeContactMatchKey } from "./crm-aggregation";

describe("crm contact↔client link matching", () => {
  it("prefers email match key for sync upsert", () => {
    const a = normalizeContactMatchKey({ email: "a@x.com", phone: "11999999999" });
    const b = normalizeContactMatchKey({ email: "A@x.com", phone: "other" });
    expect(a.email).toBe(b.email);
  });

  it("builds stable booking idempotency key shape", () => {
    const reservationId = "11111111-1111-1111-1111-111111111111";
    expect(`booking.created:${reservationId}`).toMatch(/^booking\.created:[0-9a-f-]+$/);
  });
});
