import { describe, it, expect } from "vitest";
import { isBookingEngineRoute } from "./bookingEngineRoutes";

describe("isBookingEngineRoute", () => {
  it("identifica rotas do motor (independente de maiúsculas)", () => {
    expect(isBookingEngineRoute("/motor/hotel")).toBe(true);
    expect(isBookingEngineRoute("/reservar/slug")).toBe(true);
    expect(isBookingEngineRoute("/categoria/uuid")).toBe(true);
    expect(isBookingEngineRoute("/reserva/123")).toBe(true);
    expect(isBookingEngineRoute("/politica/x")).toBe(true);
  });

  it("rotas do PMS não são tratadas como motor", () => {
    expect(isBookingEngineRoute("/login")).toBe(false);
    expect(isBookingEngineRoute("/estabelecimento-id/dashboard")).toBe(false);
  });
});
