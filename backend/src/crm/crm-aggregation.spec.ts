import { computeLtv, normalizeContactMatchKey, toNumber } from "./crm-aggregation";

describe("crm-aggregation", () => {
  it("toNumber handles strings and null", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(null)).toBe(0);
    expect(toNumber("x")).toBe(0);
  });

  it("computeLtv sums eligible reservations and fees", () => {
    const result = computeLtv([
      { id: "a", status: "confirmed", total_amount: 100, parking_fee: 10 },
      { id: "b", status: "cancelled", total_amount: 999 },
      { id: "c", status: "checked_out", total_amount: "50.5", cleaning_fee: "4.5" },
    ]);
    expect(result.stayCount).toBe(2);
    expect(result.ltv).toBe(165);
    expect(result.averageTicket).toBe(82.5);
    expect(result.eligibleReservationIds).toEqual(["a", "c"]);
  });

  it("normalizeContactMatchKey cleans email/phone/document", () => {
    expect(
      normalizeContactMatchKey({
        email: "  Foo@Bar.com ",
        phone: "(11) 98888-7777",
        document_number: "123.456.789-00",
      }),
    ).toEqual({
      email: "foo@bar.com",
      phone: "11988887777",
      document: "12345678900",
    });
  });
});
