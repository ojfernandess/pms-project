import { describe, it, expect } from "vitest";
import { zonedLocalDateTimeToUtcIso, formatUtcIsoInHotelTimeZone } from "./hotelTimezoneDate";

describe("hotelTimezoneDate", () => {
  it("converte 23:59 America/Sao_Paulo para UTC (+3h no horário padrão)", () => {
    const iso = zonedLocalDateTimeToUtcIso("2026-11-15", "23:59", "America/Sao_Paulo");
    expect(iso).toBe(new Date(Date.UTC(2026, 10, 16, 2, 59, 0, 0)).toISOString());
    const label = formatUtcIsoInHotelTimeZone(iso, "America/Sao_Paulo");
    expect(label).toBe("15/11/2026 às 23:59");
  });
});