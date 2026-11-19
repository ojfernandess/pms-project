import { describe, expect, it } from "vitest";
import { computePublicQuoteExtras } from "@/lib/publicReservationQuoteFees";

describe("computePublicQuoteExtras", () => {
  const cleaning = {
    id: "c1",
    establishmentId: "e1",
    buildingId: null,
    amount: 50,
    isActive: true,
    serviceFeeId: "sf1",
  };
  const parking = {
    id: "p1",
    establishmentId: "e1",
    buildingId: null,
    amount: 30,
    isActive: true,
    serviceFeeId: "sf2",
    parkingCategoryId: null,
    billingMode: "period" as const,
  };

  it("multiplica taxa de limpeza pelo número de quartos", () => {
    const r = computePublicQuoteExtras({
      lodgingTotal: 400,
      nights: 2,
      flags: { showCleaning: true, showParkingOption: false },
      cleaning,
      parking: null,
      includeParking: false,
      lodgingRoomCount: 3,
    });
    expect(r.cleaningAmount).toBe(150);
    expect(r.grandTotal).toBe(550);
  });

  it("mantém uma limpeza quando há um quarto", () => {
    const r = computePublicQuoteExtras({
      lodgingTotal: 200,
      nights: 1,
      flags: { showCleaning: true, showParkingOption: false },
      cleaning,
      parking: null,
      includeParking: false,
      lodgingRoomCount: 1,
    });
    expect(r.cleaningAmount).toBe(50);
    expect(r.grandTotal).toBe(250);
  });
});