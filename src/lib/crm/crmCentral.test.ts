import { buildCrmCentralPath } from "./crmCentral";
import { getFeatureFromPath } from "@/lib/permissions";

describe("CRM Central etapa 3", () => {
  it("builds central deep-link paths", () => {
    expect(buildCrmCentralPath(12)).toBe("/12/crm/central");
    expect(buildCrmCentralPath(12, { contactId: "c1" })).toBe("/12/crm/central?contactId=c1");
    expect(buildCrmCentralPath("9", { reservationId: "r1", contactId: "c1" })).toBe(
      "/9/crm/central?contactId=c1&reservationId=r1",
    );
  });

  it("maps central route to crm feature", () => {
    expect(getFeatureFromPath("/12/crm/central")).toBe("crm");
  });
});
